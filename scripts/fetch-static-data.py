"""Download the static reference data the project needs into .local/ (git-ignored).

Sources (see docs/functional-specification.md, 8.8 and 8.9):
  1. GUS TERYT, official TERC register (voivodeships, powiats, gminas) and
     SIMC register (localities), full files from eTeryt, public data;
  2. GeoJSON of Polish voivodeships, powiats and gminas derived from PRG
     (repository waszkiewiczja/GeoJSON-Polska-Wojewodztwa-Powiaty-Gminy,
     README states public domain; PRG itself is CC BY 4.0);
  3. GUS Bank Danych Lokalnych (CC BY 4.0): Małopolska powiat and gmina
     units and the four indicator variables of 8.8. Anonymous limits are
     1 000 calls per 12 hours; put BDL_CLIENT_ID=... in the env file to
     use a registered key. BDL is skipped with a message on HTTP 429.

Derived: .local/derived/malopolska-gminy.csv, one row per gmina of
Małopolska from TERC (seven-digit TERC, name, kind, powiat).
Every run rewrites .local/manifest.json with URLs, dates and licences.

Usage (from the repository root, with the project venv):
  .venv/Scripts/python scripts/fetch-static-data.py [--env .env.dev] [--only teryt,geojson,bdl] [--force]
Existing files are kept unless --force is given.
"""
import argparse, csv, datetime, html, http.cookiejar, io, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, ".local")
UA = "HackYeah2026 social-innovation router (static data fetch; bobrovsky@gmx.ch)"

TERYT_PAGE = "https://eteryt.stat.gov.pl/eTeryt/rejestr_teryt/udostepnianie_danych/baza_teryt/uzytkownicy_indywidualni/pobieranie/pliki_pelne.aspx?contrast=default"
TERYT_FILES = {"TERC_Urzedowy": "ctl00$body$BTERCUrzedowyPobierz", "SIMC_Urzedowy": "ctl00$body$BSIMCUrzedowyPobierz"}

GEOJSON_BASE = "https://raw.githubusercontent.com/waszkiewiczja/GeoJSON-Polska-Wojewodztwa-Powiaty-Gminy/main/"
GEOJSON_FILES = ["readme.md", "wojewodztwa.json", "powiaty.json", "gminy.json"]

BDL_BASE = "https://bdl.stat.gov.pl/api/v1/"
BDL_MALOPOLSKA = "011200000000"
BDL_VARIABLES = {"1548717": "social-assistance", "634989": "ageing", "79214": "unemployment", "288095": "civic-density"}
BDL_YEARS = [2022, 2023, 2024]


def log(msg):
    print(msg, flush=True)


def load_env(path):
    env = {}
    if path and os.path.exists(path):
        for line in io.open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def get(url, headers=None, opener=None, data=None):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, **(headers or {})})
    with (opener or urllib.request.build_opener()).open(req, timeout=120) as r:
        return r.read(), r.headers


def save(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(content)
    log(f"  saved {os.path.relpath(path, ROOT)} ({len(content):,} bytes)")


def fetch_teryt(force, manifest):
    log("TERYT (eTeryt full files)")
    folder = os.path.join(OUT, "teryt")
    todo = {k: v for k, v in TERYT_FILES.items() if force or not os.path.isdir(os.path.join(folder, k))}
    if not todo:
        log("  present, skipped")
        return
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    for name, target in todo.items():
        page, _ = get(TERYT_PAGE, opener=opener)
        fields = {m.group(1): html.unescape(m.group(2)) for m in re.finditer(
            r'<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', page.decode("utf-8", "replace"))}
        fields.update({"__EVENTTARGET": target, "__EVENTARGUMENT": ""})
        body, headers = get(TERYT_PAGE, opener=opener, data=urllib.parse.urlencode(fields).encode(),
                            headers={"Content-Type": "application/x-www-form-urlencoded", "Referer": TERYT_PAGE})
        if not body.startswith(b"PK"):
            raise RuntimeError(f"{name}: expected a zip, got {headers.get('Content-Type')}")
        disp = headers.get("Content-Disposition", "")
        fname = (re.search(r'filename="?([^";]+)', disp) or [None, f"{name}.zip"])[1]
        save(os.path.join(folder, fname), body)
        with zipfile.ZipFile(io.BytesIO(body)) as z:
            z.extractall(os.path.join(folder, name))
            log(f"  extracted {', '.join(z.namelist())}")
        manifest["teryt/" + name] = {"source": TERYT_PAGE, "file": fname, "licence": "public data (GUS TERYT)"}
        time.sleep(2)


def derive_malopolska(manifest):
    folder = os.path.join(OUT, "teryt", "TERC_Urzedowy")
    csvs = [f for f in os.listdir(folder) if f.lower().endswith(".csv")] if os.path.isdir(folder) else []
    if not csvs:
        log("  no TERC CSV, derived list skipped")
        return
    raw = open(os.path.join(folder, csvs[0]), "rb").read().decode("utf-8-sig")
    rows = list(csv.DictReader(io.StringIO(raw), delimiter=";"))
    mp = [r for r in rows if r["WOJ"] == "12"]
    powiats = {r["POW"]: r["NAZWA"] for r in mp if r["POW"] and not r["GMI"]}
    gminas = [r for r in mp if r["GMI"]]
    # Kinds 1, 2, 3 are the gminas themselves; 4, 5 are the town and rural parts; 8, 9 are districts.
    out = io.StringIO()
    w = csv.writer(out, delimiter=";", lineterminator="\n")
    w.writerow(["terc", "name", "rodz", "kind", "powiat_code", "powiat_name", "stan_na"])
    n = 0
    for r in gminas:
        if r["RODZ"] in ("1", "2", "3"):
            w.writerow([r["WOJ"] + r["POW"] + r["GMI"] + r["RODZ"], r["NAZWA"], r["RODZ"], r["NAZWA_DOD"],
                        r["WOJ"] + r["POW"], powiats.get(r["POW"], ""), r["STAN_NA"]])
            n += 1
    save(os.path.join(OUT, "derived", "malopolska-gminy.csv"), out.getvalue().encode("utf-8"))
    log(f"  {n} gminas of Małopolska, {len(powiats)} powiats")
    manifest["derived/malopolska-gminy.csv"] = {"from": "teryt/TERC_Urzedowy", "gminas": n, "powiats": len(powiats)}


def fetch_geojson(force, manifest):
    log("GeoJSON boundaries (PRG-derived)")
    for f in GEOJSON_FILES:
        path = os.path.join(OUT, "geojson", f)
        if os.path.exists(path) and not force:
            log(f"  {f} present, skipped")
            continue
        body, _ = get(GEOJSON_BASE + f)
        save(path, body)
        manifest["geojson/" + f] = {"source": GEOJSON_BASE + f,
                                    "licence": "public domain per README; PRG underlying data CC BY 4.0 (dane.gov.pl)"}


def bdl_get_all(path, params, headers):
    # A list value (the years) is sent as a repeated parameter.
    pairs = [(k, v) for k, vs in params.items() for v in (vs if isinstance(vs, list) else [vs])]
    rows, page = [], 0
    while True:
        q = pairs + [("format", "json"), ("page-size", 100), ("page", page)]
        body, _ = get(BDL_BASE + path + "?" + urllib.parse.urlencode(q), headers=headers)
        data = json.loads(body)
        rows += data.get("results", [])
        if not data.get("links", {}).get("next"):
            return rows
        page += 1
        time.sleep(0.3)


def fetch_bdl(force, manifest, client_id):
    log("GUS BDL (units and indicators)" + ("" if client_id else ", anonymous"))
    headers = {"X-ClientId": client_id} if client_id else {}
    folder = os.path.join(OUT, "bdl")
    jobs = [("units-powiaty.json", "units", {"parent-id": BDL_MALOPOLSKA, "level": 5}),
            ("units-gminy.json", "units", {"parent-id": BDL_MALOPOLSKA, "level": 6})]
    for var, slug in BDL_VARIABLES.items():
        jobs.append((f"var-{var}-{slug}.json", "data/by-variable/" + var,
                     {"unit-level": 6, "unit-parent-id": BDL_MALOPOLSKA, "year": BDL_YEARS}))
        jobs.append((f"var-{var}-{slug}.meta.json", "variables/" + var, {}))
    for fname, path, params in jobs:
        target = os.path.join(folder, fname)
        if os.path.exists(target) and not force:
            log(f"  {fname} present, skipped")
            continue
        try:
            if path.startswith("variables/"):
                body, _ = get(BDL_BASE + path + "?format=json", headers=headers)
                result = json.loads(body)
            else:
                result = bdl_get_all(path, params, headers)
            save(target, json.dumps(result, ensure_ascii=False, indent=1).encode("utf-8"))
            manifest["bdl/" + fname] = {"source": BDL_BASE + path, "params": params, "licence": "CC BY 4.0 (GUS BDL)"}
            time.sleep(0.3)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                log(f"  HTTP 429, BDL limit reached: {e.read().decode('utf-8', 'replace').strip()[:200]}")
                log("  set BDL_CLIENT_ID in the env file (free key: https://api.stat.gov.pl/Home/BdlApi) and re-run with --only bdl")
                return
            raise


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--env", default=".env.dev")
    ap.add_argument("--only", default="teryt,geojson,bdl")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    only = set(a.only.split(","))
    env = load_env(os.path.join(ROOT, a.env))
    mpath = os.path.join(OUT, "manifest.json")
    manifest = json.load(open(mpath, encoding="utf-8")) if os.path.exists(mpath) else {}
    failed = []
    for key, fn in [("teryt", lambda: fetch_teryt(a.force, manifest)),
                    ("geojson", lambda: fetch_geojson(a.force, manifest)),
                    ("bdl", lambda: fetch_bdl(a.force, manifest, env.get("BDL_CLIENT_ID") or os.environ.get("BDL_CLIENT_ID")))]:
        if key in only:
            try:
                fn()
            except Exception as e:
                failed.append(key)
                log(f"  FAILED: {e}")
    if "teryt" in only:
        derive_malopolska(manifest)
    manifest["_updated"] = datetime.datetime.now().isoformat(timespec="seconds")
    os.makedirs(OUT, exist_ok=True)
    with open(mpath, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    log("done" + (f", failed: {', '.join(failed)}" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
