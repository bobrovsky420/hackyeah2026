"""Pack the data of this machine into one bundle for another machine (docs/data-setup.md).

Build outputs are git-ignored and a rebuild needs the raw snapshot and the
extraction run, so the data travels as a bundle instead: every file under data/ (whatever exists at pack time,
subfolders and hand-written files included) and the pipeline's working files .local/pipeline/{sources, derived,
manifest.json, duplicates.json, link-check.json}, so that the extraction does not rerun on the other machine.

Output: .local/bundles/data-<data version>.zip (or --out), with the files under their paths from the repository root
and a manifest.json at the zip root: the data version and record count (data/data-version.json), the parser, prompt
and taxonomy versions, the embedding model and dims of data/index-vectors.json, created_at, the git commit
(git rev-parse HEAD) and a dirty flag (uncommitted changes anywhere in the working tree), and path, size and sha256
per file. Entries are in sorted path order with a fixed timestamp.

Refuses to pack (exit 1) when data/data-version.json, data/index-cards.json, data/index-vectors.json and
data/innovations/ disagree on the data version or on the record ids, when data/implementations-derived.json (if
present) carries another data version, or when index-vectors.json names no embedding model: the app would refuse
to serve such a set anyway (data/README.md, load-time checks).

Usage (from the repository root, with the project venv):
  .venv/Scripts/python scripts/pack-data.py [--out path.zip] [--root dir]
--root packs the data/ and .local/pipeline/ of another directory tree (used for testing); the default is this
repository. unpack-data.py is the counterpart.
"""
import argparse, datetime, hashlib, json, os, subprocess, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUNDLE_FORMAT = 1
PIPELINE_DIRS = ["sources", "derived"]                                   # required
PIPELINE_FILES = ["manifest.json", "duplicates.json", "link-check.json"]  # manifest.json required, the others optional
SKIP_NAMES = {".DS_Store", "Thumbs.db", "desktop.ini"}
FIXED_TIME = (2026, 1, 1, 0, 0, 0)                                        # every entry, so the order is the only variable


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


def check_consistency(root):
    """The versions of the bundle, or exit 1 with the first disagreement."""
    dv = load_json(root, "data/data-version.json")
    version, records = dv.get("version"), dv.get("records")
    if not version or not isinstance(records, int):
        fail("data/data-version.json has no version or no records count")
    cards = load_json(root, "data/index-cards.json")
    card_ids = [c.get("id") for c in cards]
    if len(card_ids) != len(set(card_ids)):
        fail("data/index-cards.json has duplicate ids")
    if len(card_ids) != records:
        fail(f"data/index-cards.json has {len(card_ids)} cards, data/data-version.json says {records} records")
    vec = load_json(root, "data/index-vectors.json")
    if not vec.get("model"):
        fail("data/index-vectors.json names no embedding model")
    if vec.get("data_version") != version:
        fail(f"data/index-vectors.json is of data version {vec.get('data_version')}, data/data-version.json of "
             f"{version}: rerun build-index-vectors.py")
    if vec.get("records_count") != records:
        fail(f"data/index-vectors.json counts {vec.get('records_count')} records, data/data-version.json {records}")
    ids = set(card_ids)
    if set(vec.get("vectors", {})) != ids:
        fail(f"the vector keys of data/index-vectors.json differ from the ids of data/index-cards.json "
             f"({len(set(vec.get('vectors', {})) ^ ids)} ids in only one of them)")
    inn_dir = os.path.join(root, "data", "innovations")
    inn_ids = {n[:-5] for n in os.listdir(inn_dir) if n.endswith(".json")} if os.path.isdir(inn_dir) else set()
    if inn_ids != ids:
        fail(f"data/innovations/ holds {len(inn_ids)} records, {len(inn_ids ^ ids)} of them or of the index cards "
             f"without a partner: rerun derive-records.py build")
    if os.path.exists(os.path.join(root, "data", "implementations-derived.json")):
        derived = load_json(root, "data/implementations-derived.json")
        if derived.get("data_version") != version:
            fail(f"data/implementations-derived.json is of data version {derived.get('data_version')}, not "
                 f"{version}: rerun build-static-data.py --only origins")
    tax = os.path.join(root, "data", "taxonomies.json")
    taxonomy = load_json(root, "data/taxonomies.json").get("version") if os.path.exists(tax) else None
    return {"data_version": version, "records": records, "parser_version": dv.get("parser_version"),
            "prompt_version": dv.get("prompt_version"), "taxonomy_version": taxonomy, "built_at": dv.get("built_at"),
            "embedding_model": vec.get("model"), "embedding_dims": vec.get("dims")}


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


def main():
    ap = argparse.ArgumentParser(description="Pack data/ and the pipeline's working files into one zip.")
    ap.add_argument("--out", help="the zip to write (default .local/bundles/data-<data version>.zip)")
    ap.add_argument("--root", default=ROOT, help="the directory tree to pack (default: this repository)")
    args = ap.parse_args()
    root = os.path.abspath(args.root)

    versions = check_consistency(root)
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
    paths = sorted(set(paths))

    commit, dirty = git_state(root)
    out = os.path.abspath(args.out or os.path.join(root, ".local", "bundles", f"data-{versions['data_version']}.zip"))
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
        manifest = {"bundle_format": BUNDLE_FORMAT, **versions,
                    "created_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
                    "git_commit": commit, "git_dirty": dirty, "files_count": len(entries),
                    "files_bytes": sum(e["size"] for e in entries), "files": entries}
        info = zipfile.ZipInfo("manifest.json", date_time=FIXED_TIME)
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        z.writestr(info, json.dumps(manifest, ensure_ascii=False, indent=1) + "\n")
    os.replace(tmp, out)

    n_data = sum(1 for e in entries if e["path"].startswith("data/"))
    print(f"data version {versions['data_version']} ({versions['records']} records), parser "
          f"{versions['parser_version']}, prompt {versions['prompt_version']}, taxonomy {versions['taxonomy_version']}, "
          f"embedding {versions['embedding_model']}")
    print(f"git {commit or '-'}{' (dirty)' if dirty else ''}")
    print(f"{len(entries)} files ({n_data} in data/, {len(entries) - n_data} in .local/pipeline/), "
          f"{human(manifest['files_bytes'])} unpacked")
    print(f"bundle {out} ({human(os.path.getsize(out))})")


if __name__ == "__main__":
    main()
