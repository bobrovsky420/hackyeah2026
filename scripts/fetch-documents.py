"""Snapshot the tier 2 reference documents into .local/docs/ (git-ignored).

Polish sources only. Groups:
  rjps       RJPS register of social policy units (rjps.mrpips.gov.pl): all
             unit ids with coordinates in one call, the units inside
             Małopolska kept by point-in-polygon against the gmina GeoJSON
             from fetch-static-data.py, then one card page per unit; writes
             rjps/malopolska-units.json (id, TERC of the gmina, card fields).
  registers  NIW list of public-benefit organisations (XLSX), the
             accredited OWES list for Małopolska.
  rops       ROPS pages on the regional models, Usługa wrażliwa, IWS 2.0,
             the finished incubators and the CUS network, with the
             documents they link, and the publications named in the spec.
  paths      the acts and call pages behind the funding and legal paths
             (docs/functional-specification.md, 14.4), with the documents
             linked from the call pages.
  helplines  the helpline reference list (116sos.pl) and the Police notice
             of 116 123.

Tier 3 (COULD in the spec):
  incubators the incubators' own catalogues: Inkubator pomysłów, Sieci
             Wsparcia (editions 1 and 2), Popojutrze, TransferHUB; list
             pages with pagination, every entry page, the documents linked
             from the entries. An entry is a link on the list pages that
             matches the catalogue's pattern and is not on the home page.
  senior     the voivode's Senior+ lists (XLS, XLSX), the programme page,
             the register of care homes (DPS).
  prg        the official PRG boundaries of Małopolska from the GUGiK WFS
             (gminas, powiats, voivodeship; GML in EPSG:2180), to check the
             GeoJSON from fetch-static-data.py against.

Pages marked "follow" also get every PDF, DOC(X), XLS(X), ODT or ZIP they
link on the same site, and the sub-pages under the same path. Requests,
resumability, back-off and the size limit are those of crawl-catalogues.py
(log.jsonl per group, CRAWL_MAX_MB, default 50).

Usage (from the repository root, with the project venv):
  .venv/Scripts/python scripts/fetch-documents.py [group ...]
"""
import hashlib, html, importlib.util, json, os, re, sys, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("crawl", os.path.join(HERE, "crawl-catalogues.py"))
crawl = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(crawl)
Crawler, log, safe_name = crawl.Crawler, crawl.log, crawl.safe_name

ROOT = os.path.dirname(HERE)
crawl.RAW = os.path.join(ROOT, ".local", "docs")
GMINY = os.path.join(ROOT, ".local", "geojson", "gminy.json")
DOC_EXT = (".pdf", ".doc", ".docx", ".odt", ".xls", ".xlsx", ".ods", ".zip", ".rtf", ".ppt", ".pptx", ".odp", ".csv")

# Polish only: English versions linked from the pages are not followed.
NON_POLISH = re.compile(r"(_ENG?[._]|/en/|english|guide-to-)", re.I)

ROPS = "https://rops.krakow.pl"
# (url, follow): True downloads the linked documents and same-path sub-pages,
# "docs" only the linked documents.
GROUPS = {
    "registers": [
        ("https://niw.gov.pl/opp/wykaz-opp/?export=XLSX&data_scope=all&catalog=230", False),
        ("https://niw.gov.pl/opp/wykaz-opp/", False),
        ("https://wykazowes.ekonomiaspoleczna.gov.pl/owes/wojewodztwo/6.html", False),
        ("https://wykazowes.ekonomiaspoleczna.gov.pl/owes/action/export/wojewodztwo/6.html", False),
    ],
    "rops": [
        (ROPS + "/innowacje-spoleczne/innowacje-w-malopolskich-modelach", True),
        (ROPS + "/programy-i-modele/malopolskie-modele-uslug-spolecznych", True),
        (ROPS + "/realizowane-projekty-i-zadania/usluga-wrazliwa-upowszechnianie-innowacji-spolecznych-w-srodowiskach-lokalnych", True),
        (ROPS + "/realizowane-projekty-i-zadania/inkubator-wlaczenia-spolecznego-20", True),
        (ROPS + "/innowacje-spoleczne/publikacje-ze-swiata-innowacji", True),
        (ROPS + "/nabory-szkolenia-granty-dotacje-wizyty-studyjne-studia-specjalizacje-superwizje/granty-na-innowacje-spoleczne", True),
        (ROPS + "/zakonczone-projekty-i-zadania/inkubator-dostepnosci-projekt-zakonczony-31122022", True),
        (ROPS + "/zakonczone-projekty-i-zadania/inkubator-wlaczenia-spolecznego-projekt-zakonczony-31122023", True),
        (ROPS + "/zakonczone-projekty-i-zadania/malopolski-inkubator-innowacji-spolecznych-projekt-zakonczony-31072019", True),
        (ROPS + "/gremia-i-zespoly/malopolska-siec-centrow-uslug-spolecznych", True),
        (ROPS + "/kontakt/dzial-innowacji-spolecznych", False),
        (ROPS + "/mpliki/MACIUS/ABC_Diagnozy_final.pdf", False),
        (ROPS + "/mpliki/IS/BIBLIOTEKA_INNOWACJI_SPOECZNYCH/Zasady_wykorzystania_innowacji_MIIS.pdf", False),
        (ROPS + "/mpliki/IS/IWS_20/1._Zacznik_nr_1_Ogoszenie_o_naborze_IS.pdf", False),
        ("https://fundusze.malopolska.pl/nabory/8347-dzialanie-623-wlaczenie-spoleczne-projekty-wojewodztwa-malopolskiego-typ-projektu-c", True),
        ("https://www.malopolska.pl/aktualnosci/sprawy-spoleczne-i-rodzina/ii-nabor-do-projektu-usluga-wrazliwa-w-trakcie-nawet-600-tys-zl-na-wdrazanie-innowacji-spolecznych", True),
        ("https://mapadotacji.gov.pl/projekty/1677388/", False),
    ],
    "paths": [
        # Acts (primary texts)
        ("https://eli.gov.pl/eli/DU/2026/1040/ogl/pol", True),
        ("https://eli.gov.pl/eli/DU/2026/1003/ogl/pol", True),
        ("https://api.sejm.gov.pl/eli/acts/DU/2025/1338/text.pdf", False),
        ("https://api.sejm.gov.pl/eli/acts/DU/2026/662/text.pdf", False),
        ("https://api.sejm.gov.pl/eli/acts/DU/2014/301/text.pdf", False),
        ("https://api.sejm.gov.pl/eli/acts/DU/2025/1436/text.pdf", False),
        ("https://eli.gov.pl/api/acts/DU/2026/165/text/U/D20260165Lj.pdf", False),
        ("https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20240001453", False),
        ("https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WMP20250001255", False),
        ("https://www.gov.pl/web/pozytek/komunikat-w-zwiazku-z-wejsciem-w-zycie-1-wrzesnia-2026-r-nowelizacji-ustawy-o-dzialalnosci-pozytku-publicznego-i-o-wolontariacie", True),
        # Calls and programmes
        ("https://budzet.krakow.pl", False),
        ("https://www.bip.krakow.pl/?dok_id=242554", True),
        ("https://malopolskalokalnie.pl", False),
        ("https://malopolskalokalnie.pl/aktualnosci/rusza-konkurs-grantowy-moc-malopolskich-spolecznosci-2026/", True),
        ("https://www.malopolska.pl/samorzad/organizacje-pozarzadowe/dotacje-dla-ngo", True),
        ("https://www.malopolska.uw.gov.pl/", False),
        ("https://bo.malopolska.pl", False),
        ("https://ngo.krakow.pl/granty/323706,1061,komunikat,male_granty_na_2026_r__.html", True),
        ("https://niw.gov.pl/nasze-programy/nowefio/edycja-2026/nabor-wnioskow/", True),
        ("https://niw.gov.pl/nasze-programy/proo/edycja-2026/", True),
        ("https://www.gov.pl/web/senior/ogloszenie-o-konkursie-priorytet-v---asy-2026", True),
        ("https://niepelnosprawni.gov.pl/program-fs/", True),
        ("https://www.gov.pl/web/rodzina/program-korpus-wsparcia-seniorow-na-rok-2026", True),
        ("https://www.gov.pl/web/rodzina/maluch-2022-2029", True),
        ("https://www.pfron.org.pl/aktualnosci/szczegoly-aktualnosci/news/ogloszenie-konkursu-numer-12026-pod-nazwa-czas-na-aktywnosc/", True),
        ("https://plsk.eu/dla-wnioskodawcy/fundusz-malych-projektow/", True),
    ],
    "helplines": [
        ("https://116sos.pl/telefony-pomocowe", False),
        ("https://policja.pl/pol/kgp/biuro-prewencji/aktualnosci/50368,116-123-Ogolnopolska-Poradnia-Telefoniczna-dla-Osob-Przezywajacych-Kryzys-Emocjo.html", False),
    ],
    "senior": [
        ("https://www.malopolska.uw.gov.pl/Docs/Wykaz%20funkcjonuj%C4%85cych%20o%C5%9Brodk%C3%B3w%20Senior%20w%20Ma%C5%82opolsce.xlsx", False),
        ("https://www.malopolska.uw.gov.pl/doc/Wykaz%20plac%C3%B3wek%20Klub%C3%B3w%20Senior.xls", False),
        ("https://www.malopolska.uw.gov.pl/default.aspx?page=senior", "docs"),
    ],
}

# The voivode's BIP renders pages with JavaScript; its JSON API lists the attachments.
# Article 3261 is the register of care homes (DPS) and 24-hour care facilities,
# a version history since 2018; only the attachments published since this date are kept.
BIP_ARTICLES = {"senior": [(3261, "2026-06-30")]}

# Tier 3 incubator catalogues: list pages, entry pattern, home page whose links are navigation.
CATALOGUES = {
    "inkubator-pomyslow": {
        "lists": ["https://inkubatorpomyslow.org.pl/innowacje/"],
        "entry": r"^https://inkubatorpomyslow\.org\.pl/innowacje/(?!page/)[^/]+/$",
        "home": "https://inkubatorpomyslow.org.pl/"},
    "sieci-wsparcia": {
        "lists": ["https://sieciwsparcia.pl/poprzednie-innowacje/"],
        "entry": r"^https://(sieciwsparcia2\.pl/innowacje2|sieciwsparcia1\.e\.org\.pl/project)/[^/]+/?$",
        "home": "https://sieciwsparcia.pl/"},
    "popojutrze": {
        "lists": ["https://popojutrze2.pl/innowacje2/?kat=innowacje"],
        "entry": r"^https://popojutrze2\.pl/(?!nabor|innowacje2/|edupopo/|feed/|blog/|news/)[a-z0-9-]+/$",
        "home": "https://popojutrze2.pl/"},
    "transferhub": {
        "lists": ["https://transferhub.pl/innowacje2024-2027/", "https://transferhub.pl/poprzednia-edycja/innowacje-przetestowane/",
                  "https://transferhub.pl/nasze-innowacje/"],
        "entry": r"^https://transferhub\.pl/[a-z0-9_-]+/$",
        "home": "https://transferhub.pl/"},
}
PAGINATION = re.compile(r"/page/\d+/?$")

PRG_WFS = "https://mapy.geoportal.gov.pl/wss/service/PZGIK/PRG/WFS/AdministrativeBoundaries"
PRG_LAYERS = {"gminy": "ms:A03_Granice_gmin", "powiaty": "ms:A02_Granice_powiatow", "wojewodztwo": "ms:A01_Granice_wojewodztw"}


def rel_path(url, default_ext=".html"):
    p = urllib.parse.urlparse(url)
    path = urllib.parse.unquote(p.path).strip("/") or "index"
    if p.query:
        path += "_" + p.query
    parts = [short(safe_name(s)) for s in path.split("/")]
    if not os.path.splitext(parts[-1])[1].lower() in DOC_EXT + (".html", ".htm", ".xml", ".json"):
        parts[-1] += default_ext
    return os.path.join(safe_name(p.netloc), *parts)


def short(name, limit=60):
    """Keep path components short: Windows refuses paths over 260 characters."""
    if len(name) <= limit:
        return name
    stem, ext = os.path.splitext(name)
    if len(ext) > 6:
        stem, ext = name, ""
    return stem[:limit - 9 - len(ext)] + "-" + hashlib.sha1(name.encode()).hexdigest()[:8] + ext


def fetch_group(name):
    c = Crawler(name, crawl.BROWSER_UA, 1.5)
    ok = 0
    for url, follow in GROUPS[name]:
        ext = ".xlsx" if "export=XLSX" in url else ".html"
        path = rel_path(url, ext)
        if "/action/export/" in url:
            path = path[:-len(".html")] + ".csv"
        body = c.fetch(url, path)
        ok += body is not None
        if follow and body and body[:4] != b"%PDF":
            follow_page(c, url, body, docs_only=follow == "docs")
    for article, since in BIP_ARTICLES.get(name, []):
        body = c.fetch(f"https://bip.malopolska.pl/api/articles/{article}", f"bip.malopolska.pl/article-{article}.json")
        atts = [a for a in json.loads(body or b"{}").get("attachments", []) if a["publishDate"][:10] >= since]
        for a in atts:
            fname = short(safe_name(f"{a['id']} {a['name']}")) + ("" if a["name"].lower().endswith("." + a["extension"].lower()) else "." + a["extension"])
            c.fetch(f"https://bip.malopolska.pl/{a['link']}", f"bip.malopolska.pl/article-{article}/{fname}")
        log(f"{name}: BIP article {article}: {len(atts)} attachments since {since}")
    log(f"{name}: {ok}/{len(GROUPS[name])} listed pages fetched")


def follow_page(c, url, body, max_pages=60, docs_only=False):
    """Walk the sub-pages under the same path (ROPS tabs are "...,o-projekcie",
    "...,wyniki") and ROPS attachment pages; download every linked document.
    With docs_only, only the documents linked from this page."""
    base = urllib.parse.urlparse(url)
    prefix = base.path.split(",")[0].rstrip("/")
    seen, queue = {url}, [(url, body)]
    while queue and len(seen) <= max_pages:
        page_url, page = queue.pop(0)
        for href in re.findall(r'href="([^"#]+)"', html.unescape(page.decode("utf-8", "replace"))):
            full = urllib.parse.urljoin(page_url, href.strip())
            p = urllib.parse.urlparse(full)
            if p.netloc != base.netloc or full in seen:
                continue
            is_doc = urllib.parse.unquote(p.path).lower().endswith(DOC_EXT)
            is_sub = not is_doc and not docs_only and ((len(prefix) > 1 and p.path.startswith(prefix)) or p.path.startswith("/pliki-do-pobrania/wpis,"))
            if not (is_doc or is_sub) or NON_POLISH.search(urllib.parse.unquote(p.path)):
                continue
            seen.add(full)
            got = c.fetch(full, rel_path(full))
            if is_sub and got:
                queue.append((full, got))


def point_in_ring(x, y, ring):
    inside, j = False, len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][:2]
        xj, yj = ring[j][:2]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def load_gminy():
    gminy = []
    for f in json.load(open(GMINY, encoding="utf-8"))["features"]:
        code = f["properties"]["JPT_KOD_JE"]
        if not code.startswith("12"):
            continue
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        xs = [pt[0] for poly in polys for pt in poly[0]]
        ys = [pt[1] for poly in polys for pt in poly[0]]
        gminy.append((code, f["properties"]["JPT_NAZWA_"], polys, (min(xs), min(ys), max(xs), max(ys))))
    return gminy


def locate(x, y, gminy):
    for code, name, polys, (x0, y0, x1, y1) in gminy:
        if x0 <= x <= x1 and y0 <= y <= y1:
            for poly in polys:
                if point_in_ring(x, y, poly[0]) and not any(point_in_ring(x, y, h) for h in poly[1:]):
                    return code, name
    return None


def fetch_rjps():
    base = "https://rjps.mrpips.gov.pl/RJPS/WJ/"
    c = Crawler("rjps", crawl.BROWSER_UA, 1.0)
    # The map endpoint is a JSON POST; the Crawler only does GET, so call it directly once.
    import urllib.request
    all_path = os.path.join(c.dir, "all-units.json")
    if not os.path.exists(all_path):
        req = urllib.request.Request(base + "wyszukiwanie/zaladujDane.do", data=b'{"filtry":{}}', method="POST",
                                     headers={"User-Agent": crawl.BROWSER_UA, "Content-Type": "application/json",
                                              "X-Requested-With": "XMLHttpRequest"})
        with urllib.request.urlopen(req, timeout=120) as r:
            open(all_path, "wb").write(r.read())
    units = json.load(open(all_path, encoding="utf-8"))
    gminy = load_gminy()
    mp = []
    for u in units:
        hit = locate(u["x"], u["y"], gminy)
        if hit:
            mp.append({"id": u["id"], "x": u["x"], "y": u["y"], "terc": hit[0], "gmina": hit[1]})
    log(f"rjps: {len(units)} units in Poland, {len(mp)} inside Małopolska")
    out = []
    for i, u in enumerate(mp, 1):
        body = c.fetch(f"{base}karta.do?idJednostki={u['id']}&rootElem=karta", f"cards/{u['id']}.html")
        card = {}
        m = re.search(r"ustawMetaDataDlaJednostki\('(?:[^'\\]|\\.)*','(\{.*?\})'\)", (body or b"").decode("utf-8", "replace"))
        if m:
            try:
                card = json.loads(m.group(1))
            except ValueError:
                pass
        out.append({**u, **card})
        if i % 100 == 0:
            log(f"rjps: {i}/{len(mp)} cards")
    with open(os.path.join(c.dir, "malopolska-units.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    log(f"rjps: done, {len(out)} Małopolska units")


def page_links(url, body):
    text = html.unescape((body or b"").decode("utf-8", "replace"))
    return {urllib.parse.urljoin(url, h.strip()).split("#")[0] for h in re.findall(r'href="([^"#][^"]*)"', text)}


def fetch_incubators():
    c = Crawler("incubators", crawl.TEAM_UA, 2.0)
    for name, cat in CATALOGUES.items():
        entry = re.compile(cat["entry"])
        nav = page_links(cat["home"], c.fetch(cat["home"], os.path.join(name, rel_path(cat["home"]))))
        lists, seen_lists, entries = list(cat["lists"]), set(), set()
        while lists:
            url = lists.pop(0)
            if url in seen_lists:
                continue
            seen_lists.add(url)
            links = page_links(url, c.fetch(url, os.path.join(name, rel_path(url))))
            lists += [l for l in links if PAGINATION.search(l) and l.startswith(cat["lists"][0].split("?")[0])]
            entries |= {l for l in links if entry.match(l) and l not in nav and l not in cat["lists"]}
        log(f"incubators: {name}: {len(entries)} entries on {len(seen_lists)} list pages")
        docs = set()
        for url in sorted(entries):
            body = c.fetch(url, os.path.join(name, rel_path(url)))
            docs |= {l for l in page_links(url, body) if urllib.parse.unquote(urllib.parse.urlparse(l).path).lower().endswith(DOC_EXT)}
        # Documents on the list pages too (Sieci Wsparcia keeps a PDF of the other innovations there).
        for url in seen_lists:
            docs |= {l for l in page_links(url, c.read(url)) if urllib.parse.unquote(urllib.parse.urlparse(l).path).lower().endswith(DOC_EXT)}
        docs = sorted(d for d in docs if not NON_POLISH.search(urllib.parse.unquote(d)))
        for d in docs:
            c.fetch(d, os.path.join(name, rel_path(d)))
        log(f"incubators: {name}: {len(docs)} documents")


def fetch_prg():
    c = Crawler("prg", crawl.TEAM_UA, 2.0)
    flt = ('<Filter xmlns="http://www.opengis.net/fes/2.0"><PropertyIsLike wildCard="*" singleChar="." escapeChar="!">'
           '<ValueReference>JPT_KOD_JE</ValueReference><Literal>12*</Literal></PropertyIsLike></Filter>')
    for name, layer in PRG_LAYERS.items():
        q = urllib.parse.urlencode({"SERVICE": "WFS", "VERSION": "2.0.0", "REQUEST": "GetFeature", "TYPENAMES": layer, "FILTER": flt})
        body = c.fetch(f"{PRG_WFS}?{q}", f"malopolska-{name}.gml")
        n = re.search(rb'numberReturned="(\d+)"', body or b"")
        log(f"prg: {name}: {n.group(1).decode() if n else '?'} features")


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    names = sys.argv[1:] or ["registers", "rops", "paths", "helplines", "rjps", "senior", "incubators", "prg"]
    special = {"rjps": fetch_rjps, "incubators": fetch_incubators, "prg": fetch_prg}
    rc = 0
    for n in names:
        try:
            special[n]() if n in special else fetch_group(n)
        except Exception as e:
            log(f"{n}: STOPPED: {type(e).__name__}: {e}")
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main())
