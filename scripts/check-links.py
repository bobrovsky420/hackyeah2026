"""Check every material and link of the built records (spec 12.13) and write .local/pipeline/link-check.json.

Sources of truth, in this order:
  1. the download logs of crawl-catalogues.py (.local/raw/s1-files/log.jsonl, .local/raw/s2-files/log.jsonl):
     a file fetched with HTTP 200 and at least one byte is ok; 200 with zero bytes or a 4xx/5xx is dead;
     a skipped entry (video, too large) decides nothing;
  2. a live check for every URL the logs do not decide: HEAD, then GET of the first byte when HEAD is refused,
     with a browser-like User-Agent that names the team, a timeout, and at least one second between requests
     to the same host. Network errors and timeouts count as dead; 429 and 5xx count as unknown.

Output: .local/pipeline/link-check.json, {url: {"ok": true|false|null, "status": int or text, "bytes": int or
null, "checked_at": ISO date-time, "via": "log" or "live", "note": text}}. The next
`derive-records.py build` copies it onto every material and link as link_status (ok, dead, unknown) and
link_checked_at. A URL checked live within --max-age days is not checked again unless --force.

Usage (from the repository root, with the project venv):
  .venv/Scripts/python scripts/check-links.py [--no-live] [--limit N] [--timeout 15] [--max-age 7] [--force]
"""
import argparse, collections, datetime, glob, json, os, socket, sys, time, urllib.error, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INNOVATIONS = os.path.join(ROOT, "data", "innovations")
LOGS = [os.path.join(ROOT, ".local", "raw", "s1-files", "log.jsonl"),
        os.path.join(ROOT, ".local", "raw", "s2-files", "log.jsonl")]
OUT = os.path.join(ROOT, ".local", "pipeline", "link-check.json")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) HackYeah2026 social-innovation router link check "
      "(bobrovsky@gmx.ch)")


def log(msg):
    print(msg, flush=True)


def now():
    return datetime.datetime.now().isoformat(timespec="seconds")


def collect_urls():
    urls = collections.OrderedDict()
    for path in sorted(glob.glob(os.path.join(INNOVATIONS, "*.json"))):
        with open(path, encoding="utf-8") as f:
            r = json.load(f)
        for coll in ("materials", "links"):
            for item in r.get(coll) or []:
                u = item.get("url")
                if u and u.startswith(("http://", "https://")):
                    urls.setdefault(u, []).append(r["id"])
    return urls


def from_logs(urls):
    """Decide from the crawler's logs what it can; the last entry per URL wins."""
    entries = {}
    for path in LOGS:
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                e = json.loads(line)
                if e.get("url") in urls:
                    entries[e["url"]] = e
    out = {}
    for u, e in entries.items():
        st = e.get("status")
        if st == 200:
            nbytes = e.get("bytes")
            ok = bool(nbytes)
            out[u] = {"ok": ok, "status": 200, "bytes": nbytes, "checked_at": e.get("time"), "via": "log",
                      "note": "" if ok else "empty file"}
        elif isinstance(st, int):
            out[u] = {"ok": False if st >= 400 else None, "status": st, "bytes": None,
                      "checked_at": e.get("time"), "via": "log", "note": "HTTP status from the crawl"}
        # "skipped" (video, too-large) decides nothing
    return out


class Live:
    def __init__(self, timeout):
        self.timeout = timeout
        self.last = {}
        opener = urllib.request.build_opener(urllib.request.HTTPRedirectHandler)
        opener.addheaders = [("User-Agent", UA), ("Accept", "*/*"), ("Accept-Language", "pl,en;q=0.7")]
        self.opener = opener

    def wait(self, url):
        host = urllib.parse.urlparse(url).netloc
        gap = time.time() - self.last.get(host, 0)
        if gap < 1.0:
            time.sleep(1.0 - gap)
        self.last[host] = time.time()

    def request(self, url, method):
        # Catalogue links carry raw Polish letters in the path; percent-encode them, keep existing escapes.
        url = urllib.parse.quote(url, safe=":/?&=%#+@;,!$'()*[]~")
        req = urllib.request.Request(url, method=method)
        if method == "GET":
            req.add_header("Range", "bytes=0-0")
        with self.opener.open(req, timeout=self.timeout) as resp:
            length = resp.headers.get("Content-Length")
            if method == "GET":
                cr = resp.headers.get("Content-Range")
                if cr and "/" in cr and cr.rsplit("/", 1)[1].isdigit():
                    length = cr.rsplit("/", 1)[1]
            return resp.status, (int(length) if length and length.isdigit() else None)

    def check(self, url):
        if any(ch.isspace() for ch in url) or not urllib.parse.urlparse(url).netloc:
            return {"ok": False, "status": "invalid", "bytes": None, "note": "not a valid URL"}
        self.wait(url)
        try:
            try:
                status, nbytes = self.request(url, "HEAD")
            except urllib.error.HTTPError as e:
                if e.code in (403, 405, 501):
                    self.wait(url)
                    status, nbytes = self.request(url, "GET")
                else:
                    raise
            if status == 200 and nbytes == 0:       # a HEAD may report no length; confirm with a ranged GET
                self.wait(url)
                status, nbytes = self.request(url, "GET")
            ok = status < 400
            if status in (200, 206) and nbytes == 0:
                ok = False
            return {"ok": ok, "status": status, "bytes": nbytes, "note": "" if ok else "empty file"}
        except urllib.error.HTTPError as e:
            ok = None if e.code == 429 or e.code >= 500 else False
            return {"ok": ok, "status": e.code, "bytes": None, "note": e.reason if isinstance(e.reason, str) else ""}
        except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, OSError, ValueError) as e:
            reason = getattr(e, "reason", e)
            text = str(reason)
            return {"ok": None if "timed out" in text.lower() else False, "status": "error", "bytes": None,
                    "note": text[:120]}
        except Exception as e:      # http.client.InvalidURL and the like: the link cannot be followed
            return {"ok": False, "status": "invalid", "bytes": None, "note": f"{type(e).__name__}: {str(e)[:100]}"}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--no-live", action="store_true", help="decide from the logs only")
    ap.add_argument("--limit", type=int, default=0, help="live-check at most N URLs (0 = all)")
    ap.add_argument("--timeout", type=int, default=15)
    ap.add_argument("--max-age", type=int, default=7, help="days a live result stays valid")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    urls = collect_urls()
    results = {}
    if os.path.exists(OUT) and not a.force:
        with open(OUT, encoding="utf-8") as f:
            results = json.load(f)
    decided = from_logs(urls)
    results.update(decided)
    cutoff = (datetime.datetime.now() - datetime.timedelta(days=a.max_age)).isoformat(timespec="seconds")
    todo = [u for u in urls if u not in decided and not (
        results.get(u, {}).get("via") == "live" and results[u].get("checked_at", "") >= cutoff and not a.force)]
    log(f"{len(urls)} distinct URLs; {len(decided)} decided by the crawl logs; {len(todo)} to check live")
    if not a.no_live:
        if a.limit:
            todo = todo[:a.limit]
        live = Live(a.timeout)
        for n, u in enumerate(todo, 1):
            r = live.check(u)
            r.update({"checked_at": now(), "via": "live"})
            results[u] = r
            if n % 25 == 0 or n == len(todo):
                save(results)
                log(f"  {n}/{len(todo)} checked")
    save(results)
    counts = collections.Counter("ok" if r["ok"] else ("dead" if r["ok"] is False else "unknown")
                                 for u, r in results.items() if u in urls)
    log(f"result: {dict(counts)}; written {OUT}")
    dead = [(u, results[u]) for u in urls if u in results and results[u]["ok"] is False]
    for u, r in dead[:60]:
        log(f"  dead {r['status']} {u} ({r['note']}) in {', '.join(urls[u][:3])}")
    if len(dead) > 60:
        log(f"  ... and {len(dead) - 60} more")


def save(results):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(results, f, ensure_ascii=False, indent=1, sort_keys=True)


if __name__ == "__main__":
    main()
