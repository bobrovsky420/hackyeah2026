"""Parse the catalogue snapshots into source records: .local/pipeline/sources/<id>.json.

Deterministic, no model, no network. Reads the raw pages that
scripts/crawl-catalogues.py stored under .local/raw/ and writes one JSON per
innovation in the source-record shape of docs/innovation-record.md
(schemas/source-record.schema.json) into the pipeline's machine-local working
folder (data/ holds only what the app serves). It also writes
data/incubators.json from the incubator profile pages, which the app does read. A re-run changes nothing when the snapshot
is unchanged. This is the "parse" half of FR-1.1 and FR-1.2; the derived
fields are added by the extraction skill (.claude/skills/extract-innovations).

Rules applied here (spec 8.1, FR-1.9, R6): source text is copied verbatim;
contact details are never copied, only the fact that the entry has them;
names of people are kept exactly as published and nothing else about them;
websites are kept for organisations only.

Usage (from the repository root, with the project venv):
  .venv/Scripts/python scripts/parse-catalogues.py [s1] [s2] [--only <slug>]
"""
import datetime, hashlib, html, json, os, re, sys, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, ".local", "raw")
OUT = os.path.join(ROOT, ".local", "pipeline", "sources")
INCUBATORS_OUT = os.path.join(ROOT, "data", "incubators.json")
TAXONOMIES = os.path.join(ROOT, "data", "taxonomies.json")
PARSER_VERSION = "parse-v3"   # v2: links are real URLs pulled from the free text of "Strona internetowa";
                              # v3: v2 had overwritten the entry URL of sources[] with the last link; fixed
URL_IN_TEXT = re.compile(r"https?://[^\s\"'<>;,]+")
URL_HOST = re.compile(r"^https?://[^\s/]+\.[^\s/]+")


def real_urls(href):
    """The catalogue wraps free text in anchors (href="http://Ulotka: https://drive..."); keep only real URLs."""
    if not href or href.startswith("mailto:"):
        return []
    if URL_HOST.match(href) and not re.search(r"\s", href):
        return [href]
    return [u.rstrip(".;,)") for u in URL_IN_TEXT.findall(href) if URL_HOST.match(u)]

S1 = "https://innowacjespoleczne.pl"
S2 = "https://rops.krakow.pl"
CC_BY = "CC BY 4.0"
CC_BY_URL = "https://creativecommons.org/licenses/by/4.0/deed.pl"
MIIS_TERMS = "Zasady_wykorzystania_innowacji_MIIS.pdf"
ROPS_INCUBATORS = ("małopolski inkubator innowacji społecznych", "inkubator włączenia społecznego", "inkubator dostępności")

S1_KEYS = {
    "Charakter innowacji": "charakter",
    "Problem, na który odpowiada innowacja": "problem",
    "Jak działa innowacja?": "jak_dziala",
    "Komu służy innowacja?": "komu_sluzy",
    "Kto może wdrażać innowację?": "kto_moze_wdrazac",
    "Produkty powstałe w wyniku testowania": "produkty_testowania",
    "Rezultaty osiągnięte w wyniku testowania": "rezultaty_testowania",
    "Komentarz do oceny": "komentarz_do_oceny",
    "Miejsce testowania innowacji": "miejsce_testowania",
    "Źródło finansowania": "zrodlo_finansowania",
    "Strona internetowa": "strona_www",
    "Kto jest niezbędny do wdrożenia innowacji?": "kto_niezbedny",
    "Co jest niezbędne do wdrożenia innowacji?": "co_niezbedne",
    "Typ innowatora": "typ_innowatora",
    "Imię i nazwisko lub nazwa innowatora/ów": "innowator",
    "Miejscowość, w której znajduje się miejsce zamieszkania lub siedziby innowatora/ów": "miejscowosc",
    "Instytucja wspierająca rozwój innowacji": "instytucja_wspierajaca",
    "Kontakt w sprawie innowacji": "kontakt",
}
S2_KEYS = {
    "Na czym polega rozwiązanie?": "na_czym_polega",
    "Jakich problemów dotyczy innowacja?": "jakich_problemow_dotyczy",
    "Grupa docelowa": "grupa_docelowa",
    "Kto może skorzystać z innowacji?": "kto_moze_skorzystac",
    "Kto może skorzystać z rozwiązania?": "kto_moze_skorzystac",
    "Czy to działa?": "czy_to_dziala",
    "Autorzy": "autorzy", "Autor": "autorzy", "Autorka": "autorzy", "Autorki": "autorzy", "Autorz": "autorzy",
    "Autorzy innowacji": "autorzy", "Autorki innowacji": "autorzy",
}
LABELS_PL = {v: k for k, v in list(S1_KEYS.items()) + list(S2_KEYS.items()) if k}
LABELS_PL["autorzy"] = "Autorzy"
LABELS_PL["kto_moze_skorzystac"] = "Kto może skorzystać z innowacji?"
LABELS_PL["wstep"] = "Wstęp"
LABELS_PL["oznaczenie"] = "Oznaczenie w bibliotece ROPS"

ORG_RE = re.compile(r"(?i)(fundacj|stowarzyszeni|spółdzielni|sp\.? ?z ?o\.? ?o|\bs\.a\.|\bs\.c\.|sp\. ?j\.|sp\. ?k\.|uniwersytet|akademi|politechnik|instytut|centrum|ośrodek|osrodek|\bgmin[ay]\b|\bmiast[oa]\b|\bpowiat|szkoł|szkol|przedszkol|dom pomocy|dom kultury|dom dziecka|\bklub|towarzystw|federacj|związek|zwiazek|zakład|zaklad|przedsiębiorstw|\bfirma|agencj|bibliotek|muzeum|teatr|parafi|caritas|pcpr|mops|gops|\bops\b|\bcus\b|\bwtz\b|śds|\bdps\b|spółk|\bltd\b|gmbh|\bngo\b|hospicj|szpital|przychodni|poradni|urząd|urzad|sołectw|koło gospodyń|grupa nieformalna|konsorcjum|oddział|samorząd|zgromadzeni|\bim\.\s|\bpw\.\s|[„\"“].+[”\"“])")
PERSON_NAME = r"[A-ZŁŚŻŹĆŃÓĘĄ][a-ząćęłńóśźż']+(?:-[A-ZŁŚŻŹĆŃÓĘĄ][a-ząćęłńóśźż']+)?"
PERSON_RE = re.compile(r"^(?:[a-ząćęłńóśźż]{1,5}\.?\s+){0,6}" + PERSON_NAME + r"(?:\s+(?:" + PERSON_NAME + r"|[A-ZŁŚŻŹĆŃÓĘĄ]\.)){1,3}$")
DIV_RE = re.compile(r"<div\b|</div>")


def log(msg):
    print(msg, flush=True)


def clean_html(s):
    return re.sub(r"(?is)<script(?![^>]*ld\+json).*?</script>|<style.*?</style>|<!--.*?-->|<svg.*?</svg>", "", s)


def html_to_text(frag):
    s = re.sub(r"(?is)<br\s*/?>", "\n", frag)
    s = re.sub(r"(?is)<li[^>]*>", "\n- ", s)
    s = re.sub(r"(?is)</(p|li|div|ul|ol|h[1-6]|tr|table|section)>", "\n", s)
    s = re.sub(r"(?is)<[^>]+>", " ", s)
    s = html.unescape(s).replace("\xa0", " ").replace("​", "").replace("﻿", "")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in s.split("\n")]
    lines = [re.sub(r"^- -\s*", "- ", line) for line in lines if line and line != "-"]
    return "\n".join(lines)


def inline_text(frag):
    return re.sub(r"\s+", " ", html_to_text(frag)).strip()


def div_block(b, start):
    """Content of a div whose opening tag ends at `start`, and the index after its closing tag."""
    depth, i = 1, start
    while depth:
        m = DIV_RE.search(b, i)
        if not m:
            return b[start:], len(b)
        i = m.end()
        depth += 1 if m.group() != "</div>" else -1
    return b[start:m.start()], m.end()


def section_by_id(b, sid):
    i = b.find(f'id="{sid}"')
    if i < 0:
        return ""
    j = b.find("</section>", i)
    return b[i: j if j > 0 else len(b)]


def grid_fields(section):
    """(label, html) pairs of a th/td grid."""
    out = []
    for m in re.finditer(r'<div class="th">(.*?)</div>\s*<div class="td">', section, re.S):
        label = inline_text(m.group(1))
        content, _ = div_block(section, m.end())
        out.append((label, content))
    return out


def slugify(s):
    s = s.lower()
    for a, b in zip("ąćęłńóśźż", "acelnoszz"):
        s = s.replace(a, b)
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s)).strip("-")


def norm_name(s):
    return re.sub(r"\s+", " ", s or "").strip().lower()


def material_type(url):
    low = url.lower()
    if "youtu" in low or "vimeo" in low:
        return "video"
    path = urllib.parse.unquote(urllib.parse.urlparse(url).path).lower()
    ext = path.rsplit(".", 1)[-1] if "." in path.rsplit("/", 1)[-1] else ""
    return {"pdf": "pdf", "doc": "doc", "docx": "doc", "odt": "doc", "rtf": "doc", "txt": "doc", "epub": "doc",
            "xls": "sheet", "xlsx": "sheet", "ods": "sheet", "csv": "sheet",
            "ppt": "slides", "pptx": "slides", "odp": "slides",
            "zip": "zip", "rar": "zip", "7z": "zip",
            "jpg": "image", "jpeg": "image", "png": "image", "gif": "image",
            "mp4": "video", "mov": "video", "avi": "video", "wmv": "video", "mkv": "video", "webm": "video", "m4v": "video",
            "mp3": "audio"}.get(ext, "link")


def load_log(source):
    """url -> record of the last successful fetch, from .local/raw/<source>/log.jsonl."""
    out = {}
    path = os.path.join(RAW, source, "log.jsonl")
    if not os.path.exists(path):
        return out
    for line in open(path, encoding="utf-8"):
        rec = json.loads(line)
        if rec.get("status") == 200:
            out[rec["url"]] = rec
    return out


def local_file(files_log, source, url):
    for key in (url, html.unescape(url).strip(), url.strip()):
        rec = files_log.get(key)
        if rec and rec.get("path"):
            entry = {"local_path": f".local/raw/{source}/{rec['path']}"}
            if rec.get("bytes") == 0:
                entry["status"] = "dead-" + rec["time"][:10]
            return entry
    return {"local_path": None}


def split_persons(name):
    parts = [p.strip(" .;") for p in re.split(r",|;|\si\s|\soraz\s", name) if p.strip(" .;")]
    if parts and all(PERSON_RE.match(p) for p in parts):
        return parts, []
    return [name.strip()], ["persons-unsplit"]


def classify_authors(text):
    """S2 'Autorzy': organisations, persons and lines nobody can classify, from the published lines."""
    orgs, persons, unclassified = [], [], []
    for line in text.split("\n"):
        line = re.sub(r"^[-–•·*]\s*", "", line).strip(" ,;.")
        line = line.replace("​", "").strip()
        if not line:
            continue
        if ORG_RE.search(line):
            orgs.append(line)
            continue
        if PERSON_RE.match(line):
            persons.append(line)
            continue
        sub = [p.strip(" .") for p in re.split(r",|;|\si\s|\soraz\s", line) if p.strip(" .")]
        if len(sub) > 1 and all(PERSON_RE.match(p) for p in sub):
            persons.extend(sub)
        else:
            unclassified.append(line)
    return orgs, persons, unclassified


def fingerprint(title, category, fields):
    raw = json.dumps([title, category, fields], ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def build_text(title, intro, fields, order):
    parts = [f"Tytuł: {title}"]
    if intro:
        parts.append(f"Wstęp: {intro}")
    for key in order:
        if key in fields and key != "kontakt":
            parts.append(f"{LABELS_PL.get(key, key)}: {fields[key]}")
    for key in fields:
        if key not in order and key != "kontakt":
            parts.append(f"{LABELS_PL.get(key, key)}: {fields[key]}")
    return "\n".join(parts)


def write_record(path, rec):
    """Write unless only parsed_at would change."""
    if os.path.exists(path):
        try:
            old = json.load(open(path, encoding="utf-8"))
        except Exception:
            old = None
        if old and {k: v for k, v in old.items() if k != "parsed_at"} == {k: v for k, v in rec.items() if k != "parsed_at"}:
            return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(rec, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return True


# ---------------------------------------------------------------- national base (S1)

def load_taxonomy():
    d = json.load(open(os.path.join(RAW, "s1", "taxonomy-advanced.json"), encoding="utf-8"))
    terms = {}

    def walk(items, path, tax):
        for t in items:
            p = path + [t["name"]]
            terms[t["id"]] = {"taxonomy": tax, "path": " > ".join(p), "name": t["name"], "name_en": t.get("name_en")}
            walk(t.get("children", []), p, tax)
    for tx in d["data"]:
        walk(tx["terms"], [], tx["name"])
    return terms


def parse_profiles(log_s1):
    """Incubator and innovator profiles: uuid -> {name, years, type, innovations[]}."""
    profiles = {}
    for url, rec in log_s1.items():
        if "/profil/" not in url or not rec.get("path"):
            continue
        b = clean_html(open(os.path.join(RAW, "s1", rec["path"]), encoding="utf-8", errors="replace").read())
        uuid = url.rstrip("/").rsplit("/", 1)[-1]
        ptype = re.search(r'<div class="profile-type">(.*?)</div>', b, re.S)
        h1 = re.search(r"<h1[^>]*>(.*?)</h1>", b, re.S)
        years = re.search(r'<span class="postscript">\[(.*?)\]</span>', b)
        name = inline_text(re.sub(r"(?s)<a.*?</a>", "", h1.group(1))) if h1 else uuid
        name = re.sub(r"\s*\[.*?\]\s*$", "", name)
        website = re.search(r"<th>Strona WWW</th>\s*<td>\s*<a href=\"([^\"]+)\"", b)
        profiles[uuid] = {
            "uuid": uuid, "url": url, "type": inline_text(ptype.group(1)) if ptype else None,
            "name": name, "years": years.group(1) if years else None,
            "website": website.group(1) if website else None,
            "innovations": sorted(set(re.findall(r'<a class="tile" href="/innowacja/([^"/]+)/?"', b))),
        }
    return profiles


def programme_for(years):
    if not years:
        return None
    end = re.search(r"-\s*(\d{2,4})?\s*$", years)
    start = re.match(r"\s*(\d{4})", years)
    if start and int(start.group(1)) >= 2024:
        return "FERS"
    if end and end.group(1):
        y = int(end.group(1))
        y = y + 2000 if y < 100 else y
        return "FERS" if y >= 2025 else "POWER 4.1"
    return "FERS" if years.strip().endswith("-") else "POWER 4.1"


def parse_s1_entry(url, rec, files_log, terms, tax, profiles, by_slug):
    path = os.path.join(RAW, "s1", rec["path"])
    raw = open(path, "rb").read()
    b = clean_html(raw.decode("utf-8", "replace"))
    slug = url.rstrip("/").rsplit("/", 1)[-1]
    flags = []

    h1 = re.search(r'<h1 class="post__title[^"]*">(.*?)</h1>', b, re.S)
    title = inline_text(re.sub(r"(?s)<a.*?</a>", "", h1.group(1))) if h1 else slug
    intro = None
    if h1:
        m = re.search(r'<div class="description">(.*?)</div>', b[h1.end(): h1.end() + 4000], re.S)
        intro = inline_text(m.group(1)) or None if m else None

    advanced, simple = [], []
    cat = re.search(r'<section class="categories">(.*?)</section>', b, re.S)
    if cat:
        for tid, name in re.findall(r'advanced-tags%5B%5D=(\d+)"[^>]*>(.*?)</a>', cat.group(1), re.S):
            tid, name = int(tid), inline_text(name)
            t = terms.get(tid)
            if t:
                advanced.append({"id": tid, "taxonomy": t["taxonomy"], "path": t["path"], "name": t["name"], "name_en": t["name_en"]})
            else:
                simple.append({"id": tid, "facet": "obszar_dzialan", "name": name})
        for tid, name in re.findall(r'simple-tags=(\d+)"[^>]*>(.*?)</a>', cat.group(1), re.S):
            tid, name = int(tid), inline_text(name)
            facet = next((f for f, d in tax["national_base_simple_tags"].items() if str(tid) in d), "simple")
            simple.append({"id": tid, "facet": facet, "name": name})
    else:
        flags.append("no-categories-section")

    fields, links, strona = {}, [], None
    incubator = {"name": None, "years": None, "uuid": None}
    for sid in ("o-innowacji", "jak-wdrozyc-innowacje", "kto-za-tym-stoi"):
        for label, content in grid_fields(section_by_id(b, sid)):
            key = S1_KEYS.get(label)
            if not key:
                key = slugify(label).replace("-", "_")
                flags.append(f"unknown-label:{label}")
            if key == "kontakt":
                fields["kontakt"] = html_to_text(content)
                continue
            if key == "instytucja_wspierajaca":
                pm = re.search(r'href="/profil/([0-9a-f-]{36})"', content)
                text = inline_text(content)
                incubator = {"name": re.sub(r"\s*\[.*?\]\s*$", "", text), "uuid": pm.group(1) if pm else None,
                             "years": (re.search(r"\[(.*?)\]", text) or [None, None])[1]}
                fields[key] = text
                continue
            if key == "strona_www":
                for href in re.findall(r'href="([^"]+)"', content):
                    for link_url in real_urls(html.unescape(href).strip()):
                        links.append({"title": "Strona internetowa", "url": link_url})
                        strona = strona or link_url
                fields[key] = inline_text(content)
                continue
            fields[key] = html_to_text(content)
    # other links
    m = re.search(r"<h2>Inne linki</h2>(.*?)</section>", b, re.S)
    if m:
        for href, text in re.findall(r'<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', m.group(1), re.S):
            href = html.unescape(href).strip()
            t = inline_text(text) or href
            for link_url in real_urls(href):
                links.append({"title": t if t != href else "Link", "url": link_url})
    if "<h2>Multimedia</h2>" in b:
        flags.append("has-gallery")
    if "<h2>Materiały wideo</h2>" in b:
        flags.append("has-video-section")
    for sid in ("o-innowacji", "kto-za-tym-stoi"):
        if not section_by_id(b, sid):
            flags.append(f"missing-section:{sid}")

    # materials
    materials = []
    files = section_by_id(b, "pliki-do-pobrania")
    for href, name in re.findall(r'<li>\s*<a href="([^"]+)"[^>]*>.*?<span class="link-name">(.*?)</span>', files, re.S):
        href = html.unescape(href).strip()
        entry = {"type": material_type(href), "title": inline_text(name) or href.rsplit("/", 1)[-1], "url": href, "licence": CC_BY}
        entry.update(local_file(files_log, "s1-files", href))
        materials.append(entry)

    # innovator, organisation, persons
    typ = fields.get("typ_innowatora")
    name = fields.get("innowator")
    innovator = {"type": typ or None, "place_name": fields.get("miejscowosc") or None}
    organisation, persons = None, []
    if typ == "Podmiot prawny" and name:
        organisation = {"name": name, "website": strona}
    elif typ in ("Osoba fizyczna", "Grupa nieformalna") and name:
        persons, f2 = split_persons(name)
        flags += f2
    elif name:
        innovator["name_unclassified"] = name
        flags.append("innovator-type-missing")
    contact_in_source = bool(fields.get("kontakt"))
    if "kontakt" in fields:
        del fields["kontakt"]
    if "innowator" in fields and typ != "Podmiot prawny":
        # the name of a person is kept in persons_public only
        del fields["innowator"]

    # mapping
    mapped_tg, mapped_it, character, tools, areas = [], [], [], [], []
    for s in simple:
        d = tax["national_base_simple_tags"]
        if s["facet"] == "dla_kogo":
            mapped_tg += d["dla_kogo"][str(s["id"])]["target_groups"]
        elif s["facet"] == "kto_moze_wdrazac":
            mapped_it += d["kto_moze_wdrazac"][str(s["id"])]["implementer_types"]
        elif s["facet"] == "charakter":
            character.append(s["name"])
        elif s["facet"] == "narzedzia":
            tools.append(s["name"])
        elif s["facet"] == "obszar_dzialan":
            areas.append(s["name"])
    settings, hints = [], []
    for a in advanced:
        if a["taxonomy"] == "Dla kogo?":
            for p in tax["national_base_advanced_patterns"]["patterns"]:
                if re.search(p["pattern"], a["path"], re.I):
                    mapped_tg.append(p["target_group"])
            for p in tax["national_base_advanced_patterns"]["settings"]:
                if re.search(p["pattern"], a["path"], re.I):
                    settings.append(p["setting"])
        if a["taxonomy"] == "Temat":
            for p in tax["national_base_topic_patterns"]["patterns"]:
                if re.search(p["pattern"], a["path"], re.I):
                    hints.append(p["domain"])
    mapped_tg = sorted(set(mapped_tg)) or ["inne"]
    if len(mapped_tg) > 1 and "inne" in mapped_tg:
        mapped_tg.remove("inne")
    mapped_it = sorted(set(mapped_it))
    if not mapped_it:
        flags.append("no-implementer-facet")

    # origin
    prof = profiles.get(incubator["uuid"]) if incubator["uuid"] else None
    listed_in = [p["name"] for p in profiles.values() if p["type"] == "Inkubator" and slug in p["innovations"]]
    if listed_in and incubator["name"] and norm_name(incubator["name"]) not in [norm_name(x) for x in listed_in]:
        flags.append("incubator-mismatch:" + "; ".join(listed_in))
    inc_name = incubator["name"] or (listed_in[0] if listed_in else None)
    inc_years = incubator["years"] or (prof["years"] if prof else None)
    rops = bool(inc_name) and any(norm_name(inc_name).startswith(x) for x in ROPS_INCUBATORS)
    selected = None
    comment = (fields.get("komentarz_do_oceny") or "").lower()
    if "niewybrana do upowszechniania" in comment or "nie została wybrana" in comment:
        selected = False
    elif "wybrana do upowszechniania" in comment or "wybrana do upowszechnienia" in comment:
        selected = True
    origin = {
        "incubator_name": inc_name, "incubator_years": inc_years,
        "incubator_profile_url": f"{S1}/profil/{incubator['uuid']}/" if incubator["uuid"] else None,
        "programme": programme_for(inc_years) if inc_name else None,
        "selected_for_dissemination": selected, "dissemination_label_pl": None,
        "region": "małopolskie" if rops else None, "rops_incubated": rops,
    }

    order = ["charakter", "problem", "jak_dziala", "komu_sluzy", "kto_moze_wdrazac", "produkty_testowania", "rezultaty_testowania",
             "komentarz_do_oceny", "miejsce_testowania", "zrodlo_finansowania", "strona_www", "kto_niezbedny", "co_niezbedne",
             "typ_innowatora", "innowator", "miejscowosc", "instytucja_wspierajaca"]
    rec = {
        "id": f"inn-nat-{slug}", "source": "baza-krajowa", "title": title, "intro_pl": intro,
        "sources": [{"name": "baza-krajowa", "url": url, "category_slug": None, "retrieved_at": rec["time"][:10],
                     "licence": CC_BY, "licence_url": CC_BY_URL, "raw_path": f".local/raw/s1/{rec['path']}",
                     "raw_sha256": hashlib.sha256(raw).hexdigest()}],
        "source_fields": fields,
        "tags": {"advanced": advanced, "simple": simple},
        "mapped": {"target_groups": mapped_tg, "implementer_types": mapped_it, "character": character, "tools": tools, "areas": areas,
                   "settings": sorted(set(settings)), "domain_hints": sorted(set(hints))},
        "innovator": innovator, "organisation": organisation, "persons_public": persons,
        "contact_in_source": contact_in_source, "origin": origin, "materials": materials, "links": links,
        "text_pl": build_text(title, intro, fields, order),
        "review_flags": sorted(set(flags)),
        "fingerprint": fingerprint(title, None, fields),
        "parser_version": PARSER_VERSION,
        "parsed_at": datetime.datetime.now().isoformat(timespec="seconds"),
    }
    return rec


def run_s1(only=None):
    log_s1 = load_log("s1")
    files_log = load_log("s1-files")
    terms = load_taxonomy()
    tax = json.load(open(TAXONOMIES, encoding="utf-8"))
    profiles = parse_profiles(log_s1)
    incubators = [{"uuid": p["uuid"], "name": p["name"], "years": p["years"], "programme": programme_for(p["years"]),
                   "url": p["url"], "website": p["website"], "innovation_slugs": p["innovations"],
                   "rops": any(norm_name(p["name"]).startswith(x) for x in ROPS_INCUBATORS)}
                  for p in profiles.values() if p["type"] == "Inkubator"]
    incubators.sort(key=lambda x: x["name"])
    with open(INCUBATORS_OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"source": f"{S1}/profile/", "retrieved_at": max(r["time"][:10] for r in log_s1.values()), "incubators": incubators}, f, ensure_ascii=False, indent=2)
        f.write("\n")
    entries = {url: rec for url, rec in log_s1.items() if "/innowacja/" in url and rec.get("path")}
    by_slug = {url.rstrip("/").rsplit("/", 1)[-1]: url for url in entries}
    n, changed = 0, 0
    for url, rec in sorted(entries.items()):
        slug = url.rstrip("/").rsplit("/", 1)[-1]
        if only and slug != only:
            continue
        r = parse_s1_entry(url, rec, files_log, terms, tax, profiles, by_slug)
        changed += write_record(os.path.join(OUT, r["id"] + ".json"), r)
        n += 1
    log(f"s1: {n} records, {changed} written or changed, {len(incubators)} incubators")


# ---------------------------------------------------------------- ROPS library (S2)

def parse_s2_entry(url, rec, files_log, tax):
    path = os.path.join(RAW, "s2", rec["path"])
    raw = open(path, "rb").read()
    b = clean_html(raw.decode("utf-8", "replace"))
    tail = url.rsplit("/", 1)[-1]
    category, slug = tail.split(",", 1)
    flags = []
    h = re.search(r'<h2 class="page-title">(.*?)</h2>', b, re.S)
    title = inline_text(h.group(1)) if h else slug
    i = b.find('<div class="text-content">')
    j = b.find('class="btns-holder-justify"', i)
    main, _ = div_block(b, i + len('<div class="text-content">')) if i >= 0 else ("", 0)
    if not main:
        flags.append("missing-section:text-content")

    # dissemination label and header table
    label, incubator = None, None
    for m in re.finditer(r"<strong>(.*?)</strong>", main[:4000], re.S):
        t = inline_text(m.group(1))
        if "UPOWSZECHNIANIA" in t.upper():
            label = t
            up = t.upper()
            if "DOSTĘPNOŚCI" in up:
                incubator = "Inkubator Dostępności"
            elif "WŁĄCZENIA" in up:
                incubator = "Inkubator Włączenia Społecznego"
            elif "MAŁOPOLSKI INKUBATOR INNOWACJI" in up:
                incubator = "Małopolski Inkubator Innowacji Społecznych"
            else:
                flags.append("dissemination-label-unmapped")
            break
    materials, licence, licence_url = [], CC_BY, CC_BY_URL
    table = re.search(r"(?s)<table.*?</table>", main)
    if table:
        for href in re.findall(r'href="([^"]+)"', table.group(0)):
            href = html.unescape(href).strip()
            full = urllib.parse.urljoin(url, href)
            low = full.lower()
            if "creativecommons.org" in low:
                continue
            if MIIS_TERMS.lower() in low:
                licence, licence_url = "MIIS-agreement", full
                continue
            mt = material_type(full)
            title_m = {"pdf": "Folder informacyjny", "video": "Film", "zip": "Materiały do pobrania"}.get(mt, "Link")
            entry = {"type": mt, "title": title_m, "url": full, "licence": None if mt == "video" else CC_BY}
            entry.update(local_file(files_log, "s2-files", full))
            materials.append(entry)
        main = main.replace(table.group(0), "")
    else:
        flags.append("no-header-table")
    if licence == "MIIS-agreement":
        for mtr in materials:
            if mtr["licence"] == CC_BY:
                mtr["licence"] = "MIIS-agreement"

    # numbered sections: <h4>N. Label</h4>, sometimes <p>N. Label</p>, sometimes an empty <h4>
    main = re.sub(r"(?s)<h4[^>]*>(?:\s|&nbsp;)*</h4>", "", main)
    main = re.sub(r"(?s)<p[^>]*>\s*(?:<strong>)?\s*(\d\.\s*[^<]{3,80}\?|\d\.\s*(?:Grupa docelowa|Autor\w*(?: innowacji)?))\s*(?:</strong>)?\s*</p>", r"<h4>\1</h4>", main)
    fields = {}
    parts = re.split(r"(?s)<h4[^>]*>(.*?)</h4>", main)
    pre = html_to_text(re.sub(r"(?s)<p>\s*<strong>.*?</strong>\s*</p>", "", parts[0])) if parts else ""
    pre = re.sub(r"^INNOWACJA WYBRANA.*$", "", pre, flags=re.M).strip()
    if pre:
        fields["wstep"] = pre
    last_key = "wstep"
    for k in range(1, len(parts), 2):
        heading = re.sub(r"^\d+\.\s*", "", inline_text(parts[k])).strip()
        content = html_to_text(parts[k + 1] if k + 1 < len(parts) else "")
        if not heading:
            key = last_key
        else:
            key = S2_KEYS.get(heading)
            if key is None:
                key = slugify(heading).replace("-", "_") or "sekcja"
                flags.append(f"unknown-label:{heading}")
        last_key = key
        if content:
            fields[key] = (fields[key] + "\n" + content) if key in fields else content
    for req in ("na_czym_polega", "jakich_problemow_dotyczy", "grupa_docelowa", "kto_moze_skorzystac", "czy_to_dziala"):
        if req not in fields:
            flags.append(f"missing-field:{req}")

    orgs, persons, unclassified = classify_authors(fields.get("autorzy", ""))
    if unclassified:
        flags.append("authors-unclassified")
    organisation = {"name": orgs[0], "website": None, **({"others": orgs[1:]} if len(orgs) > 1 else {})} if orgs else None
    if label:
        fields = {"oznaczenie": label, **fields}
    tg = [t["code"] for t in tax["target_groups"] if t["rops_category_slug"] == category] or ["inne"]

    origin = {
        "incubator_name": incubator, "incubator_years": None, "incubator_profile_url": None,
        "programme": "POWER 4.1" if incubator else None,
        "selected_for_dissemination": bool(label), "dissemination_label_pl": label,
        "region": "małopolskie" if incubator else None, "rops_incubated": bool(incubator),
    }
    order = ["oznaczenie", "wstep", "na_czym_polega", "jakich_problemow_dotyczy", "grupa_docelowa", "kto_moze_skorzystac", "czy_to_dziala", "autorzy"]
    rec_out = {
        "id": f"inn-rops-{slug}", "source": "rops-biblioteka", "title": title, "intro_pl": None,
        "sources": [{"name": "rops-biblioteka", "url": url, "category_slug": category, "retrieved_at": rec["time"][:10],
                     "licence": licence, "licence_url": licence_url, "raw_path": f".local/raw/s2/{rec['path']}",
                     "raw_sha256": hashlib.sha256(raw).hexdigest()}],
        "source_fields": fields,
        "tags": {"advanced": [], "simple": []},
        "mapped": {"target_groups": tg, "implementer_types": [], "character": [], "tools": [], "areas": [], "settings": [], "domain_hints": []},
        "innovator": {"type": None, "place_name": None},
        "organisation": organisation, "persons_public": persons,
        **({"authors_unclassified": unclassified} if unclassified else {}),
        "contact_in_source": False, "origin": origin, "materials": materials, "links": [],
        "text_pl": build_text(title, None, fields, order),
        "review_flags": sorted(set(flags)),
        "fingerprint": fingerprint(title, category, fields),
        "parser_version": PARSER_VERSION,
        "parsed_at": datetime.datetime.now().isoformat(timespec="seconds"),
    }
    return rec_out


def run_s2(only=None):
    log_s2 = load_log("s2")
    files_log = load_log("s2-files")
    tax = json.load(open(TAXONOMIES, encoding="utf-8"))
    entries = {url: rec for url, rec in log_s2.items() if "," in url.rsplit("/", 1)[-1] and rec.get("path")}
    n, changed = 0, 0
    for url, rec in sorted(entries.items()):
        if only and only not in url:
            continue
        r = parse_s2_entry(url, rec, files_log, tax)
        changed += write_record(os.path.join(OUT, r["id"] + ".json"), r)
        n += 1
    log(f"s2: {n} records, {changed} written or changed")


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    args = sys.argv[1:]
    only = None
    if "--only" in args:
        k = args.index("--only")
        only = args[k + 1]
        del args[k: k + 2]
    which = args or ["s1", "s2"]
    os.makedirs(OUT, exist_ok=True)
    if "s1" in which:
        run_s1(only)
    if "s2" in which:
        run_s2(only)
    # summary
    recs = [json.load(open(os.path.join(OUT, f), encoding="utf-8")) for f in sorted(os.listdir(OUT)) if f.endswith(".json")]
    flags = {}
    for r in recs:
        for f in r["review_flags"]:
            flags[f.split(":")[0]] = flags.get(f.split(":")[0], 0) + 1
    log(f"total: {len(recs)} source records; review flags: " + ", ".join(f"{k} {v}" for k, v in sorted(flags.items())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
