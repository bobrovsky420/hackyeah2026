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
  data/organisations.json             innovator organisations of the built records (source catalogue) and the
                                      implementers of data/implementations.yaml (source seed): id, name, type
                                      (implementer_types, from the name), website, seat, innovation and
                                      implementation ids; natural persons listed by innovation id only, no names;
                                      no contact data (spec FR-6.1, R6).
  data/implementations-merged.json    the seeds of data/implementations.yaml and the origins of
                                      implementations-derived.json with organisation_id and origin_file; an
                                      origin covered by a seed for the same innovation and gmina is dropped
                                      (spec 8.6, FR-6.3). Needs PyYAML.

Usage (from the repository root, with the project venv):
  .venv/Scripts/python scripts/build-static-data.py [--only places,map,indicators,origins,organisations] [--simplify 10%]
The map step runs mapshaper through npx (Node.js); pin: MAPSHAPER below.
The build is idempotent: the same inputs give the same outputs.
"""
import argparse, collections, csv, datetime, difflib, glob, io, json, os, re, shutil, statistics, subprocess, sys, tempfile, unicodedata

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
    register, by_name = read_register()
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


# -------------------------------------------------------------- organisations

ORG_QUOTES = re.compile(r"[„”“\"«»‘’'`]")
LEGAL_FORMS = re.compile(r"\bsp\.?\s*z\.?\s*o\.?\s*o\b\.?|\bspółka z ograniczoną odpowiedzialnością\b|"
                         r"\bs\.\s?a\b\.?(?=\s|$)|\bs\.\s?c\b\.?(?=\s|$)", re.I)
# Implementer type from the organisation's name (data/taxonomies.json implementer_types). First match wins:
# the legal form of a company first, then the association words, then social assistance, then local government.
ORG_TYPE_RULES = [
    ("firma-pes", re.compile(r"\bsp\.?\s*z\.?\s*o\.?\s*o\b|\bs\.\s?a\b\.?(?=\s|$)|\bs\.\s?c\b\.?(?=\s|$)|\bspółk|"
                             r"\bspółdzielni|przedsiębiorstwo społeczne")),
    ("ngo", re.compile(r"\bfu?n?dacj|\bstowarzysz|\bzwiąz|\btowarzystw|\bfederacj|\bcaritas\b")),
    ("ops-cus-pcpr", re.compile(r"\b[mg]?ops\b|\bmopr\b|\bcus\b|\bpcpr\b|ośrod\w* pomocy|centrum usług społecznych|"
                                r"pomocy rodzinie")),
    ("jst", re.compile(r"\bgmin|\burz[ąę]d|\bstarostw|\bpowiat")),
    ("placowka", re.compile(r"\bszkoł|\bszkol|\bprzedszkol|\bbibliotek|\bdps\b|\bś?sds\b|\bśds\b|\bwtz\b|dom pomocy|"
                            r"środowiskowy dom|warsztat\w* terapii|\buniwersytet|\buczelni|\bakademi|\bpolitechnik|"
                            r"\bszpital|\bspzoz\b|\bprzychodni|\bmuzeum|dom kultury|centrum kultury|ośrodek kultury|"
                            r"\bplacówk")),
]
# Common Polish first names in the nominative: a name "Firstname Surname" in an organisation's name marks a
# person (a sole trader, or authors listed with the organisation). Patrons ("im. Jana Matejki") are removed
# first; female names equal to the genitive of a male name (Józefa, Stanisława) are left out.
FIRST_NAMES = set("""
ada adela alina amelia anastazja andżelika angelika antonina aurelia bogna bogumiła dagmara daria diana eliza
elwira felicja gabriela genowefa helena honorata iga irmina jagoda janina judyta julita karina klara kornelia
larysa laura lena lidia liliana lilianna ludmiła łucja maja mariola marianna marlena matylda michalina nadia
natasza nina olga otylia regina roksana sabina sara stefania tamara tatiana wioletta zuzanna żaneta
aleksander antoni arkadiusz bogdan bogumił cezary dominik emil eryk eugeniusz fabian franciszek gabriel ignacy
ireneusz julian kacper krystian lech leon lucjan marcel maksymilian miłosz olaf remigiusz seweryn stefan
sylwester tymoteusz wiktor witold zenon zygmunt
anna maria katarzyna małgorzata agnieszka barbara ewa krystyna elżbieta magdalena joanna zofia monika teresa
danuta natalia karolina marta beata dorota aleksandra halina jadwiga irena alicja jolanta iwona grażyna paulina
justyna urszula renata sylwia agata julia marzena izabela weronika wiktoria patrycja hanna emilia dominika kinga
martyna edyta bożena celina lucyna wanda aneta ilona kamila klaudia oliwia sandra milena adrianna ewelina
jan andrzej piotr krzysztof stanisław tomasz paweł józef marcin marek michał grzegorz jerzy tadeusz adam łukasz
zbigniew ryszard dariusz henryk mariusz kazimierz wojciech robert mateusz marian rafał jacek janusz mirosław
maciej sławomir jarosław kamil wiesław roman władysław jakub artur zdzisław edward mieczysław damian dawid
przemysław sebastian czesław leszek daniel waldemar gracjan bartosz szymon karol patryk konrad radosław filip
igor oskar hubert norbert
""".split())
_CAP = r"[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+(?:-[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+)?"
PERSON_ONE = re.compile(rf"({_CAP})\s+{_CAP}(?:\s+{_CAP})?")
PERSON_IN_NAME = re.compile(rf"(?=\b({_CAP})\s+{_CAP})")
PATRON = re.compile(r"\bim\.\s+(?:(?:ks|prof|dr|św|bł|gen|kard|abp|bp|o|hr)\.\s+)*"
                    r"(?:[A-ZĄĆĘŁŃÓŚŹŻ][\w.-]*\s*(?:i\s+)?){1,4}")
CONTACT_PATTERNS = [
    ("e-mail", re.compile(r"[\w.+-]+@[\w-]+\.[a-z]{2,}", re.I)),
    ("phone", re.compile(r"(?<![\d/])(?:\+48[\s-]?)?\d{3}[\s-]\d{3}[\s-]\d{3}(?!\d)|(?<![\d/])\(?\d{2}\)?\s\d{3}[\s-]\d{2}[\s-]\d{2}(?!\d)")),
    ("postal address", re.compile(r"\b\d{2}-\d{3}\b|\bul\.\s")),
]
NATURAL_PERSON_REASONS = {
    "osoba-fizyczna": "innovator.type Osoba fizyczna",
    "grupa-nieformalna": "innovator.type Grupa nieformalna (a group of natural persons)",
    "person-name": "the organisation's name is a person's name (a sole trader)",
    "authors-persons-only": "no organisation named; the authors are people (persons_public)",
}


def is_person(seg):
    """True when a name segment lists only people: 'Anna Nowak', 'Anna Nowak i Jan Kowalski'."""
    parts = [p for p in re.split(r"\s*,\s*|\s+i\s+|\s+oraz\s+", seg.strip()) if p]
    return bool(parts) and all((m := PERSON_ONE.fullmatch(p)) and m.group(1).lower() in FIRST_NAMES for p in parts)


def clean_org_name(name):
    """(organisation name without the people listed with it, the surnames of the people removed)."""
    s = re.sub(r"\s+", " ", name).strip().rstrip(":;, ").strip()
    removed = []
    m = re.fullmatch(r"(.*?)\s*\(([^()]*)\)", s)
    if m:
        outside, inside = m.group(1).strip(), m.group(2).strip()
        if outside and is_person(inside):
            s, removed = outside, removed + [inside]
        elif inside and is_person(outside):
            s, removed = inside, removed + [outside]
    parts = re.split(r"(\s*[;,:]\s*|\s+[-\u2013]\s+)", s)
    segs, seps = parts[0::2], parts[1::2]
    while len(segs) > 1 and is_person(segs[0]):
        removed.append(segs.pop(0))
        seps.pop(0)
    while len(segs) > 1 and is_person(segs[-1]):
        removed.append(segs.pop())
        seps.pop()
    s = "".join(seg + (seps[i] if i < len(seps) else "") for i, seg in enumerate(segs)).strip().rstrip(":;, ")
    surnames = {p.split()[-1].lower() for seg in removed
                for p in re.split(r"\s*,\s*|\s+i\s+|\s+oraz\s+", seg) if p.strip()}
    return s, sorted(surnames)


def person_in_name(name):
    return any(m.group(1).lower() in FIRST_NAMES for m in PERSON_IN_NAME.finditer(PATRON.sub(" ", name)))


def org_base(name):
    """Lower case, no quotes, no legal form, no patron at the end: the basis of the grouping key and the slug."""
    s = LEGAL_FORMS.sub(" ", ORG_QUOTES.sub("", name.lower()))
    s = re.sub(r"\bfudacj", "fundacj", s)                    # a typo of the ROPS library
    m = re.match(r"(.*?)\s+im\.\s+[^,;()]*$", s)
    if m and len(m.group(1).split()) >= 2 and not re.search(r"\sw\s|\s[-\u2013]\s", s[m.end(1):]):
        s = m.group(1)
    return re.sub(r"\s+", " ", s).strip(" .,;:-")


def org_key(name):
    return re.sub(r"[\W_]+", "", org_base(name))


def ascii_slug(s, limit=60):
    s = unicodedata.normalize("NFKD", s.replace("ł", "l").replace("Ł", "L")).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:limit].rsplit("-", 1)[0] if len(s) > limit else s


def infer_org_type(name):
    low = name.lower()
    for code, rx in ORG_TYPE_RULES:
        if rx.search(low):
            return code, None
    return None, "typ nierozpoznany z nazwy (brak formy prawnej ani słowa kluczowego reguł)"


def contact_findings(obj, skip_urls=True):
    """Contact data found in the string values of obj (URLs skipped for the phone and postal patterns)."""
    found = []
    def walk(v, k=""):
        if isinstance(v, dict):
            for kk, vv in v.items():
                walk(vv, kk)
        elif isinstance(v, list):
            for vv in v:
                walk(vv, k)
        elif isinstance(v, str):
            is_url = v.startswith(("http://", "https://", "www."))
            for label, rx in CONTACT_PATTERNS:
                if is_url and skip_urls and label != "e-mail":
                    continue
                if rx.search(v):
                    found.append(f"{label} in {k}")
    walk(obj)
    return found


def read_register():
    reg_path = os.path.join(DATA, "places", "pl-register.json")
    if not os.path.exists(reg_path):
        sys.exit("no data/places/pl-register.json; run the places step first")
    with open(reg_path, encoding="utf-8") as f:
        register = json.load(f)["places"]
    by_name = collections.defaultdict(list)
    for p in register:
        if p["level"] == "gmina":
            by_name[p["name"].lower()].append(p)
    return register, by_name


def build_organisations():
    import yaml
    files = sorted(glob.glob(os.path.join(DATA, "innovations", "*.json")))
    if not files:
        log("organisations: skipped, no data/innovations (run derive-records.py build first)")
        return
    register, by_name = read_register()
    tercs = {p["terc"] for p in register}
    simc = read_simc()
    with open(os.path.join(DATA, "taxonomies.json"), encoding="utf-8") as f:
        type_codes = {t["code"] for t in json.load(f)["implementer_types"]}
    version_path = os.path.join(DATA, "data-version.json")
    version = json.load(open(version_path, encoding="utf-8"))["version"] if os.path.exists(version_path) else None
    records = {}
    for path in files:
        with open(path, encoding="utf-8") as f:
            r = json.load(f)
        records[r["id"]] = r

    errors, review = [], {"merged_variants": [], "similar_not_merged": [], "type_notes": [], "persons_removed": []}
    groups, natural, without = {}, [], []
    for iid in sorted(records):
        r = records[iid]
        inn, org = r.get("innovator") or {}, r.get("organisation") or {}
        # The records carry no contact data in the innovator and organisation fields (docs/innovation-record.md).
        errors += [f"{iid}: {x}" for x in contact_findings({"innovator": inn, "organisation": org})]
        unexpected = set(org) - {"name", "website"}
        if unexpected:
            errors.append(f"{iid}: unexpected organisation fields {sorted(unexpected)}")
        typ = (inn.get("type") or "").strip().lower()
        name = (org.get("name") or "").strip()
        if typ == "osoba fizyczna":
            natural.append({"innovation_id": iid, "reason": "osoba-fizyczna"})
            continue
        if typ == "grupa nieformalna":
            natural.append({"innovation_id": iid, "reason": "grupa-nieformalna"})
            continue
        if not name:
            if r.get("persons_public"):
                natural.append({"innovation_id": iid, "reason": "authors-persons-only"})
            else:
                without.append(iid)
            continue
        clean, removed = clean_org_name(name)
        # A firm named after the person listed with it ("Jan Nowak (Pracownia NOWAK)") is a sole trader.
        if not clean or person_in_name(clean) or set(re.findall(r"[\w-]+", clean.lower())) & set(removed):
            natural.append({"innovation_id": iid, "reason": "person-name"})
            continue
        if removed:
            review["persons_removed"].append(iid)
        for p in r.get("persons_public") or []:
            if isinstance(p, str) and len(p) > 4 and p.lower() in clean.lower():
                errors.append(f"{iid}: a published person's name is part of the organisation name")
        g = groups.setdefault(org_key(clean), {"variants": collections.Counter(), "records": []})
        g["variants"][clean] += 1
        g["records"].append(r)

    rows = []
    for key in sorted(groups):
        g = groups[key]
        name = sorted(g["variants"].items(), key=lambda kv: (-kv[1], -len(kv[0]), kv[0]))[0][0]
        typ, note = infer_org_type(name)
        other_types = {infer_org_type(v)[0] for v in g["variants"]} - {typ}
        if other_types:
            review["type_notes"].append({"name": name, "type": typ, "variant_types": sorted(t or "untyped" for t in other_types)})
        if len(g["variants"]) > 1:
            review["merged_variants"].append(sorted(g["variants"]))
        places = collections.Counter()
        first_seen = {}
        for r in g["records"]:
            place = (r.get("innovator") or {}).get("place_name") or (r.get("derived") or {}).get("origin_place_pl")
            if not place:
                continue
            part = next((p for p in PLACE_SPLIT.split(re.sub(r"\s*\([^)]*\)", "", place)) if p.strip()), None)
            terc, how = match_place(part, by_name, simc) if part else (None, None)
            if terc:
                places[(terc, part, how)] += 1
                first_seen.setdefault((terc, part, how), len(first_seen))
        best = sorted(places, key=lambda k: (-places[k], first_seen[k]))[0] if places else (None, None, None)
        website = next((r["organisation"].get("website") for r in g["records"] if r["organisation"].get("website")), None)
        rows.append({
            "key": key, "name": name, "type": typ, "type_note": note, "website": website,
            "place_terc": best[0], "place_name": best[1], "place_match": best[2],
            "innovation_ids": sorted(r["id"] for r in g["records"]), "implementation_ids": [],
            "source": "catalogue",
            "source_urls": sorted({s["url"] for r in g["records"] for s in r.get("sources") or [] if s.get("url")}),
            "contact_opt_out": False,
        })
    by_key = {row["key"]: row for row in rows}

    # Seeds: organisations of data/implementations.yaml (legal entities from public ranking lists).
    seeds_path = os.path.join(DATA, "implementations.yaml")
    with open(seeds_path, encoding="utf-8") as f:
        seeds = yaml.safe_load(f)
    seed_org_key = {}
    for s in seeds["implementations"]:
        o = s.get("organisation")
        if not o or not o.get("name_pl"):
            continue
        clean, _ = clean_org_name(o["name_pl"])
        key = org_key(clean)
        seed_org_key[s["id"]] = key
        urls = [u for u in (o.get("source_url"), s.get("source_url")) if u]
        row = by_key.get(key)
        if row is None:
            row = by_key[key] = {
                "key": key, "name": clean, "type": o.get("type"),
                "type_note": None if o.get("type") else "typ nie podany w data/implementations.yaml",
                "website": None, "place_terc": s.get("place_terc"), "place_name": s.get("place_name"),
                "place_match": "seed" if s.get("place_terc") else None,
                "innovation_ids": [], "implementation_ids": [], "source": "seed",
                "source_urls": sorted(set(urls)), "contact_opt_out": False,
            }
            rows.append(row)
            continue
        if o.get("type") and row["type"] != o["type"]:
            review["type_notes"].append({"name": row["name"], "type": row["type"], "seed_type": o["type"]})
            if row["type"] is None:
                row["type"], row["type_note"] = o["type"], "typ z data/implementations.yaml"
        if o.get("source_url"):
            row["source_urls"] = sorted(set(row["source_urls"]) | {o["source_url"]})

    # Stable unique ids: org- plus the ASCII slug of the name without quotes, legal form and trailing patron.
    rows.sort(key=lambda row: (ascii_slug(org_base(row["name"])), row["key"]))
    used = collections.Counter()
    for row in rows:
        base = "org-" + (ascii_slug(org_base(row["name"])) or "bez-nazwy")
        used[base] += 1
        row["id"] = base if used[base] == 1 else f"{base}-{used[base]}"
    org_of_innovation = {iid: row["id"] for row in rows for iid in row["innovation_ids"]}
    id_of_key = {row["key"]: row["id"] for row in rows}

    keys = sorted(by_key)
    for i, a in enumerate(keys):
        for b in keys[i + 1:]:
            if difflib.SequenceMatcher(None, a, b).ratio() >= 0.85:
                review["similar_not_merged"].append([by_key[a]["name"], by_key[b]["name"]])

    # Merged implementations: the seeds first (yaml order), then the derived origins they do not cover.
    merged, dedup = [], []
    for s in seeds["implementations"]:
        item = dict(s)
        item["organisation_id"] = id_of_key.get(seed_org_key.get(s["id"]))
        item["origin_file"] = "data/implementations.yaml"
        merged.append(item)
    covered = {(s["innovation_id"], s.get("place_terc")): s["id"] for s in seeds["implementations"] if s.get("place_terc")}
    derived_path = os.path.join(DATA, "implementations-derived.json")
    if os.path.exists(derived_path):
        with open(derived_path, encoding="utf-8") as f:
            derived = json.load(f)["implementations"]
    else:
        derived = []
        log("organisations: WARNING no data/implementations-derived.json (run the origins step); seeds only")
    for d in derived:
        hit = covered.get((d["innovation_id"], d.get("place_terc")))
        if hit:
            dedup.append({"id": d["id"], "covered_by": hit})
            continue
        item = dict(d)
        item["organisation_id"] = org_of_innovation.get(d["innovation_id"])
        item["origin_file"] = "data/implementations-derived.json"
        merged.append(item)
    row_by_id = {row["id"]: row for row in rows}
    for item in merged:
        if item["organisation_id"]:
            row_by_id[item["organisation_id"]]["implementation_ids"].append(item["id"])

    # Validation: references, places, types, unique ids, no contact data.
    for row in rows:
        row.pop("key")
        row["implementation_ids"].sort()
        errors += [f"{row['id']}: unknown innovation {i}" for i in row["innovation_ids"] if i not in records]
        if row["place_terc"] is not None and row["place_terc"] not in tercs:
            errors.append(f"{row['id']}: place_terc {row['place_terc']} not in the register")
        if row["type"] is not None and row["type"] not in type_codes:
            errors.append(f"{row['id']}: type {row['type']} not in implementer_types")
        errors += [f"{row['id']}: {x}" for x in contact_findings(row)]
        if person_in_name(row["name"]):
            errors.append(f"{row['id']}: a person's name in the organisation name")
    for item in merged:
        if item["innovation_id"] not in records:
            errors.append(f"{item['id']}: unknown innovation {item['innovation_id']}")
        if item.get("place_terc") is not None and item["place_terc"] not in tercs:
            errors.append(f"{item['id']}: place_terc {item['place_terc']} not in the register")
        t = (item.get("organisation") or {}).get("type")
        if t is not None and t not in type_codes:
            errors.append(f"{item['id']}: organisation type {t} not in implementer_types")
    for label, ids in (("organisation", [r["id"] for r in rows]), ("implementation", [i["id"] for i in merged])):
        errors += [f"duplicate {label} id {k}" for k, n in collections.Counter(ids).items() if n > 1]
    if errors:
        sys.exit("organisations: validation failed:\n  " + "\n  ".join(errors))

    by_type = dict(sorted(collections.Counter(r["type"] or "untyped" for r in rows).items()))
    by_source = dict(sorted(collections.Counter(r["source"] for r in rows).items()))
    natural.sort(key=lambda n: n["innovation_id"])
    org_counts = {"organisations": len(rows), "by_type": by_type, "by_source": by_source,
                  "natural_person_innovations": len(natural),
                  "natural_person_by_reason": dict(sorted(collections.Counter(n["reason"] for n in natural).items())),
                  "without_organisation": len(without)}
    head = {
        "note": "Innovator organisations of the built records (source catalogue) and the implementers named in "
                "data/implementations.yaml (source seed); spec FR-6.1, FR-6.3 and 8.6. No contact data: the app "
                "links the source entry. innovation_ids: records the organisation authored; implementation_ids: "
                "rows of data/implementations-merged.json.",
        "data_version": version,
        "privacy": "Natural persons (innovator.type Osoba fizyczna or Grupa nieformalna, a person's name as the "
                   "organisation, or people as the only authors) are not organisations: only their innovation ids "
                   "are listed in natural_person_innovations, without names (spec R6, FR-1.9). People listed next "
                   "to an organisation in the source are removed from its name.",
        "type_rules": "implementer_types code from the name, first match: company legal form or spółdzielnia "
                      "(firma-pes), fundacja/stowarzyszenie/związek/towarzystwo (ngo), OPS/GOPS/MOPS/MOPR/CUS/"
                      "PCPR/ośrodek pomocy (ops-cus-pcpr), gmina/urząd/starostwo/powiat (jst), school, library, "
                      "DPS, ŚDS, WTZ, university, hospital, museum (placowka); else null with type_note. Seeds keep "
                      "their hand-written type.",
        "grouping": "names grouped case-insensitively without quotes, punctuation, spaces, legal form and a "
                    "trailing patron (im. ...); place: innovator.place_name or derived.origin_place_pl matched "
                    "like the origins step",
        "reasons": NATURAL_PERSON_REASONS,
        "counts": org_counts,
    }
    tail = {"natural_person_innovations": natural, "without_organisation": without, "review": review}
    rows = [{"id": row["id"], **{k: v for k, v in row.items() if k != "id"}} for row in rows]
    write_json_lines(os.path.join(DATA, "organisations.json"), head, "organisations", rows, tail)

    inns = {i["innovation_id"] for i in merged}
    mal = {i["innovation_id"] for i in merged if (i.get("place_terc") or "").startswith(MALOPOLSKA)}
    impl_counts = {"implementations": len(merged),
                   "by_origin_file": dict(sorted(collections.Counter(i["origin_file"] for i in merged).items())),
                   "innovations_with_implementation": len(inns),
                   "innovations_with_implementation_in_malopolska": len(mal),
                   "with_organisation": sum(1 for i in merged if i["organisation_id"]),
                   "deduplicated": len(dedup),
                   "organisations_by_type": by_type}
    head = {
        "note": "Union of data/implementations.yaml (hand-written seeds) and data/implementations-derived.json "
                "(places of origin); spec 8.6 and FR-6.3. organisation_id: the row of data/organisations.json "
                "(for an origin, the innovator's organisation; null for natural persons). origin_file: where "
                "the row comes from. An origin already covered by a seed for the same innovation and gmina is "
                "dropped (deduplicated).",
        "data_version": version,
        "seeds_version": seeds.get("version"),
        "sources": seeds.get("sources"),
        "counts": impl_counts,
    }
    write_json_lines(os.path.join(DATA, "implementations-merged.json"), head, "implementations", merged,
                     {"deduplicated": dedup})
    log(f"organisations: {len(rows)} organisations {by_type} {by_source}; natural persons excluded: {len(natural)} "
        f"{org_counts['natural_person_by_reason']}; without organisation: {len(without)}")
    log(f"organisations: merged implementations {len(merged)} for {len(inns)} innovations ({len(mal)} in Malopolska), "
        f"{len(dedup)} origins deduplicated")
    for v in review["merged_variants"]:
        log(f"organisations: grouped variants: {' | '.join(v)}")
    for a, b in review["similar_not_merged"]:
        log(f"organisations: similar, kept apart: {a} | {b}")
    for t in review["type_notes"]:
        log(f"organisations: type note: {t}")


# ----------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", default="places,map,indicators,origins,organisations")
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
    if "organisations" in steps:
        build_organisations()


if __name__ == "__main__":
    main()
