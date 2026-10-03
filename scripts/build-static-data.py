"""Build the static data files the app serves from the downloads of fetch-static-data.py.

Inputs (.local/, git-ignored, written by scripts/fetch-static-data.py):
  .local/teryt/TERC_Urzedowy/TERC_Urzedowy_<date>.csv   GUS TERYT, the TERC register (public data)
  .local/geojson/gminy.json                             gminas of Poland derived from PRG
                                                        (repository README: public domain; PRG: CC BY 4.0)
  .local/bdl/units-gminy.json                           GUS Bank Danych Lokalnych, CC BY 4.0
  .local/bdl/var-<id>-<key>.json, .meta.json            the four indicator variables of spec 8.8

Outputs (data/, build outputs, git-ignored; spec 8.8 and 8.9):
  data/places/pl-register.json        every voivodeship, powiat and gmina of Poland: code PL-12,
                                      PL-12-07, PL-12-07-132, the seven-digit TERC, names, the
                                      picker label of the gminas and their centroid (lon, lat)
  data/map/malopolska-gminy.geojson   the 183 gminas of Malopolska simplified with mapshaper
                                      (spec 8.8), properties JPT_KOD_JE, JPT_NAZWA_, kind, powiat
  data/indicators.json                the four indicators per gmina of Malopolska, the latest year
                                      with a value, the BDL flag, the Malopolska median per indicator
  data/implementations-derived.json   place-of-origin implementations (spec 8.6, source catalogue-origin):
                                      origin_place_pl of every built record in data/innovations matched to
                                      a gmina of the register (town preferred among namesakes) or to a
                                      unique SIMC locality; unmatched places listed. Needs the records built
                                      by derive-records.py build and the SIMC register in .local/teryt.

Usage (from the repository root, with the project venv):
  .venv/Scripts/python scripts/build-static-data.py [--only places,map,indicators,origins] [--simplify 10%]
The map step runs mapshaper through npx (Node.js); pin: MAPSHAPER below.
The build is idempotent: the same inputs give the same outputs.
"""
import argparse, collections, csv, datetime, glob, io, json, os, re, shutil, statistics, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL = os.path.join(ROOT, ".local")
DATA = os.path.join(ROOT, "data")

MAPSHAPER = "mapshaper@0.7.70"
MALOPOLSKA = "12"
GMINA_KINDS = {"1": "gmina miejska", "2": "gmina wiejska", "3": "gmina miejsko-wiejska"}

# Spec 8.8: variable id, dataset name, year. The key is the name used in the app.
BDL_VARIABLES = [
    ("social-assistance", "1548717"),
    ("ageing", "634989"),
    ("unemployment", "79214"),
    ("civic-density", "288095"),
]
# Spec 8.8, "Gdzie jest najbardziej potrzebna": which indicators express need per target group.
NEED_BY_TARGET_GROUP = {
    "seniorzy": ["ageing"],
    "ograniczona-mobilnosc": ["ageing"],
    "bezdomnosc": ["social-assistance", "unemployment"],
    "rynek-pracy": ["social-assistance", "unemployment"],
    "dzieci-mlodziez-rodziny": ["social-assistance", "unemployment"],
    "default": ["social-assistance"],
}
# GUS BDL /attributes. Ids 0 and 1 are plain values.
BDL_ATTRIBUTES = {
    3: ("k", "Agregat może być niekompletny"),
    4: ("x", "Brak informacji, konieczność zachowania tajemnicy statystycznej lub wypełnienie pozycji jest niemożliwe albo niecelowe"),
    7: ("a", "Wartość mniejsza niż przyjęty format prezentacji"),
    9: ("s", "Szacunki wstępne"),
    11: ("M", "Zmiany metodologiczne"),
    13: ("K", "Zmiany metodologiczne, agregat może być niekompletny"),
    14: ("X", "Zmiany metodologiczne, brak informacji"),
    15: ("-", "Brak informacji z powodu zmiany poziomu prezentacji lub wykazu jednostek"),
    17: ("A", "Zmiany metodologiczne, wartość mniejsza niż przyjęty format prezentacji"),
    20: ("v", "Dane o niskiej precyzji"),
    21: ("v", "Dane o niskiej precyzji"),
    50: ("n", "Dana jeszcze niedostępna"),
    91: ("x", "Brak informacji, konieczność zachowania tajemnicy statystycznej"),
    94: ("z", "Wartość zerowa wynika z bilansu niezerowych danych wejściowych"),
    97: ("p", "Łącznie dla powiatu i miasta na prawach powiatu"),
    98: ("Z", "Zmiany metodologiczne, wartość zerowa wynika z bilansu danych wejściowych"),
}


def log(msg):
    print(msg, flush=True)


def write_json_lines(path, head, key, items, tail=None, keyed_by=None):
    """One item per line, so diffs and greps stay readable. Deterministic.
    With keyed_by, the body is an object keyed by that field of each item."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    dumps = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("{\n")
        for k, v in head.items():
            f.write(f"{dumps(k)}: {dumps(v)},\n")
        f.write(f"{dumps(key)}: " + ("{\n" if keyed_by else "[\n"))
        for i, it in enumerate(items):
            line = f"{dumps(it[keyed_by])}: {dumps(it)}" if keyed_by else dumps(it)
            f.write("  " + line + (",\n" if i < len(items) - 1 else "\n"))
        f.write("}" if keyed_by else "]")
        for k, v in (tail or {}).items():
            f.write(f",\n{dumps(k)}: {dumps(v)}")
        f.write("\n}\n")


# ---------------------------------------------------------------- TERC register

def read_terc():
    files = sorted(glob.glob(os.path.join(LOCAL, "teryt", "TERC_Urzedowy", "TERC_Urzedowy_*.csv")))
    if not files:
        sys.exit("no TERC file in .local/teryt/TERC_Urzedowy; run scripts/fetch-static-data.py --only teryt")
    path = files[-1]
    retrieved = os.path.basename(path)[len("TERC_Urzedowy_"):-4]
    with open(path, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f, delimiter=";"))
    return rows, retrieved


def build_places_index(rows):
    """Voivodeships, powiats and gminas (kinds 1, 2, 3) as dicts keyed by TERC."""
    voiv, pow_, gmi = {}, {}, {}
    for r in rows:
        if not r["POW"]:
            voiv[r["WOJ"]] = r
        elif not r["GMI"]:
            pow_[r["WOJ"] + r["POW"]] = r
        elif r["RODZ"] in GMINA_KINDS:
            gmi[r["WOJ"] + r["POW"] + r["GMI"] + r["RODZ"]] = r
    return voiv, pow_, gmi


def read_geojson_centroids():
    """Area-weighted centroid (lon, lat) of every gmina polygon in the national file."""
    path = os.path.join(LOCAL, "geojson", "gminy.json")
    if not os.path.exists(path):
        sys.exit("no .local/geojson/gminy.json; run scripts/fetch-static-data.py --only geojson")
    with open(path, encoding="utf-8") as f:
        g = json.load(f)
    out = {}
    for feat in g["features"]:
        geom = feat["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        area_sum = cx_sum = cy_sum = 0.0
        for poly in polys:
            ring = poly[0]
            a = cx = cy = 0.0
            for i in range(len(ring) - 1):
                x0, y0 = ring[i][0], ring[i][1]
                x1, y1 = ring[i + 1][0], ring[i + 1][1]
                cross = x0 * y1 - x1 * y0
                a += cross
                cx += (x0 + x1) * cross
                cy += (y0 + y1) * cross
            if a == 0:
                continue
            a *= 0.5
            w = abs(a)
            area_sum += w
            cx_sum += w * (cx / (6 * a))
            cy_sum += w * (cy / (6 * a))
        if area_sum:
            out[feat["properties"]["JPT_KOD_JE"]] = [round(cx_sum / area_sum, 4), round(cy_sum / area_sum, 4)]
    return g, out


def build_places(rows, retrieved, centroids):
    voiv, pow_, gmi = build_places_index(rows)
    places = []
    for woj, r in sorted(voiv.items()):
        places.append({"code": f"PL-{woj}", "terc": woj, "level": "wojewodztwo",
                       "name": r["NAZWA"].lower(), "parent": None})
    for code, r in sorted(pow_.items()):
        places.append({"code": f"PL-{code[:2]}-{code[2:]}", "terc": code, "level": "powiat",
                       "name": r["NAZWA"], "kind": r["NAZWA_DOD"], "parent": f"PL-{code[:2]}"})
    # A gmina name repeated inside one powiat (town and rural gmina) gets its kind in the label.
    siblings = {}
    for code, r in gmi.items():
        siblings.setdefault((code[:4], r["NAZWA"]), []).append(code)
    for code, r in sorted(gmi.items()):
        p = pow_[code[:4]]
        kind = GMINA_KINDS[r["RODZ"]]
        name = r["NAZWA"]
        label_name = f"{name}, {kind}" if len(siblings[(code[:4], name)]) > 1 else name
        where = "miasto na prawach powiatu" if p["NAZWA_DOD"] == "miasto na prawach powiatu" else f"powiat {p['NAZWA']}"
        place = {"code": f"PL-{code[:2]}-{code[2:4]}-{code[4:]}", "terc": code, "level": "gmina",
                 "name": name, "kind": kind, "parent": f"PL-{code[:2]}-{code[2:4]}",
                 "powiat": p["NAZWA"], "wojewodztwo": voiv[code[:2]]["NAZWA"].lower(),
                 "label": f"{label_name} ({where})"}
        # A gmina that changed its legal form after the map was published (the last digit of
        # the TERC) keeps its boundary: fall back to the map's code with the same six digits.
        c = centroids.get(code) or next((v for k, v in centroids.items() if k[:6] == code[:6]), None)
        if c:
            place["centroid"] = c
        places.append(place)
    stan_na = rows[0]["STAN_NA"]
    counts = {"wojewodztwa": len(voiv), "powiaty": len(pow_), "gminy": len(gmi)}
    head = {
        "source": "GUS TERYT, rejestr TERC (dane publiczne), https://eteryt.stat.gov.pl/",
        "stan_na": stan_na,
        "retrieved_at": retrieved,
        "centroids": "GeoJSON gmin z PRG (repozytorium waszkiewiczja/GeoJSON-Polska-Wojewodztwa-Powiaty-Gminy, domena publiczna; PRG CC BY 4.0), centroid ważony polem, WGS 84 [lon, lat]",
        "codes": "PL-<woj>, PL-<woj>-<pow>, PL-<woj>-<pow>-<gmi><rodz>; TERC = kod bez PL- i myślników",
        "counts": counts,
    }
    write_json_lines(os.path.join(DATA, "places", "pl-register.json"), head, "places", places)
    mal = [p for p in places if p["terc"].startswith(MALOPOLSKA)]
    no_centroid = [p["terc"] for p in places if p["level"] == "gmina" and "centroid" not in p]
    log(f"places: {len(places)} places ({counts}), {len(mal)} in Malopolska, "
        f"{len(no_centroid)} gminas without centroid{': ' + ', '.join(no_centroid) if no_centroid else ''}")
    return gmi, pow_


# ------------------------------------------------------------------------ map

def build_map(geojson, gmi, pow_, simplify):
    feats = [f for f in geojson["features"] if f["properties"]["JPT_KOD_JE"].startswith(MALOPOLSKA)]
    reg = {c for c in gmi if c.startswith(MALOPOLSKA)}
    got = {f["properties"]["JPT_KOD_JE"] for f in feats}
    if reg != got:
        log(f"map: WARNING TERC register and GeoJSON differ: only in register {sorted(reg - got)}, only in GeoJSON {sorted(got - reg)}")
    npx = shutil.which("npx")
    if not npx and simplify:
        sys.exit("npx not found; install Node.js or pass --simplify none")
    tmp = tempfile.mkdtemp(prefix="map-")
    src = os.path.join(tmp, "malopolska-gminy.json")
    with open(src, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f)
    if simplify:
        dst = os.path.join(tmp, "out.json")
        cmd = [npx, "-y", MAPSHAPER, src, "-simplify", simplify, "keep-shapes",
               "-o", dst, "format=geojson", "precision=0.0001"]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit("mapshaper failed:\n" + r.stdout + r.stderr)
        with open(dst, encoding="utf-8") as f:
            out = json.load(f)
    else:
        out = {"type": "FeatureCollection", "features": feats}
        for f in out["features"]:
            f["geometry"]["coordinates"] = _round(f["geometry"]["coordinates"])
    shutil.rmtree(tmp, ignore_errors=True)
    features = []
    for f in sorted(out["features"], key=lambda x: x["properties"]["JPT_KOD_JE"]):
        code = f["properties"]["JPT_KOD_JE"]
        r = gmi.get(code)
        props = {"JPT_KOD_JE": code, "JPT_NAZWA_": f["properties"]["JPT_NAZWA_"]}
        if r:
            props["kind"] = GMINA_KINDS[r["RODZ"]]
            props["powiat"] = pow_[code[:4]]["NAZWA"]
        features.append({"type": "Feature", "properties": props, "geometry": f["geometry"]})
    path = os.path.join(DATA, "map", "malopolska-gminy.geojson")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    dumps = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write('{"type":"FeatureCollection",\n')
        f.write('"source":"PRG (CC BY 4.0) via waszkiewiczja/GeoJSON-Polska-Wojewodztwa-Powiaty-Gminy (public domain); '
                f'simplified with {MAPSHAPER} {simplify or "none"} keep-shapes, precision 0.0001",\n')
        f.write('"features":[\n')
        for i, feat in enumerate(features):
            f.write(dumps(feat) + (",\n" if i < len(features) - 1 else "\n"))
        f.write("]}\n")
    log(f"map: {len(features)} gminas, {os.path.getsize(path) // 1024} KB")


def _round(coords):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], 4), round(coords[1], 4)]
    return [_round(c) for c in coords]


# ------------------------------------------------------------------ indicators

def bdl_terc(unit_id):
    """'011212001011' -> '1201011' (spec 8.8)."""
    return unit_id[2:4] + unit_id[7:12]


def build_indicators(gmi, pow_):
    folder = os.path.join(LOCAL, "bdl")
    if not os.path.isdir(folder):
        sys.exit("no .local/bdl; run scripts/fetch-static-data.py --only bdl with BDL_CLIENT_ID set")
    region = {c: r for c, r in gmi.items() if c.startswith(MALOPOLSKA)}
    indicators, per_gmina, missing = [], {c: {} for c in region}, {}
    retrieved = None
    for key, var in BDL_VARIABLES:
        path = os.path.join(folder, f"var-{var}-{key}.json")
        meta_path = path[:-5] + ".meta.json"
        if not os.path.exists(path):
            sys.exit(f"missing {path}")
        mtime = datetime.date.fromtimestamp(os.path.getmtime(path)).isoformat()
        retrieved = max(retrieved or mtime, mtime)
        with open(path, encoding="utf-8") as f:
            rows = json.load(f)
        meta = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else {}
        # The BDL keeps a unit id per legal form; a gmina that changed form has two rows. Key by
        # the TERC of the current register and take the latest year with a value.
        by_terc = {}
        for row in rows:
            if row["id"][-1] not in "123":
                continue
            by_terc.setdefault(bdl_terc(row["id"]), []).extend(row["values"])
        values = []
        for terc in region:
            best = None
            for v in by_terc.get(terc, []):
                if v.get("val") is None:
                    continue
                if best is None or int(v["year"]) > int(best["year"]):
                    best = v
            if best is None:
                missing.setdefault(terc, []).append(key)
                continue
            attr = int(best.get("attrId", 0))
            entry = {"value": best["val"], "year": int(best["year"])}
            if attr in BDL_ATTRIBUTES:
                entry["flag"], entry["flag_pl"] = BDL_ATTRIBUTES[attr]
            per_gmina[terc][key] = entry
            values.append(best["val"])
        years = sorted({e["year"] for g in per_gmina.values() for k, e in g.items() if k == key})
        indicators.append({
            "key": key, "variable_id": int(var),
            "name_pl": meta.get("n1"), "unit_pl": meta.get("measureUnitName"),
            "subject_id": meta.get("subjectId"),
            "year": years[-1] if years else None, "years_used": years,
            "gminas_with_value": len(values),
            "median": round(statistics.median(values), 2) if values else None,
            "min": min(values) if values else None, "max": max(values) if values else None,
        })
    gminas = []
    for terc in sorted(region):
        r = region[terc]
        gminas.append({"terc": terc, "name": r["NAZWA"], "kind": GMINA_KINDS[r["RODZ"]],
                       "powiat": pow_[terc[:4]]["NAZWA"], "values": per_gmina[terc]})
    head = {
        "source": {"name": "GUS Bank Danych Lokalnych", "url": "https://bdl.stat.gov.pl/api/v1/",
                   "licence": "CC BY 4.0", "retrieved_at": retrieved,
                   "unit_parent_id": "011200000000", "unit_level": 6},
        "note": "value: the latest year with a value among the fetched years; flag: the BDL attribute symbol when the value is not plain; median over the gminas with a value",
        "indicators": indicators,
        "need_by_target_group": NEED_BY_TARGET_GROUP,
    }
    tail = {"missing": {t: sorted(ks) for t, ks in sorted(missing.items())}}
    write_json_lines(os.path.join(DATA, "indicators.json"), head, "gminas", gminas, tail, keyed_by="terc")
    summary = ", ".join(f"{i['key']} {i['gminas_with_value']}/{len(region)} (year {i['year']}, median {i['median']})" for i in indicators)
    log(f"indicators: {summary}")
    for terc, ks in sorted(missing.items()):
        log(f"indicators: WARNING {terc} {region[terc]['NAZWA']} has no value for {', '.join(ks)}")


# -------------------------------------------------------------------- origins

PLACE_SPLIT = re.compile(r"\s*,\s*|\s+i\s+|\s+oraz\s+")
ORIGIN_NOTE_PL = "Miejsce pochodzenia innowacji według katalogu: siedziba innowatora w czasie testowania."


def read_simc():
    """Localities of Poland (GUS SIMC): lower-case name -> set of gmina TERC codes."""
    files = sorted(glob.glob(os.path.join(LOCAL, "teryt", "SIMC_Urzedowy", "SIMC_Urzedowy_*.csv")))
    if not files:
        sys.exit("no SIMC file in .local/teryt/SIMC_Urzedowy; run scripts/fetch-static-data.py --only teryt")
    out = collections.defaultdict(set)
    with open(files[-1], encoding="utf-8-sig") as f:
        for r in csv.DictReader(f, delimiter=";"):
            rodz = r["RODZ_GMI"]
            if rodz in ("8", "9"):          # districts of Warsaw, delegatury of Krakow, Lodz, Poznan, Wroclaw
                out[r["NAZWA"].lower()].add(r["WOJ"] + r["POW"] + "011")
                continue
            if rodz in ("4", "5"):          # town or rural part of an urban-rural gmina
                rodz = "3"
            out[r["NAZWA"].lower()].add(r["WOJ"] + r["POW"] + r["GMI"] + rodz)
    return out


def match_place(name, gminas_by_name, simc):
    """(terc, how) for a place name, or (None, reason)."""
    key = name.lower().strip()
    cands = gminas_by_name.get(key, [])
    if cands:
        if len(cands) == 1:
            return cands[0]["terc"], "gmina"
        if len({c["parent"] for c in cands}) == 1:      # town and rural gmina of one name in one powiat
            town = [c for c in cands if c["kind"] == "gmina miejska"] or cands
            return town[0]["terc"], "gmina, town preferred"
        cities = [c for c in cands if c["kind"] == "gmina miejska"]
        if len(cities) == 1:
            return cities[0]["terc"], "gmina, city preferred among namesakes"
        return None, "ambiguous gmina name: " + "; ".join(c["label"] for c in cands)
    codes = simc.get(key, set())
    if len(codes) == 1:
        return next(iter(codes)), "locality"
    if codes:
        return None, f"ambiguous locality, in {len(codes)} gminas"
    return None, "not found"


def build_origins():
    files = sorted(glob.glob(os.path.join(DATA, "innovations", "*.json")))
    if not files:
        log("origins: skipped, no data/innovations (run derive-records.py build first)")
        return
    reg_path = os.path.join(DATA, "places", "pl-register.json")
    if not os.path.exists(reg_path):
        sys.exit("origins: no data/places/pl-register.json; run the places step first")
    with open(reg_path, encoding="utf-8") as f:
        register = json.load(f)["places"]
    by_name = collections.defaultdict(list)
    for p in register:
        if p["level"] == "gmina":
            by_name[p["name"].lower()].append(p)
    simc = read_simc()
    version_path = os.path.join(DATA, "data-version.json")
    version = json.load(open(version_path, encoding="utf-8"))["version"] if os.path.exists(version_path) else None
    items, unmatched = [], []
    for path in files:
        with open(path, encoding="utf-8") as f:
            r = json.load(f)
        place = (r.get("derived") or {}).get("origin_place_pl")
        if not place:
            continue
        parts = [p for p in PLACE_SPLIT.split(re.sub(r"\s*\([^)]*\)", "", place)) if p.strip()]
        years = (r.get("origin") or {}).get("incubator_years") or ""
        year = int(years[-4:]) if re.search(r"\d{4}$", years) else None
        for k, part in enumerate(parts):
            terc, how = match_place(part, by_name, simc)
            if terc is None:
                unmatched.append({"innovation_id": r["id"], "place": part, "reason": how})
                continue
            items.append({
                "id": f"impl-origin-{r['id']}" + (f"-{k + 1}" if len(parts) > 1 else ""),
                "innovation_id": r["id"], "place_terc": terc, "place_name": part, "match": how,
                "year": year, "status": "completed", "source": "catalogue-origin",
                "source_url": r["sources"][0]["url"], "note_pl": ORIGIN_NOTE_PL,
            })
    head = {
        "note": "Implementations derived from the place of origin named in the catalogue (spec 8.6, source catalogue-origin); "
                "hand-written seeds are in data/implementations.yaml. match: how the place was resolved.",
        "data_version": version,
        "matching": "gmina name of the TERC register (the town preferred among namesakes), else a unique SIMC locality",
    }
    write_json_lines(os.path.join(DATA, "implementations-derived.json"), head, "implementations", items,
                     {"unmatched": unmatched})
    inns = {i["innovation_id"] for i in items}
    mal = {i["innovation_id"] for i in items if i["place_terc"].startswith(MALOPOLSKA)}
    log(f"origins: {len(items)} implementations for {len(inns)} innovations ({len(mal)} innovations placed in Malopolska), "
        f"{len(unmatched)} places unmatched")
    for u in unmatched:
        log(f"origins: unmatched {u['innovation_id']}: {u['place']} ({u['reason']})")


# ----------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", default="places,map,indicators,origins")
    ap.add_argument("--simplify", default="10%", help="mapshaper simplify argument, or 'none'")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    steps = {s.strip() for s in a.only.split(",")}
    simplify = None if a.simplify.lower() == "none" else a.simplify
    rows, retrieved = read_terc()
    geojson, centroids = read_geojson_centroids()
    voiv, pow_, gmi = build_places_index(rows)
    if "places" in steps:
        build_places(rows, retrieved, centroids)
    if "map" in steps:
        build_map(geojson, gmi, pow_, simplify)
    if "indicators" in steps:
        build_indicators(gmi, pow_)
    if "origins" in steps:
        build_origins()


if __name__ == "__main__":
    main()
