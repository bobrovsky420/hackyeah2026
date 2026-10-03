"""Snapshot the two innovation catalogues into .local/raw/ (git-ignored).

Raw pages and files only; parsing into data/ is a separate step that can be
re-run without touching the sites (docs/functional-specification.md, 7.1).

Sources:
  s1        innowacjespoleczne.pl: taxonomy JSON, list pages, incubator
            profiles, every entry page; 2.5 s between requests, a
            User-Agent naming the team.

Polish pages only: the English versions of S1 are not fetched.
  s1-files  the attachments linked from the S1 entry pages
            (cdn.innowacjespoleczne.pl), videos skipped; 1.5 s apart.
  s2        rops.krakow.pl Biblioteka innowacji społecznych: nine category
            pages and every entry page; 1 s apart, browser User-Agent
            (the site refuses other clients).
  s2-files  the PDFs, ZIPs and documents linked from the S2 entry pages.

Every request is appended to .local/raw/<source>/log.jsonl (url, status,
path, bytes, sha256, time). A re-run skips URLs already fetched with 200 or
404, so an interrupted crawl resumes where it stopped. HTTP 429 and 5xx back
off (60 s, 120 s, 240 s); ten failures in a row stop the source. Files
over CRAWL_MAX_MB (default 50) are logged as skipped with their size.

Usage (from the repository root, with the project venv):
  .venv/Scripts/python scripts/crawl-catalogues.py s1 s1-files
  .venv/Scripts/python scripts/crawl-catalogues.py s2 s2-files
"""
import datetime, hashlib, html, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, ".local", "raw")
TEAM_UA = "HackYeah2026 social-innovation router (catalogue snapshot; bobrovsky@gmx.ch)"
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

S1 = "https://innowacjespoleczne.pl"
S1_LIST = S1 + "/lista-innowacji/?on_page=64&strona={}"
S1_PROFILES = S1 + "/profile/?view=grid&order_by=date&on_page=64&search-phrase=&search-category=inkubator&state=&strona={}"
S1_TAXONOMY = S1 + "/wp-json/laravel/v1/fetch-tags?type=advanced"

S2 = "https://rops.krakow.pl"
S2_LIBRARY = S2 + "/innowacje-spoleczne/biblioteka-innowacji-spolecznych/"
S2_CATEGORIES = ["dla-seniorow", "dla-dzieci-mlodziezy-i-rodziny", "dla-osob-o-ograniczonej-mobilnosci",
                 "dla-osob-z-niepelnosprawnoscia-sensoryczna", "dla-zdrowia-i-medycyny", "dla-rynku-pracy",
                 "dla-cudzoziemcow", "dla-osob-w-kryzysie-bezdomnosci", "dla-osob-z-niepelnosprawnoscia-intelektualna"]

# Some ROPS packages are tens of GB (videos inside ZIPs); larger files are
# logged as skipped with their size instead of being downloaded.
MAX_BYTES = int(os.environ.get("CRAWL_MAX_MB", "50")) * 1024 * 1024
# Polish only: attachments that are English versions or English subtitles are not downloaded.
NON_POLISH = re.compile(r"(_en_|[ _-]ENG?[._ ]|/en/|english|guide-to-)", re.I)
VIDEO_EXT = (".mp4", ".mov", ".avi", ".wmv", ".mkv", ".m4v", ".webm", ".mpg", ".mpeg", ".flv")
FILE_EXT = (".pdf", ".zip", ".doc", ".docx", ".odt", ".ppt", ".pptx", ".odp", ".xls", ".xlsx", ".ods", ".rtf", ".txt", ".rar", ".7z", ".jpg", ".jpeg", ".png", ".epub", ".mp3")


def log(msg):
    print(f"{datetime.datetime.now():%H:%M:%S} {msg}", flush=True)


def long_path(p):
    """Windows refuses paths over 260 characters unless they carry the \\\\?\\ prefix."""
    p = os.path.abspath(p)
    return "\\\\?\\" + p if os.name == "nt" and not p.startswith("\\\\?\\") else p


def safe_name(s):
    s = re.sub(r'[<>:"|?*\\\x00-\x1f]', "_", s).strip(" .")
    return s[:150] or "_"


class Crawler:
    def __init__(self, source, ua, delay):
        self.dir = os.path.join(RAW, source)
        os.makedirs(self.dir, exist_ok=True)
        self.logpath = os.path.join(self.dir, "log.jsonl")
        self.ua, self.delay, self.failures, self.last = ua, delay, 0, 0.0
        self.done = {}
        if os.path.exists(self.logpath):
            for line in open(self.logpath, encoding="utf-8"):
                rec = json.loads(line)
                if rec["status"] in (200, 404, "skipped"):
                    self.done[rec["url"]] = rec

    def record(self, rec):
        rec["time"] = datetime.datetime.now().isoformat(timespec="seconds")
        with open(self.logpath, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        if rec["status"] in (200, 404, "skipped"):
            self.done[rec["url"]] = rec

    def read(self, url):
        """Content of an already fetched URL, or None."""
        rec = self.done.get(url)
        if rec and rec["status"] == 200 and rec.get("path"):
            p = long_path(os.path.join(self.dir, rec["path"]))
            if os.path.exists(p):
                return open(p, "rb").read()
        return None

    def fetch(self, url, relpath, skip_video=False):
        """Fetch url into relpath; returns the body (None on 404, skip or failure)."""
        cached = self.read(url)
        if cached is not None or (url in self.done and self.done[url]["status"] != 200):
            return cached
        if self.failures >= 10:
            raise RuntimeError("ten failures in a row, stopping this source")
        for attempt in range(4):
            wait = self.delay - (time.time() - self.last)
            if wait > 0:
                time.sleep(wait)
            self.last = time.time()
            try:
                # Some hrefs carry raw Polish letters or spaces; percent-encode them.
                req = urllib.request.Request(urllib.parse.quote(url, safe=":/?&=%#+,;@~!$'()*"), headers={"User-Agent": self.ua, "Accept-Language": "pl,en;q=0.5"})
                with urllib.request.urlopen(req, timeout=300) as r:
                    ctype = r.headers.get("Content-Type", "")
                    if skip_video and ctype.startswith("video/"):
                        self.record({"url": url, "status": "skipped", "reason": ctype})
                        return None
                    size = int(r.headers.get("Content-Length") or 0)
                    if size > MAX_BYTES:
                        self.record({"url": url, "status": "skipped", "reason": "too-large", "bytes": size})
                        return None
                    body = r.read(MAX_BYTES + 1)
                    if len(body) > MAX_BYTES:
                        self.record({"url": url, "status": "skipped", "reason": "too-large", "bytes": None})
                        return None
                break
            except urllib.error.HTTPError as e:
                if e.code == 404 or e.code == 410:
                    self.record({"url": url, "status": 404})
                    self.failures = 0
                    return None
                if (e.code == 429 or e.code >= 500) and attempt < 3:
                    log(f"  HTTP {e.code} on {url}, backing off {60 * 2 ** attempt} s")
                    time.sleep(60 * 2 ** attempt)
                    continue
                self.record({"url": url, "status": e.code})
                self.failures += 1
                log(f"  HTTP {e.code} on {url}")
                return None
            except Exception as e:
                if attempt < 3:
                    log(f"  {type(e).__name__} on {url}, retrying in 30 s")
                    time.sleep(30)
                    continue
                self.record({"url": url, "status": "error", "error": str(e)[:200]})
                self.failures += 1
                log(f"  failed {url}: {e}")
                return None
        self.failures = 0
        path = long_path(os.path.join(self.dir, relpath))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(body)
        self.record({"url": url, "status": 200, "path": relpath.replace(os.sep, "/"), "bytes": len(body),
                     "sha256": hashlib.sha256(body).hexdigest(), "content_type": ctype})
        return body


def links(body, pattern):
    text = html.unescape(body.decode("utf-8", "replace"))
    return sorted(set(re.findall(pattern, text)))


def s1_entry_slugs(c):
    slugs, page = set(), 1
    while page <= 20:
        body = c.fetch(S1_LIST.format(page), f"lists/lista-{page}.html")
        found = set(links(body or b"", r'href="https://innowacjespoleczne\.pl/innowacja/([^"/?#]+)/?"'))
        if not found - slugs:
            break
        slugs |= found
        page += 1
    return sorted(slugs)


def crawl_s1():
    c = Crawler("s1", TEAM_UA, 2.5)
    c.fetch(S1_TAXONOMY, "taxonomy-advanced.json")
    slugs = s1_entry_slugs(c)
    log(f"s1: {len(slugs)} entries on the list pages")
    uuids, page = set(), 1
    while page <= 10:
        body = c.fetch(S1_PROFILES.format(page), f"lists/profile-{page}.html")
        found = set(links(body or b"", r'href="[^"]*/profil/([0-9a-f-]{36})/?"'))
        if not found - uuids:
            break
        uuids |= found
        page += 1
    for i, slug in enumerate(slugs, 1):
        body = c.fetch(f"{S1}/innowacja/{slug}/", f"entries/{safe_name(slug)}.html")
        uuids |= set(links(body or b"", r'href="[^"]*/profil/([0-9a-f-]{36})/?"'))
        if i % 25 == 0:
            log(f"s1: {i}/{len(slugs)} entries")
    log(f"s1: {len(uuids)} profiles (incubators and innovators linked from entries)")
    for u in sorted(uuids):
        c.fetch(f"{S1}/profil/{u}/", f"profiles/{u}.html")
    log(f"s1: done, {len(slugs)} entries, {len(uuids)} profiles")


def crawl_s1_files():
    pages = Crawler("s1", TEAM_UA, 0)
    c = Crawler("s1-files", TEAM_UA, 1.5)
    urls = set()
    for url, rec in pages.done.items():
        if "/innowacja/" in url and rec.get("path"):
            urls |= set(links(pages.read(url) or b"", r'href="(https?://cdn\.innowacjespoleczne\.pl/[^"]+)"'))
    urls = sorted(u.strip() for u in urls)
    log(f"s1-files: {len(urls)} attachment links")
    total = 0
    for i, url in enumerate(urls, 1):
        path = urllib.parse.unquote(urllib.parse.urlparse(url).path).lstrip("/")
        if path.lower().endswith(VIDEO_EXT):
            if url not in c.done:
                c.record({"url": url, "status": "skipped", "reason": "video"})
            continue
        if NON_POLISH.search(path):
            if url not in c.done:
                c.record({"url": url, "status": "skipped", "reason": "not-polish"})
            continue
        body = c.fetch(url, os.path.join(*[safe_name(p) for p in path.split("/")]), skip_video=True)
        total += len(body or b"")
        if i % 50 == 0:
            log(f"s1-files: {i}/{len(urls)}, {total / 1e6:.0f} MB this run")
    log(f"s1-files: done, {total / 1e6:.0f} MB this run")


def crawl_s2():
    c = Crawler("s2", BROWSER_UA, 1.0)
    entries = set()
    for cat in S2_CATEGORIES:
        body = c.fetch(S2_LIBRARY + cat, f"categories/{cat}.html")
        entries |= set(links(body or b"", r'href="(?:https://rops\.krakow\.pl)?/innowacje-spoleczne/biblioteka-innowacji-spolecznych/([a-z0-9-]+,[^"/?#]+)"'))
    log(f"s2: {len(entries)} entry links on the category pages")
    for e in sorted(entries):
        c.fetch(S2_LIBRARY + e, f"entries/{safe_name(e)}.html")
    log(f"s2: done, {len(entries)} entries")


def crawl_s2_files():
    pages = Crawler("s2", BROWSER_UA, 0)
    c = Crawler("s2-files", BROWSER_UA, 1.0)
    urls = set()
    for url, rec in pages.done.items():
        if "," in url and rec.get("path"):
            for href in links(pages.read(url) or b"", r'href="([^"]+)"'):
                full = urllib.parse.urljoin(url, href.strip())
                host = urllib.parse.urlparse(full).netloc
                if host.endswith("rops.krakow.pl") and urllib.parse.unquote(full).lower().split("?")[0].endswith(FILE_EXT):
                    urls.add(full)
    urls = sorted(urls)
    log(f"s2-files: {len(urls)} file links")
    total = 0
    for url in urls:
        path = urllib.parse.unquote(urllib.parse.urlparse(url).path).lstrip("/")
        if NON_POLISH.search(path):
            continue
        body = c.fetch(url, os.path.join(*[safe_name(p) for p in path.split("/")]))
        total += len(body or b"")
    log(f"s2-files: done, {total / 1e6:.0f} MB this run")


SOURCES = {"s1": crawl_s1, "s1-files": crawl_s1_files, "s2": crawl_s2, "s2-files": crawl_s2_files}


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    names = sys.argv[1:] or list(SOURCES)
    bad = [n for n in names if n not in SOURCES]
    if bad:
        sys.exit(f"unknown source(s): {', '.join(bad)}; choose from {', '.join(SOURCES)}")
    rc = 0
    for n in names:
        try:
            SOURCES[n]()
        except Exception as e:
            log(f"{n}: STOPPED: {e}")
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main())
