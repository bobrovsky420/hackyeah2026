"""Unpack a data bundle written by pack-data.py into data/ and .local/pipeline/ (docs/data-setup.md).

Order: read the bundle's manifest.json; check that the zip holds exactly the files it lists, each under data/ or
.local/pipeline/, and that every size and sha256 matches; compare the bundle with what is already here; only then
write. Nothing outside data/ and .local/pipeline/ is touched, and nothing is deleted (except with --prune).

Refused without --force (exit 1):
  - the local data/data-version.json is of another data version built later than the bundle's (built_at);
  - a local file differs from the bundle's copy and was modified after the bundle was packed (created_at), for
    example a hand-written file edited or pulled since.
A local file that differs from the bundle's copy only in line endings (git core.autocrlf on Windows) counts as the
same file and is left as it is.

Stale files: a record present locally but not in the bundle (data/innovations/, .local/pipeline/sources/,
.local/pipeline/derived/) would break the app's count check. They are listed; --prune deletes them.

Usage (from the repository root, with the project venv):
  .venv/Scripts/python scripts/unpack-data.py .local/bundles/data-<version>.zip [--force] [--prune] [--root dir]
--root unpacks into another directory tree (used for testing); the default is this repository.
"""
import argparse, datetime, hashlib, json, os, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALLOWED = ("data/", ".local/pipeline/")
RECORD_DIRS = ("data/innovations/", ".local/pipeline/sources/", ".local/pipeline/derived/")
BUNDLE_FORMAT = 1


def fail(msg):
    print(f"unpack-data: refused: {msg}", file=sys.stderr)
    sys.exit(1)


def native(root, path):
    """The file system path of a bundle path; on Windows with the long-path prefix, since record ids make long names."""
    full = os.path.join(root, *path.split("/"))
    return "\\\\?\\" + full if os.name == "nt" and not full.startswith("\\\\") else full


def safe(path):
    """True for a relative path with forward slashes under one of the allowed folders and without '..'."""
    parts = path.split("/")
    return (path.startswith(ALLOWED) and ".." not in parts and "" not in parts and "\\" not in path
            and ":" not in path and not os.path.isabs(path))


def local_version(root):
    p = os.path.join(root, "data", "data-version.json")
    if not os.path.exists(p):
        return None
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except ValueError:
        return {"version": "(unreadable)", "built_at": None}


def same_text(a, b):
    return a.replace(b"\r\n", b"\n") == b.replace(b"\r\n", b"\n")


def main():
    ap = argparse.ArgumentParser(description="Verify a data bundle and unpack it into data/ and .local/pipeline/.")
    ap.add_argument("zip", help="the bundle written by pack-data.py")
    ap.add_argument("--force", action="store_true", help="overwrite newer local data and newer local files")
    ap.add_argument("--prune", action="store_true",
                    help="delete record files of data/innovations/ and .local/pipeline/{sources,derived}/ that the "
                         "bundle does not hold")
    ap.add_argument("--root", default=ROOT, help="the directory tree to unpack into (default: this repository)")
    args = ap.parse_args()
    root = os.path.abspath(args.root)

    try:
        z = zipfile.ZipFile(args.zip)
    except (OSError, zipfile.BadZipFile) as e:
        fail(f"cannot open {args.zip} ({e})")
    with z:
        try:
            manifest = json.loads(z.read("manifest.json"))
        except (KeyError, ValueError):
            fail("the bundle has no readable manifest.json")
        if manifest.get("bundle_format") != BUNDLE_FORMAT:
            fail(f"bundle format {manifest.get('bundle_format')}, this script reads {BUNDLE_FORMAT}")
        listed = {e["path"]: e for e in manifest["files"]}
        names = {n for n in z.namelist() if not n.endswith("/")} - {"manifest.json"}
        if names != set(listed):
            fail(f"the zip and its manifest disagree on {len(names ^ set(listed))} paths")
        bad = sorted(p for p in listed if not safe(p))
        if bad:
            fail(f"paths outside data/ and .local/pipeline/: {', '.join(bad[:5])}")

        # 1. verify every file before writing anything
        blobs = {}
        for p in sorted(listed):
            data = z.read(p)
            if len(data) != listed[p]["size"] or hashlib.sha256(data).hexdigest() != listed[p]["sha256"]:
                fail(f"{p} does not match its sha256 in the manifest: the bundle is damaged")
            blobs[p] = data
    print(f"verified {len(blobs)} files (sha256)")

    # 2. compare with what is here
    local = local_version(root)
    newer_data = (local is not None and local.get("version") != manifest["data_version"]
                  and (local.get("built_at") or "") > (manifest.get("built_at") or ""))
    created = datetime.datetime.fromisoformat(manifest["created_at"]).timestamp()
    writes, same, newer_files = [], 0, []
    for p, data in blobs.items():
        full = native(root, p)
        if os.path.exists(full):
            with open(full, "rb") as f:
                have = f.read()
            if have == data or same_text(have, data):
                same += 1
                continue
            if os.path.getmtime(full) > created:
                newer_files.append(p)
        writes.append(p)
    if (newer_data or newer_files) and not args.force:
        if newer_data:
            print(f"unpack-data: the local data version {local.get('version')} (built {local.get('built_at')}) is "
                  f"newer than the bundle's {manifest['data_version']} (built {manifest.get('built_at')})",
                  file=sys.stderr)
        if newer_files:
            print(f"unpack-data: {len(newer_files)} local files differ from the bundle and were changed after it was "
                  f"packed: {', '.join(newer_files[:8])}{' ...' if len(newer_files) > 8 else ''}", file=sys.stderr)
        fail("nothing was written; rerun with --force to overwrite")

    # 3. write, each file through a temporary name so that a reader never sees half a file
    for p in writes:
        full = native(root, p)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        tmp = full + ".part"
        with open(tmp, "wb") as f:
            f.write(blobs[p])
        os.replace(tmp, full)

    # 4. stale record files
    stale = []
    for d in RECORD_DIRS:
        top = os.path.join(root, *d.rstrip("/").split("/"))
        if os.path.isdir(top):
            stale += [d + n for n in sorted(os.listdir(top))
                      if os.path.isfile(os.path.join(top, n)) and d + n not in blobs]
    if stale and args.prune:
        for p in stale:
            os.remove(native(root, p))
        print(f"pruned {len(stale)} record files the bundle does not hold")
    elif stale:
        print(f"unpack-data: warning: {len(stale)} record files are not in the bundle and will break the app's count "
              f"check ({', '.join(stale[:5])}{' ...' if len(stale) > 5 else ''}); rerun with --prune to delete them",
              file=sys.stderr)

    print(f"wrote {len(writes)} files, {same} already identical, into {root}")
    print(f"data version {manifest['data_version']} ({manifest['records']} records, built {manifest.get('built_at')}), "
          f"parser {manifest.get('parser_version')}, prompt {manifest.get('prompt_version')}, "
          f"taxonomy {manifest.get('taxonomy_version')}")
    print(f"embedding model {manifest.get('embedding_model')} ({manifest.get('embedding_dims')} dims): start "
          f"embedding-service.py with the same model")
    print(f"packed {manifest['created_at']} from git {manifest.get('git_commit') or '-'}"
          f"{' (dirty)' if manifest.get('git_dirty') else ''}")
    if local and local.get("version") != manifest["data_version"]:
        print(f"replaced data version {local.get('version')}")


if __name__ == "__main__":
    main()
