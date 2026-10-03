"""Unpack a data bundle written by pack-data.py into data/, .local/pipeline/ and the replay folders (docs/data-setup.md).

Order: read the bundle's manifest.json; check that the zip holds exactly the files it lists, each under data/,
.local/pipeline/, .local/route-cache/ or .local/llm-replay/, and that every size and sha256 matches; compare the
bundle with what is already here; only then write. Nothing outside those folders is touched, and nothing is deleted
(except with --prune).

Files that git tracks here (the hand-written files of data/curated/: taxonomies, decisions, advisors, paths and
so on) are never written: git owns them, the bundle only carries them for a machine without a checkout. When a tracked file
differs from the bundle's copy, it is listed with the commit the bundle was packed from, so the reader can pull or
rebuild.

Refused without --force (exit 1):
  - the local data/built/data-version.json is of another data version built later than the bundle's (built_at);
  - a local file differs from the bundle's copy and was modified after the bundle was packed (created_at), for
    example a replay file recorded since.
A local file that differs from the bundle's copy only in line endings (git core.autocrlf on Windows) counts as the
same file and is left as it is.

Stale files: a record present locally but not in the bundle (data/built/innovations/, .local/pipeline/sources/,
.local/pipeline/derived/) would break the app's count check. They are listed; --prune deletes them.

Old layout: bundles of formats 1 and 2 kept data/ flat. Their files are written to the current places (the
hand-written files to data/curated/, everything else to data/built/), and the build outputs still lying in the flat
layout here are listed as stale; --prune deletes them too.

Usage (from the repository root, with the project venv):
  .venv/Scripts/python scripts/unpack-data.py .local/bundles/data-<version>.zip [--force] [--prune] [--root dir]
--root unpacks into another directory tree (used for testing); the default is this repository.
"""
import argparse, datetime, hashlib, json, os, subprocess, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALLOWED = ("data/", ".local/pipeline/", ".local/route-cache/", ".local/llm-replay/")
RECORD_DIRS = ("data/built/innovations/", ".local/pipeline/sources/", ".local/pipeline/derived/")
BUNDLE_FORMATS = (1, 2, 3, 4)   # 1: data/ and .local/pipeline/ only; 2 adds the release label, previous and the
                                # replay folders; 3 splits data/ into data/curated/ and data/built/; 4 moves the paths
                                # from data/curated/paths/ to data/built/paths/ and the two safety files from
                                # data/curated/safety/ up to data/curated/
CURATED = ("taxonomies.json", "duplicates-decisions.json", "advisors.yaml", "implementations.yaml", "knowledge.yaml",
           "helplines.yaml")   # the hand-written entries of data/; README.md stays at the top
DEMO_FILES = ("data/built/demo-questions.yaml", "data/built/demo-records.yaml",
              "data/built/demo-routes.json")   # the panel's demonstration data, in a bundle all or none
FLAT_BUILT = ("data-version.json", "innovations", "index-cards.json", "index-vectors.json", "incubators.json", "places",
              "map", "indicators.json", "implementations-derived.json", "organisations.json",
              "implementations-merged.json")   # the build outputs of the flat data/ of formats 1 and 2


def current_path(path, bundle_format):
    """Where a bundle path lives now: formats 1 and 2 kept data/ flat, format 3 has data/curated/ and data/built/
    with the paths in data/curated/paths/, format 4 has them in data/built/paths/."""
    if bundle_format >= 4 or not path.startswith("data/") or path == "data/README.md":
        return path
    if bundle_format == 3:
        if path.startswith("data/curated/paths/"):
            return "data/built/paths/" + path[len("data/curated/paths/"):]
        return "data/curated/" + path[len("data/curated/safety/"):] if path.startswith("data/curated/safety/") else path
    if path.startswith("data/safety/"):
        return "data/curated/" + path[len("data/safety/"):]
    top = path.split("/")[1]
    return f"data/{'curated' if top in CURATED else 'built'}/{path[len('data/'):]}"


def git_tracked(root):
    """The paths under data/ that git tracks at root (forward slashes), or an empty set outside a git checkout."""
    try:
        out = subprocess.run(["git", "ls-files", "-z", "--", "data"], cwd=root, capture_output=True, check=True)
        return {p.decode("utf-8") for p in out.stdout.split(b"\0") if p}
    except (OSError, subprocess.CalledProcessError, UnicodeDecodeError):
        return set()


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
    p = os.path.join(root, "data", "built", "data-version.json")
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
                    help="delete record files of data/built/innovations/ and .local/pipeline/{sources,derived}/ that the "
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
        if manifest.get("bundle_format") not in BUNDLE_FORMATS:
            fail(f"bundle format {manifest.get('bundle_format')}, this script reads {', '.join(map(str, BUNDLE_FORMATS))}")
        listed = {e["path"]: e for e in manifest["files"]}
        names = {n for n in z.namelist() if not n.endswith("/")} - {"manifest.json"}
        if names != set(listed):
            fail(f"the zip and its manifest disagree on {len(names ^ set(listed))} paths")
        bad = sorted(p for p in listed if not safe(p))
        if bad:
            fail(f"paths outside {', '.join(ALLOWED)}: {', '.join(bad[:5])}")

        # 1. verify every file before writing anything
        blobs = {}
        for p in sorted(listed):
            data = z.read(p)
            if len(data) != listed[p]["size"] or hashlib.sha256(data).hexdigest() != listed[p]["sha256"]:
                fail(f"{p} does not match its sha256 in the manifest: the bundle is damaged")
            blobs[current_path(p, manifest["bundle_format"])] = data
    print(f"verified {len(blobs)} files (sha256)")

    # 2. compare with what is here
    local = local_version(root)
    newer_data = (local is not None and local.get("version") != manifest["data_version"]
                  and (local.get("built_at") or "") > (manifest.get("built_at") or ""))
    created = datetime.datetime.fromisoformat(manifest["created_at"]).timestamp()
    tracked = git_tracked(root)
    writes, same, newer_files, kept = [], 0, [], []
    for p, data in blobs.items():
        full = native(root, p)
        if os.path.exists(full):
            with open(full, "rb") as f:
                have = f.read()
            if have == data or same_text(have, data):
                same += 1
                continue
            if p in tracked:            # git owns it: never written, only reported
                kept.append(p)
                continue
            if os.path.getmtime(full) > created:
                newer_files.append(p)
        elif p in tracked:              # tracked but deleted here: git checkout restores it, not the bundle
            kept.append(p)
            continue
        writes.append(p)
    if kept:
        print(f"unpack-data: {len(kept)} git-tracked files differ from the bundle and were kept, git owns them: "
              f"{', '.join(kept[:8])}{' ...' if len(kept) > 8 else ''}; the bundle was packed from commit "
              f"{manifest.get('git_commit') or '-'}{' (dirty)' if manifest.get('git_dirty') else ''}", file=sys.stderr)
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
    flat = []   # build outputs left in the flat data/ of formats 1 and 2
    for name in FLAT_BUILT:
        top = os.path.join(root, "data", name)
        if os.path.isfile(top):
            flat.append(f"data/{name}")
        elif os.path.isdir(top):
            flat += [rel for rel in (os.path.relpath(os.path.join(d, n), root).replace(os.sep, "/")
                                     for d, _, files in os.walk(top) for n in files)]
    if (stale or flat) and args.prune:
        for p in stale + flat:
            os.remove(native(root, p))
        for name in FLAT_BUILT:
            top = os.path.join(root, "data", name)
            if os.path.isdir(top):
                for d, _, _ in sorted(os.walk(top), reverse=True):
                    if not os.listdir(d):
                        os.rmdir(d)
        print(f"pruned {len(stale)} record files the bundle does not hold and {len(flat)} files of the old flat data/")
    else:
        if stale:
            print(f"unpack-data: warning: {len(stale)} record files are not in the bundle and will break the app's "
                  f"count check ({', '.join(stale[:5])}{' ...' if len(stale) > 5 else ''}); rerun with --prune to "
                  f"delete them", file=sys.stderr)
        if flat:
            print(f"unpack-data: note: {len(flat)} build outputs of the old flat data/ are left over "
                  f"({', '.join(flat[:5])}{' ...' if len(flat) > 5 else ''}); the app reads data/built/ now, rerun "
                  f"with --prune to delete them", file=sys.stderr)

    print(f"wrote {len(writes)} files, {same} already identical, {len(kept)} kept from git, into {root}")
    if manifest.get("release_version"):
        print(f"release {manifest['release_version']}")
    print(f"data version {manifest['data_version']} ({manifest['records']} records, built {manifest.get('built_at')}), "
          f"parser {manifest.get('parser_version')}, prompt {manifest.get('prompt_version')}, "
          f"taxonomy {manifest.get('taxonomy_version')}")
    print(f"embedding model {manifest.get('embedding_model')} ({manifest.get('embedding_dims')} dims): start "
          f"embedding-service.py with the same model")
    print(f"packed {manifest['created_at']} from git {manifest.get('git_commit') or '-'}"
          f"{' (dirty)' if manifest.get('git_dirty') else ''}")
    if local and local.get("version") != manifest["data_version"]:
        print(f"replaced data version {local.get('version')}")
    if all(p in blobs for p in DEMO_FILES):
        print("demonstration data of the panel: in data/built/demo-*; a fresh store file starts with it (stop the "
              "server, move .local/store/records.json aside, start; docs/storage.md)")
    else:
        print("demonstration data of the panel: not in this bundle")


if __name__ == "__main__":
    main()
