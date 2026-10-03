"""Get a data release and unpack it: the seed of a fresh installation (docs/local-stack.md, docs/data-setup.md).

Order: find data-X.Y.Z.zip in .local/bundles/, or download it from the GitHub release data-X.Y.Z of the repository;
check its sha256 when one is given; run unpack-data.py on it (which checks every file before it writes); write
.local/data-release.json. A second run with the same release does nothing; --force unpacks again. --force and --prune
are passed on to unpack-data.py (--prune deletes the record files that the release does not have). The data stage of
docker/Dockerfile runs it on an empty tree.

Release: the argument, else DATA_RELEASE, else the newest data-X.Y.Z.zip already in .local/bundles/.
Download: https://github.com/<repo>/releases/download/data-X.Y.Z/data-X.Y.Z.zip with repo from --repo or DATA_REPO
          (default bobrovsky420/hackyeah2026). With GITHUB_TOKEN set the asset is fetched through the GitHub API,
          which a private repository needs; the token is sent to api.github.com only, never to the storage redirect.
Checksum: --sha256 or DATA_SHA256 pins the zip; without it the per-file sha256 of the bundle's manifest still apply.

Usage (from the repository root, with the project venv; docker/Dockerfile runs it with --root /work):
  .venv/Scripts/python scripts/get-data.py [X.Y.Z] [--repo owner/name] [--sha256 hex] [--force] [--prune] [--root dir]
Exit 0 when the release is installed (now or before), 1 on any failure.
"""
import argparse, datetime, hashlib, json, os, re, subprocess, sys, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_REPO = "bobrovsky420/hackyeah2026"
RELEASE = re.compile(r"^\d+\.\d+\.\d+$")


def fail(msg):
    print(f"get-data: {msg}", file=sys.stderr)
    sys.exit(1)


def newest_local(bundles):
    """The highest X.Y.Z of the data-X.Y.Z.zip files in bundles, or None."""
    found = []
    for name in os.listdir(bundles) if os.path.isdir(bundles) else []:
        m = re.fullmatch(r"data-(\d+)\.(\d+)\.(\d+)\.zip", name)
        if m:
            found.append(tuple(map(int, m.groups())))
    return ".".join(map(str, max(found))) if found else None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(url, token=None, accept=None):
    """The response of a GET; with a token, a redirect is followed without it (the storage URL is presigned)."""
    headers = {"User-Agent": "get-data.py"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if accept:
        headers["Accept"] = accept
    opener = urllib.request.build_opener(NoRedirect) if token else urllib.request.build_opener()
    try:
        return opener.open(urllib.request.Request(url, headers=headers), timeout=60)
    except urllib.error.HTTPError as e:
        if token and e.code in (301, 302, 303, 307, 308) and e.headers.get("Location"):
            return fetch(e.headers["Location"])
        raise


def download(repo, release, target):
    """Write the release's zip to target through a temporary name."""
    tag, name = f"data-{release}", f"data-{release}.zip"
    token = os.environ.get("GITHUB_TOKEN") or None
    try:
        if token:
            with fetch(f"https://api.github.com/repos/{repo}/releases/tags/{tag}", token,
                       "application/vnd.github+json") as r:
                assets = {a["name"]: a["url"] for a in json.load(r).get("assets", [])}
            if name not in assets:
                fail(f"the release {tag} of {repo} has no asset {name}")
            response = fetch(assets[name], token, "application/octet-stream")
        else:
            response = fetch(f"https://github.com/{repo}/releases/download/{tag}/{name}")
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with response, open(target + ".part", "wb") as f:
            while chunk := response.read(1 << 20):
                f.write(chunk)
    except urllib.error.HTTPError as e:
        hint = "" if token else "; for a private repository set GITHUB_TOKEN"
        fail(f"downloading {name} from {repo} failed: HTTP {e.code}{hint}")
    except urllib.error.URLError as e:
        fail(f"downloading {name} from {repo} failed: {e.reason}; without a network, copy the zip to "
             f"{os.path.dirname(target)}")
    os.replace(target + ".part", target)
    print(f"downloaded {name} from {repo} ({os.path.getsize(target)} bytes)")


def main():
    ap = argparse.ArgumentParser(description="Get a data release (local or from GitHub) and unpack it.")
    ap.add_argument("release", nargs="?", default=os.environ.get("DATA_RELEASE") or None, help="X.Y.Z")
    ap.add_argument("--repo", default=os.environ.get("DATA_REPO") or DEFAULT_REPO)
    ap.add_argument("--sha256", default=os.environ.get("DATA_SHA256") or None, help="the expected sha256 of the zip")
    ap.add_argument("--force", action="store_true", help="unpack again, and pass --force to unpack-data.py")
    ap.add_argument("--prune", action="store_true", help="pass --prune to unpack-data.py")
    ap.add_argument("--root", default=ROOT, help="the directory tree to unpack into (default: this repository)")
    args = ap.parse_args()

    bundles = os.path.join(args.root, ".local", "bundles")
    release = args.release or newest_local(bundles)
    if not release:
        fail(f"no release given (argument or DATA_RELEASE) and no data-X.Y.Z.zip in {bundles}")
    if not RELEASE.match(release):
        fail(f"release {release!r} is not X.Y.Z")

    marker = os.path.join(args.root, ".local", "data-release.json")
    try:
        with open(marker, encoding="utf-8") as f:
            installed = json.load(f)
    except (OSError, ValueError):
        installed = None
    if (installed and installed.get("release") == release and not args.force
            and os.path.exists(os.path.join(args.root, "data", "data-version.json"))):
        print(f"release {release} is installed already (data version {installed.get('data_version')}); "
              f"--force unpacks it again")
        return

    zip_path = os.path.join(bundles, f"data-{release}.zip")
    if os.path.exists(zip_path):
        print(f"using {zip_path}")
    else:
        download(args.repo, release, zip_path)
    with open(zip_path, "rb") as f:
        digest = hashlib.file_digest(f, "sha256").hexdigest()
    if args.sha256 and digest != args.sha256.lower():
        fail(f"data-{release}.zip has sha256 {digest}, expected {args.sha256}; delete it and run again")

    unpack = [sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "unpack-data.py"),
              zip_path, "--root", args.root] + (["--force"] if args.force else []) + (["--prune"] if args.prune else [])
    if subprocess.run(unpack).returncode != 0:
        fail("unpack-data.py refused; nothing is marked as installed")

    with open(os.path.join(args.root, "data", "data-version.json"), encoding="utf-8") as f:
        data_version = json.load(f).get("version")
    with open(marker + ".part", "w", encoding="utf-8") as f:
        json.dump({"release": release, "data_version": data_version, "zip_sha256": digest,
                   "installed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")},
                  f, indent=2)
        f.write("\n")
    os.replace(marker + ".part", marker)
    print(f"release {release} installed into {args.root}")


if __name__ == "__main__":
    main()
