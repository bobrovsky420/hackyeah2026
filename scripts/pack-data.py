"""Pack the data of this machine into one bundle, a data release, for another machine (docs/data-setup.md).

Build outputs are git-ignored and a rebuild needs the raw snapshot and the
extraction run, so the data travels as a bundle instead: every file under data/ (whatever exists at pack time:
data/built/ and the hand-written data/curated/; with the panel's demonstration data, data/built/demo-*, when
pnpm demo:routes made it), the pipeline's working files .local/pipeline/{sources, derived,
manifest.json, duplicates.json, link-check.json}, so that the extraction does not rerun on the other machine, and,
unless --no-cache, the demo's replay files .local/route-cache/ and .local/llm-replay/ (specification 12.4).

A release: --release X.Y.Z names the bundle data-X.Y.Z.zip and writes the label into the manifest. The internal data
version (date and content hash, data/built/data-version.json) stays the key of the load-time checks and of the replay
cache; the release label is the name people use. Refused when that zip exists or when X.Y.Z is not above the
releases already in .local/bundles/ (--force overrides both).

--rebuild first runs the deterministic build steps of data/README.md, "Rebuild order", 4 to 7: derive-records.py
build; build-static-data.py --only origins,organisations; build-index-vectors.py (the embedding venv); check-links.py
and the build again (both skipped with --no-links, for a machine without network). The extraction (step 3, the skill
/extract-innovations in Claude Code) and the static downloads (fetch-static-data.py) never run here: a source record
without a valid derived record makes the pack refuse (see below). Then node scripts/build-data-types.mjs --check
type-checks the data files (unless --no-typecheck), the consistency checks run, and the zip is written.

Output: .local/bundles/data-X.Y.Z.zip (data-<data version>.zip without --release; or --out), with the files under
their paths from the repository root and a manifest.json at the zip root: the release label, the data version, the
record and merged counts (data/built/data-version.json), the parser, prompt and taxonomy versions, the embedding
model and dims of data/built/index-vectors.json, created_at, the git commit (git rev-parse HEAD) and a dirty flag (uncommitted
changes anywhere in the working tree), the comparison with the previous release in .local/bundles/ (records added
and removed, files changed), and path, size and sha256 per file. Entries are in sorted path order with a fixed
timestamp. A note with the same summary, data-X.Y.Z.md, is written beside the zip for whoever shares it.

Refuses to pack (exit 1) when data/built/data-version.json, data/built/index-cards.json,
data/built/index-vectors.json and data/built/innovations/ disagree on the data version or on the record ids, when
data/built/implementations-derived.json (if present) carries another data version, when data/built/ holds only some
of the three files of the demonstration data, when index-vectors.json names no embedding model, or when the last build
skipped source records without a valid derived record (--force packs without them): the app would refuse to serve
such a set anyway (data/README.md, load-time checks).

Usage (from the repository root, with the project venv):
  .venv/Scripts/python scripts/pack-data.py --release X.Y.Z [--rebuild] [--no-links] [--no-cache] [--no-typecheck] [--force]
  .venv/Scripts/python scripts/pack-data.py [--out path.zip] [--root dir]
--root packs the data/ and .local/ files of another directory tree (used for testing); the default is this
repository, and --rebuild and the type check run only for this repository. unpack-data.py is the counterpart.
"""
import argparse, datetime, hashlib, importlib.util, json, os, re, shutil, subprocess, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUNDLE_FORMAT = 4                                                         # 4: the paths in data/built/paths/
PIPELINE_DIRS = ["sources", "derived"]                                   # required
PIPELINE_FILES = ["manifest.json", "duplicates.json", "link-check.json"]  # manifest.json required, the others optional
CACHE_DIRS = [".local/route-cache", ".local/llm-replay"]                 # the demo's replay files, optional
DEMO_FILES = ["data/built/demo-questions.yaml", "data/built/demo-records.yaml",
              "data/built/demo-routes.json"]                              # the panel's demonstration data: all or none
SKIP_NAMES = {".DS_Store", "Thumbs.db", "desktop.ini"}
FIXED_TIME = (2026, 1, 1, 0, 0, 0)                                        # every entry, so the order is the only variable
RELEASE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
RELEASE_ZIP = re.compile(r"^data-(\d+\.\d+\.\d+)\.zip$")
PY = ".venv/Scripts/python" if os.name == "nt" else ".venv/bin/python"
# data/README.md, "Rebuild order", steps 4 to 7; the last two need the network and are skipped with --no-links.
REBUILD = [
    ("the records, the index cards and the data version", PY, ["scripts/derive-records.py", "build"]),
    ("the origins and organisations of the static data", PY, ["scripts/build-static-data.py", "--only", "origins,organisations"]),
    ("the index vectors", PY, ["scripts/build-index-vectors.py"]),
    ("the link check", PY, ["scripts/check-links.py"]),
    ("the build again, with the link status", PY, ["scripts/derive-records.py", "build"]),
]
TYPECHECK = ["scripts/build-data-types.mjs", "--check"]


def fail(msg):
    print(f"pack-data: refused: {msg}", file=sys.stderr)
    sys.exit(1)


def rel(root, path):
    return os.path.relpath(path, root).replace(os.sep, "/")


def walk(root, top):
    """Every file under top as a path relative to root, with forward slashes."""
    out = []
    for dirpath, dirnames, filenames in os.walk(top):
        dirnames[:] = [d for d in dirnames if d != "__pycache__"]
        for name in filenames:
            if name not in SKIP_NAMES and not name.endswith(".pyc"):
                out.append(rel(root, os.path.join(dirpath, name)))
    return out


def load_json(root, path):
    full = os.path.join(root, path)
    if not os.path.exists(full):
        fail(f"{path} is missing")
    try:
        with open(full, encoding="utf-8") as f:
            return json.load(f)
    except ValueError as e:
        fail(f"{path} is not valid JSON ({e})")


def unpack_module():
    """scripts/unpack-data.py, for current_path(): the paths of an older bundle in the layout of today."""
    spec = importlib.util.spec_from_file_location("unpack_data", os.path.join(os.path.dirname(__file__), "unpack-data.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check_consistency(root):
    """The versions of the bundle, or exit 1 with the first disagreement."""
    dv = load_json(root, "data/built/data-version.json")
    version, records = dv.get("version"), dv.get("records")
    if not version or not isinstance(records, int):
        fail("data/built/data-version.json has no version or no records count")
    cards = load_json(root, "data/built/index-cards.json")
    card_ids = [c.get("id") for c in cards]
    if len(card_ids) != len(set(card_ids)):
        fail("data/built/index-cards.json has duplicate ids")
    if len(card_ids) != records:
        fail(f"data/built/index-cards.json has {len(card_ids)} cards, data/built/data-version.json says {records} records")
    vec = load_json(root, "data/built/index-vectors.json")
    if not vec.get("model"):
        fail("data/built/index-vectors.json names no embedding model")
    if vec.get("data_version") != version:
        fail(f"data/built/index-vectors.json is of data version {vec.get('data_version')}, data/built/data-version.json of "
             f"{version}: rerun build-index-vectors.py")
    if vec.get("records_count") != records:
        fail(f"data/built/index-vectors.json counts {vec.get('records_count')} records, data/built/data-version.json {records}")
    ids = set(card_ids)
    if set(vec.get("vectors", {})) != ids:
        fail(f"the vector keys of data/built/index-vectors.json differ from the ids of data/built/index-cards.json "
             f"({len(set(vec.get('vectors', {})) ^ ids)} ids in only one of them)")
    inn_dir = os.path.join(root, "data", "built", "innovations")
    inn_ids = {n[:-5] for n in os.listdir(inn_dir) if n.endswith(".json")} if os.path.isdir(inn_dir) else set()
    if inn_ids != ids:
        fail(f"data/built/innovations/ holds {len(inn_ids)} records, {len(inn_ids ^ ids)} of them or of the index cards "
             f"without a partner: rerun derive-records.py build")
    if os.path.exists(os.path.join(root, "data", "built", "implementations-derived.json")):
        derived = load_json(root, "data/built/implementations-derived.json")
        if derived.get("data_version") != version:
            fail(f"data/built/implementations-derived.json is of data version {derived.get('data_version')}, not "
                 f"{version}: rerun build-static-data.py --only origins")
    present = [p for p in DEMO_FILES if os.path.exists(os.path.join(root, *p.split("/")))]
    if present and len(present) < len(DEMO_FILES):
        fail(f"data/built/ holds only {', '.join(present)} of the panel's demonstration data: run pnpm demo:routes, "
             f"or delete the demo-* files")
    routes = load_json(root, DEMO_FILES[-1]) if present else None
    tax = os.path.join(root, "data", "curated", "taxonomies.json")
    taxonomy = load_json(root, "data/curated/taxonomies.json").get("version") if os.path.exists(tax) else None
    return {"data_version": version, "records": records, "merged": dv.get("merged"),
            "skipped_without_valid_derived": dv.get("skipped_without_valid_derived") or 0,
            "parser_version": dv.get("parser_version"), "prompt_version": dv.get("prompt_version"),
            "taxonomy_version": taxonomy, "built_at": dv.get("built_at"),
            "embedding_model": vec.get("model"), "embedding_dims": vec.get("dims"),
            "demo": {"routes": len(routes.get("entries", [])), "data_version": routes.get("data_version")} if routes else None}


def git_state(root):
    """(commit, dirty) of the working tree at root, or (None, None) outside a git repository."""
    try:
        commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, check=True)
        status = subprocess.run(["git", "status", "--porcelain"], cwd=root, capture_output=True, text=True, check=True)
        return commit.stdout.strip(), bool(status.stdout.strip())
    except (OSError, subprocess.CalledProcessError):
        return None, None


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} B"
        n /= 1024


def release_key(label):
    m = RELEASE.match(label)
    return tuple(int(g) for g in m.groups()) if m else None


def releases_here(bundles):
    """[(key, zip path)] of the release bundles in .local/bundles/, lowest first."""
    if not os.path.isdir(bundles):
        return []
    found = []
    for name in os.listdir(bundles):
        m = RELEASE_ZIP.match(name)
        if m:
            found.append((release_key(m.group(1)), os.path.join(bundles, name)))
    return sorted(found)


def read_manifest(zip_path):
    try:
        with zipfile.ZipFile(zip_path) as z:
            return json.loads(z.read("manifest.json"))
    except (OSError, KeyError, ValueError, zipfile.BadZipFile):
        return None


def compare(previous, entries):
    """What changed since the previous release: records added and removed, files added, removed and changed."""
    current_path, fmt = unpack_module().current_path, previous.get("bundle_format", 1)
    before = {current_path(e["path"], fmt): e["sha256"] for e in previous.get("files", [])}
    after = {e["path"]: e["sha256"] for e in entries}
    record = lambda p: p.startswith("data/built/innovations/") and p.endswith(".json")
    added, removed = sorted(set(after) - set(before)), sorted(set(before) - set(after))
    changed = sorted(p for p in after if p in before and before[p] != after[p])
    return {"release_version": previous.get("release_version"), "data_version": previous.get("data_version"),
            "records": previous.get("records"),
            "records_added": [p[len("data/built/innovations/"):-5] for p in added if record(p)],
            "records_removed": [p[len("data/built/innovations/"):-5] for p in removed if record(p)],
            "records_changed": sum(1 for p in changed if record(p)),
            "files_added": len(added), "files_removed": len(removed), "files_changed": len(changed)}


def run_step(root, label, exe, args):
    """Run one build step in root, or exit 1; the interpreter is resolved to an absolute path for Windows."""
    full = exe if os.path.isabs(exe) else os.path.join(root, exe)
    if os.name == "nt" and not os.path.exists(full) and os.path.exists(full + ".exe"):
        full += ".exe"                   # .venv/Scripts/python is python.exe
    if not os.path.exists(full):
        fail(f"{exe} is missing; create the environment as docs/data-setup.md says")
    cmd = [full, *args]
    print(f"==> {label}: {os.path.relpath(full, root) if full.startswith(root) else full} {' '.join(args)}", flush=True)
    code = subprocess.run(cmd, cwd=root).returncode
    if code != 0:
        fail(f"{label} failed (exit {code}); nothing was packed")


def main():
    ap = argparse.ArgumentParser(description="Pack data/, the pipeline's working files and the replay files into one zip.")
    ap.add_argument("--release", help="the release label X.Y.Z; names the zip data-X.Y.Z.zip")
    ap.add_argument("--rebuild", action="store_true",
                    help="first run the build steps 4 to 7 of data/README.md (build, static origins and organisations, "
                         "vectors, link check and build again)")
    ap.add_argument("--no-links", action="store_true", help="with --rebuild: skip the link check and the second build")
    ap.add_argument("--no-cache", action="store_true", help="leave out .local/route-cache/ and .local/llm-replay/")
    ap.add_argument("--no-typecheck", action="store_true", help="skip node scripts/build-data-types.mjs --check")
    ap.add_argument("--force", action="store_true",
                    help="overwrite an existing zip, accept a release label that is not above the newest here, and pack "
                         "although the build skipped records")
    ap.add_argument("--out", help="the zip to write (default .local/bundles/data-<release or data version>.zip)")
    ap.add_argument("--root", default=ROOT, help="the directory tree to pack (default: this repository)")
    args = ap.parse_args()
    root = os.path.abspath(args.root)
    here = os.path.normcase(root) == os.path.normcase(os.path.abspath(ROOT))
    bundles = os.path.join(root, ".local", "bundles")

    # 0. the release label, before any slow step
    key = None
    if args.release:
        key = release_key(args.release)
        if not key:
            fail(f"the release label must be three numbers, X.Y.Z, not {args.release!r}")
        newest = max((k for k, _ in releases_here(bundles)), default=None)
        if newest and key <= newest and not args.force:
            fail(f"release {args.release} is not above the newest release here, {'.'.join(map(str, newest))}: "
                 f"pick a higher number, or --force")
    if args.out:
        out = os.path.abspath(args.out)
    elif args.release:
        out = os.path.join(bundles, f"data-{args.release}.zip")
    else:
        out = None                       # data-<data version>.zip, known after the checks
    if out and os.path.exists(out) and not args.force:
        fail(f"{out} exists: pick another release number, or --force to overwrite it")

    # 1. the build steps and the type check
    if args.rebuild:
        if not here:
            fail("--rebuild runs only in this repository, not with --root")
        for label, exe, step_args in (REBUILD[:3] if args.no_links else REBUILD):
            run_step(root, label, exe, step_args)
    if not args.no_typecheck:
        if not here:
            print("pack-data: note: the type check runs only in this repository; skipped for --root")
        else:
            node = shutil.which("node")
            if not node:
                fail("node is not on PATH; the type check needs it, or pass --no-typecheck")
            run_step(root, "the type check of the data files", node, TYPECHECK)

    # 2. consistency, then the file list
    versions = check_consistency(root)
    if versions["skipped_without_valid_derived"] and not args.force:
        fail(f"the last build skipped {versions['skipped_without_valid_derived']} source records without a valid "
             f"derived record: run /extract-innovations first (derive-records.py status), or --force")
    pipe = os.path.join(root, ".local", "pipeline")
    paths = walk(root, os.path.join(root, "data"))
    for d in PIPELINE_DIRS:
        if not os.path.isdir(os.path.join(pipe, d)):
            fail(f".local/pipeline/{d}/ is missing")
        paths += walk(root, os.path.join(pipe, d))
    for name in PIPELINE_FILES:
        if os.path.exists(os.path.join(pipe, name)):
            paths.append(f".local/pipeline/{name}")
        elif name == "manifest.json":
            fail(".local/pipeline/manifest.json is missing")
        else:
            print(f"pack-data: note: .local/pipeline/{name} is missing, packed without it")
    if not args.no_cache:
        for d in CACHE_DIRS:
            top = os.path.join(root, *d.split("/"))
            if os.path.isdir(top):
                paths += walk(root, top)
            else:
                print(f"pack-data: note: {d}/ is missing, packed without it")
    paths = sorted(set(paths))

    # 3. the zip, every entry hashed and written from the same bytes
    commit, dirty = git_state(root)
    out = out or os.path.join(bundles, f"data-{versions['data_version']}.zip")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    tmp = out + ".part"
    entries = []
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p in paths:
            full = os.path.join(root, *p.split("/"))
            with open("\\\\?\\" + full if os.name == "nt" else full, "rb") as f:   # long-path prefix on Windows
                data = f.read()   # hashed and written from the same bytes, so a concurrent writer cannot split them
            entries.append({"path": p, "size": len(data), "sha256": hashlib.sha256(data).hexdigest()})
            info = zipfile.ZipInfo(p, date_time=FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, data)
        previous = None
        candidates = [(k, p) for k, p in releases_here(bundles)
                      if os.path.normcase(p) != os.path.normcase(out) and (key is None or k < key)]
        if candidates:
            prev_manifest = read_manifest(candidates[-1][1])
            if prev_manifest:
                previous = compare(prev_manifest, entries)
                previous["zip"] = os.path.basename(candidates[-1][1])
        manifest = {"bundle_format": BUNDLE_FORMAT, "release_version": args.release, **versions,
                    "created_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
                    "git_commit": commit, "git_dirty": dirty, "previous": previous,
                    "files_count": len(entries), "files_bytes": sum(e["size"] for e in entries), "files": entries}
        info = zipfile.ZipInfo("manifest.json", date_time=FIXED_TIME)
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        z.writestr(info, json.dumps(manifest, ensure_ascii=False, indent=1) + "\n")
    os.replace(tmp, out)

    # 4. the summary, printed and written beside the zip
    n_data = sum(1 for e in entries if e["path"].startswith("data/"))
    n_pipe = sum(1 for e in entries if e["path"].startswith(".local/pipeline/"))
    n_cache = len(entries) - n_data - n_pipe
    lines = [
        f"release {args.release or '-'}: data version {versions['data_version']} ({versions['records']} records, "
        f"{versions['merged']} merged, built {versions['built_at']})",
        f"parser {versions['parser_version']}, prompt {versions['prompt_version']}, taxonomy "
        f"{versions['taxonomy_version']}, embedding {versions['embedding_model']} ({versions['embedding_dims']} dims)",
        f"git {commit or '-'}{' (dirty)' if dirty else ''}",
        f"{len(entries)} files ({n_data} in data/, {n_pipe} in .local/pipeline/, {n_cache} replay files), "
        f"{human(manifest['files_bytes'])} unpacked",
        f"demonstration data of the panel: {versions['demo']['routes']} routes (computed on data version "
        f"{versions['demo']['data_version']})" if versions["demo"] else
        "demonstration data of the panel: none (no data/built/demo-* files; pnpm demo:routes makes them)",
    ]
    if previous:
        lines.append(f"since {previous['zip']} (release {previous['release_version'] or '-'}, data version "
                     f"{previous['data_version']}): {len(previous['records_added'])} records added, "
                     f"{len(previous['records_removed'])} removed, {previous['records_changed']} changed; "
                     f"{previous['files_added']} files added, {previous['files_removed']} removed, "
                     f"{previous['files_changed']} changed")
    elif key:
        lines.append("no earlier release in .local/bundles/ to compare with")
    if versions["skipped_without_valid_derived"]:
        lines.append(f"warning: {versions['skipped_without_valid_derived']} source records are not in this release "
                     f"(no valid derived record)")
    lines.append(f"bundle {out} ({human(os.path.getsize(out))})")
    lines.append(f"unpack: {PY} scripts/unpack-data.py .local/bundles/{os.path.basename(out)}")
    print("\n".join(lines))
    if args.release:
        note = os.path.splitext(out)[0] + ".md"
        with open(note, "w", encoding="utf-8", newline="\n") as f:
            f.write(f"# Data release {args.release}\n\n" + "".join(f"- {line}\n" for line in lines))
        print(f"note {note}")


if __name__ == "__main__":
    main()
