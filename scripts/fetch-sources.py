"""Save copies of the web sources of a legal or funding path, for the skill /research-paths (.local/paths-research/, git-ignored).

Fetches every URL into <into>/<host>/<path> and records it in <into>/log.jsonl with the crawler of
crawl-catalogues.py (browser user agent, back-off, the size limit CRAWL_MAX_MB, default 50; resumable: a URL
already in the folder's log is not fetched again unless --refresh names it). Beside every HTML, PDF, DOCX and
JSON copy (the type read from the first bytes, since servers send PDFs under any name) it writes <file>.txt with
the text, so the copy can be read and quoted cheaply; PDF text needs pypdf on PYTHONPATH (without it, the line
says "no text").

- A copy whose text is under 200 characters, or that is a bot check or a script shell ("Pardon Our
  Interruption", "enable JavaScript"), is printed as "THIN <copy> (<reason>) <- <url>", logged with status
  "thin" and counted as failed; a rerun fetches it again.
- An ISAP address is also fetched as the act's ELI page, a BIP Malopolska article as its JSON API record with
  its attachments (printed as "HINT" lines).
- --follow also saves the documents an HTML page links: links ending in a document extension, attachment links
  without one (gov.pl "/attachment/", ROPS "/pliki-do-pobrania/", "?f=<name>.pdf" and the like) and links whose
  text names a document (PDF, pobierz, załącznik, regulamin, ogłoszenie), on the same host, on the file hosts of
  FILE_HOSTS or on the hosts of --hosts. A followed link that turns out to be an ordinary page is deleted.
- --refresh saves the listed URLs again; the previous copy keeps the date of its fetch in its name.
- --index writes <into>/index.md: per copy its title, first date and the lines with dates, amounts, calls,
  suspensions, extensions, rules and eligibility lists. It is read to find facts, never quoted.

Prints one line per saved file: the HTTP status, the copy, the text file. Exit 1 when a listed URL failed or a
copy is thin.

Usage (from the repository root, with the project venv):
  .venv/Scripts/python scripts/fetch-sources.py --into .local/paths-research/<date>/<id>/sources [--follow] [--hosts h1,h2] URL ...
  .venv/Scripts/python scripts/fetch-sources.py --into ... --path <id> [URL ...]
  .venv/Scripts/python scripts/fetch-sources.py --into ... --refresh URL ...
  .venv/Scripts/python scripts/fetch-sources.py --into ... --index
--path adds the source_url of data/built/paths/<id>.yaml.
"""
import argparse, html, importlib.util, json, os, re, sys, urllib.parse, zipfile

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


docs = load("fetch_documents", "fetch-documents.py")   # rel_path, DOC_EXT; it loads crawl-catalogues.py
crawl = docs.crawl

THIN_CHARS = 200
BOT = re.compile(r"(?i)pardon our interruption|enable javascript|włącz\w* (obsługę )?javascript|checking your browser"
                 r"|just a moment|access denied|request unsuccessful")
# Hosts that serve the documents of the bodies of the paths; --follow fetches documents there too.
FILE_HOSTS = {"plikimpi.krakow.pl", "www.bip.krakow.pl", "bip.malopolska.pl", "malopolska-lokalnie.zenx.pl"}
ATTACHMENT = re.compile(r"(?i)/attachment/|/pliki-do-pobrania/|/zalacznik|getPdf|/download|/pobierz|/uploads/|/files?/"
                        r"|[?&]f=[^&]+\.(pdf|docx?)")
DOC_ANCHOR = re.compile(r"(?i)\b(pdf|docx?|xlsx?)\b|pobierz|załącznik|regulamin|ogłoszenie|wzór|harmonogram")
ANCHOR = re.compile(r'<a\b[^>]*href="([^"#]+)"[^>]*>(.*?)</a>', re.S | re.I)
EXT_OF = {"pdf": ".pdf", "docx": ".docx", "html": ".html", "json": ".json"}

MONTHS = "stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia"
DATE = re.compile(rf"\b\d{{1,2}}\.\d{{2}}\.\d{{4}}\b|\b\d{{4}}-\d{{2}}-\d{{2}}\b|\b\d{{1,2}} ({MONTHS}) \d{{4}}\b", re.I)
AMOUNT = re.compile(r"\d[\d  .]*\s?(zł|tys\.|mln)")
TERMS = re.compile(r"(?i)nab[oó]r|termin|ogłosz|konkurs|regulamin|wstrzym|zawiesz|przedłuż|wydłuż|zamkn|do wyczerpania"
                   r"|wkład własny")
LEGAL = re.compile(r"(?i)art\. 3 ust\. 3|spółdzielni|koła gospodyń|kościeln|osob[ay] fizyczn|wchodzi w życie|traci moc")
LONG_TEXT = 150_000   # acts and consolidated texts: only the LEGAL lines
INDEX_LINES = 40


def html_text(body):
    """The readable text of an HTML page: no scripts or styles, one line per block."""
    text = body.decode("utf-8", "replace") if isinstance(body, bytes) else body
    text = re.sub(r"(?is)<(script|style|noscript|svg)\b.*?</\1>", " ", text)
    text = re.sub(r"(?i)<br\s*/?>|</(p|div|li|tr|h[1-6]|section|article|header|footer|table)>", "\n", text)
    text = re.sub(r"(?i)</t[dh]>", " | ", text)
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    lines = (re.sub(r"[ \t\r\f\v]+", " ", line).strip() for line in text.split("\n"))
    return "\n".join(line for line in lines if line) + "\n"


def pdf_text(path):
    try:
        import pypdf
    except ImportError:
        return None
    reader = pypdf.PdfReader(path)
    return "\n".join(f"--- page {i} ---\n{page.extract_text() or ''}" for i, page in enumerate(reader.pages, 1)) + "\n"


def docx_text(path):
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8", "replace")
    paragraphs = re.split(r"</w:p>", xml)
    return "\n".join(html.unescape(re.sub(r"<[^>]+>", "", p)) for p in paragraphs).strip() + "\n"


def json_text(path):
    """The strings of a JSON record (a BIP API article), HTML removed, one per line with its key."""
    out = []

    def walk(value, key):
        if isinstance(value, dict):
            for k, v in value.items():
                if isinstance(v, (dict, list)) and v:
                    out.append(f"{k}:")   # a group name, e.g. "Akty zmieniające" of the ELI API
                walk(v, k)
        elif isinstance(value, list):
            for v in value:
                walk(v, key)
        elif isinstance(value, str) and value.strip():
            text = html_text(value).strip() if "<" in value else value.strip()
            out.append(f"{key}: {text}")

    with open(path, encoding="utf-8") as f:
        walk(json.load(f), "")
    return "\n".join(out) + "\n"


def kind_of(full):
    """'pdf', 'docx', 'html', 'json' or None, by the first bytes: servers send PDFs under names without .pdf."""
    with open(full, "rb") as f:
        head = f.read(2048)
    if head.startswith(b"%PDF"):
        return "pdf"
    if head.startswith(b"PK"):
        try:
            with zipfile.ZipFile(full) as z:
                return "docx" if "word/document.xml" in z.namelist() else None
        except zipfile.BadZipFile:
            return None
    if full.lower().endswith(".json") or head.lstrip()[:1] in (b"{", b"["):   # the ELI and BIP APIs
        try:
            with open(full, encoding="utf-8") as f:
                json.load(f)
            return "json"
        except (ValueError, UnicodeDecodeError):
            pass
    if full.lower().endswith((".html", ".htm")) or b"<html" in head.lower() or b"<!doctype html" in head.lower():
        return "html"
    return None


def stale_text(full):
    """True when full + '.txt' is missing, or came from a PDF or JSON read as HTML (copies saved before kind_of)."""
    if not os.path.exists(full + ".txt"):
        return True
    kind = kind_of(full)
    with open(full + ".txt", encoding="utf-8", errors="replace") as f:
        start = f.read(16)
    if kind == "pdf":
        return not start.startswith("--- page")
    return kind == "json" and start.lstrip()[:1] in ("{", "[")   # a JSON record read as HTML


def write_text(full):
    """Write full + '.txt' with the copy's text; returns the text file, or None for another type or without pypdf."""
    try:
        kind = kind_of(full)
        if kind == "html":
            text = html_text(open(full, "rb").read())
        elif kind == "pdf":
            text = pdf_text(full)
        elif kind == "docx":
            text = docx_text(full)
        elif kind == "json":
            text = json_text(full)
        else:
            return None
    except Exception as e:   # a damaged file must not stop the others
        print(f"  no text from {full}: {type(e).__name__}: {e}", file=sys.stderr)
        return None
    if text is None:
        return None
    with open(full + ".txt", "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    return full + ".txt"


def thin_reason(full):
    """Why the copy's text is not a real copy (a bot check, a script shell, a PDF without a text layer), or None."""
    path = full + ".txt"
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8", errors="replace") as f:
        text = f.read()
    body = re.sub(r"--- page \d+ ---|\s+", "", text)
    if len(body) < 5000 and BOT.search(text):
        return "bot check"
    if len(body) < THIN_CHARS:
        return "no text layer" if kind_of(full) == "pdf" else "script shell"
    return None


def rewrites(url):
    """Better addresses for the same document: the ELI page of an ISAP act, the API record of a BIP Malopolska article."""
    m = re.search(r"isap\.sejm\.gov\.pl/isap\.nsf/DocDetails\.xsp\?id=W(DU|MP)(\d{4})(\d{4,})", url)
    if m:
        return [f"https://eli.gov.pl/eli/{m.group(1)}/{m.group(2)}/{int(m.group(3))}/ogl/pol"]
    m = re.search(r"//bip\.malopolska\.pl/[^/?#]*,a,(\d+)", url)
    if m:
        return [f"https://bip.malopolska.pl/api/articles/{m.group(1)}"]
    return []


def fix_extension(c, url):
    """Give a copy saved without a known extension the one of its detected type; returns the full path."""
    rec = c.done[url]
    full = crawl.long_path(os.path.join(c.dir, rec["path"]))
    root, ext = os.path.splitext(rec["path"])
    kind = kind_of(full)
    if ext.lower() != ".bin" or kind not in EXT_OF:
        return full
    new_rel = root + EXT_OF[kind]
    new_full = crawl.long_path(os.path.join(c.dir, new_rel))
    os.replace(full, new_full)
    c.record({**{k: v for k, v in rec.items() if k != "time"}, "path": new_rel})
    return new_full


def fetch(c, url):
    """Fetch url into the folder (no extension guessed: '.bin' until the type is known); returns the body."""
    body = c.fetch(url, docs.rel_path(url, ".bin"))
    if body is not None and url in c.done:
        fix_extension(c, url)
    return body


def fetch_bip_article(c, url):
    """The JSON record of a BIP Malopolska article and every attachment it lists."""
    body = fetch(c, url)
    try:
        record = json.loads(body or b"{}")
    except ValueError:
        return
    article = url.rstrip("/").rsplit("/", 1)[-1]
    for a in record.get("attachments", []):
        name = docs.short(crawl.safe_name(f"{a.get('id')} {a.get('name', '')}"))
        ext = (a.get("extension") or "").lower()
        if ext and not name.lower().endswith("." + ext):
            name += "." + ext
        c.fetch(f"https://bip.malopolska.pl/{a['link'].lstrip('/')}", f"bip.malopolska.pl/article-{article}/{name}")


def document_links(page_url, body, hosts):
    """The links of a page that point to documents, by extension, address or link text."""
    base = urllib.parse.urlparse(page_url).netloc
    found = {}
    for href, text in ANCHOR.findall(body.decode("utf-8", "replace")):
        full = urllib.parse.urljoin(page_url, html.unescape(href).strip())
        p = urllib.parse.urlparse(full)
        if p.scheme not in ("http", "https") or full == page_url:
            continue
        if p.netloc != base and p.netloc not in hosts:
            continue
        path = urllib.parse.unquote(p.path)
        if docs.NON_POLISH.search(path):
            continue
        anchor = re.sub(r"<[^>]+>", " ", text)
        if path.lower().endswith(docs.DOC_EXT) or ATTACHMENT.search(full) or DOC_ANCHOR.search(anchor):
            found.setdefault(full, True)
    return list(found)


def follow(c, page_url, body, hosts, depth=0):
    """Save the documents a page links; an attachment page of ROPS is followed one level more."""
    for link in document_links(page_url, body, hosts):
        if link in c.done:
            continue
        got = fetch(c, link)
        if got is None or link not in c.done:
            continue
        rec = c.done[link]
        full = crawl.long_path(os.path.join(c.dir, rec["path"]))
        kind = kind_of(full)
        has_doc_ext = urllib.parse.unquote(urllib.parse.urlparse(link).path).lower().endswith(docs.DOC_EXT)
        if kind in ("pdf", "docx") or has_doc_ext:
            continue
        if kind == "html" and "/pliki-do-pobrania/" in link and depth == 0:
            follow(c, link, got, hosts, depth + 1)
            continue
        os.remove(full)
        c.record({"url": link, "status": "skipped", "reason": "not-a-document"})


def last_status(logpath):
    """The status of the latest record of every URL in the log."""
    last = {}
    if os.path.exists(logpath):
        for line in open(logpath, encoding="utf-8"):
            rec = json.loads(line)
            last[rec["url"]] = rec
    return last


def refresh(c, url):
    """Keep the previous copy of url under a dated name and forget it, so it is fetched again."""
    rec = c.done.pop(url, None)
    if not rec or rec["status"] != 200:
        return
    full = crawl.long_path(os.path.join(c.dir, rec["path"]))
    stem, ext = os.path.splitext(full)
    dated = f"{stem}.{rec.get('time', 'old')[:10]}{ext}"
    for src, dst in ((full, dated), (full + ".txt", dated + ".txt")):
        if os.path.exists(src):
            os.replace(src, dst)


def write_index(into, entries):
    """<into>/index.md: per copy its title, its first date and the lines worth reading first."""
    out = ["# Index of the saved copies", "",
           "Generated by scripts/fetch-sources.py --index. Read it to find facts; quote only the copies.", ""]
    for rel, url, full in sorted(entries):
        with open(full + ".txt", encoding="utf-8", errors="replace") as f:
            text = f.read()
        lines = text.split("\n")
        title = next((l.strip() for l in lines if l.strip() and not l.startswith("--- page")), "")[:160]
        first_date = DATE.search(text)
        long_text = len(text) > LONG_TEXT
        hits = []
        for n, line in enumerate(lines, 1):
            if long_text:
                hit = LEGAL.search(line)
            else:
                hit = DATE.search(line) or AMOUNT.search(line) or TERMS.search(line) or LEGAL.search(line)
            if hit and line.strip():
                hits.append(f"{n}: {line.strip()[:160]}")
            if len(hits) >= INDEX_LINES:
                break
        reason = thin_reason(full)
        out += [f"## {rel}", "", f"- URL: {url}", f"- Kind: {kind_of(full)}, {os.path.getsize(full)} bytes"
                + (f", THIN ({reason})" if reason else ""),
                f"- Title: {title}", f"- First date: {first_date.group(0) if first_date else 'none'}"
                + ("; long text: only the legal lines" if long_text else ""), ""]
        out += [f"    {h}" for h in hits] or ["    (no matching line)"]
        out.append("")
    path = os.path.join(into, "index.md")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(out))
    return path


def main():
    ap = argparse.ArgumentParser(description="Save copies of a path's web sources, with their text.")
    ap.add_argument("urls", nargs="*", help="the pages and documents to save")
    ap.add_argument("--into", required=True, help="the folder of the copies, e.g. .local/paths-research/<date>/<id>/sources")
    ap.add_argument("--path", help="also the source_url of data/built/paths/<id>.yaml")
    ap.add_argument("--follow", action="store_true", help="also the documents an HTML page links")
    ap.add_argument("--hosts", default="", help="comma-separated extra hosts whose documents --follow saves")
    ap.add_argument("--refresh", action="store_true", help="save the listed URLs again, keeping the old copies")
    ap.add_argument("--index", action="store_true", help="write <into>/index.md after the fetch")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    urls = list(args.urls)
    if args.path:
        with open(os.path.join(ROOT, "data", "built", "paths", f"{args.path}.yaml"), encoding="utf-8") as f:
            urls.insert(0, yaml.safe_load(f)["source_url"])
    if not urls and not args.index:
        ap.error("no URL given")
    into = os.path.abspath(args.into)
    crawl.RAW = os.path.dirname(into)
    c = crawl.Crawler(os.path.basename(into), crawl.BROWSER_UA, 1.5)
    for url, rec in last_status(c.logpath).items():   # a thin copy is fetched again
        if rec["status"] == "thin":
            c.done.pop(url, None)
    hosts = FILE_HOSTS | {h.strip() for h in args.hosts.split(",") if h.strip()}

    failed = 0
    listed = list(dict.fromkeys(urls))
    for url in listed:
        if args.refresh:
            refresh(c, url)
        body = fetch(c, url)
        if body is None:
            failed += 1
        elif args.follow and kind_of(crawl.long_path(os.path.join(c.dir, c.done[url]["path"]))) == "html":
            follow(c, url, body, hosts)
        for better in rewrites(url):
            print(f"HINT {url} -> {better}")
            if "bip.malopolska.pl/api/articles/" in better:
                fetch_bip_article(c, better)
            else:
                fetch(c, better)

    entries = []
    for url, rec in list(c.done.items()):
        if rec["status"] != 200:
            print(f"{rec['status']} {url}")
            continue
        full = crawl.long_path(os.path.join(c.dir, rec["path"]))
        if not os.path.exists(full):
            continue
        text = write_text(full) if stale_text(full) else full + ".txt"
        shown = os.path.relpath(os.path.join(c.dir, rec["path"]), ROOT).replace(os.sep, "/")
        reason = thin_reason(full) if text else None
        if reason:
            print(f"THIN {shown} ({reason}) <- {url}")
            c.record({"url": url, "status": "thin", "reason": reason, "path": rec["path"]})
            c.done.pop(url, None)
            failed += url in listed or url in {b for u in listed for b in rewrites(u)}
            continue
        print(f"200 {shown} {'+ .txt' if text else '(no text)'} <- {url}")
        if text:
            entries.append((rec["path"], url, full))
    if args.index:
        print(f"index: {os.path.relpath(write_index(into, entries), ROOT)}")
    print(f"{len(entries)} copies with text in {os.path.relpath(into, ROOT)}, {failed} listed URLs failed or thin")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
