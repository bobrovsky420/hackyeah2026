# Data setup on another machine

For a developer who sets up the deployment machine, the offline demo laptop
or a second development machine. Git carries only what cannot be recreated: the built data is git-ignored, and
rebuilding it needs the 7 GB raw snapshot and a 2.5 hour extraction. So the
data travels as a bundle, a data release `data-X.Y.Z.zip`: one zip with
every file under `data/`, the pipeline's working files in `.local/pipeline/`
(`sources/`, `derived/`, `manifest.json`, `duplicates.json`,
`link-check.json`) and the replay files of the demo (`.local/route-cache/`,
`.local/llm-replay/`, specification 12.4). The contract of the files is
[data/README.md](../data/README.md).

Commands are for Windows (Git Bash or PowerShell) from the repository root.
On Linux and macOS write `.venv/bin/python` for `.venv/Scripts/python`,
`.venv-embedding/bin/python` for `.venv-embedding/Scripts/python`, and set
environment variables as `VAR=value command`.

## 1. Clone and create the two Python environments

Python 3.14 (the pins were made with it), Node.js with npx, and git.

```
git clone <repository URL> HackYeah2026
cd HackYeah2026
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m venv .venv-embedding
.venv-embedding/Scripts/python -m pip install -r requirements-embedding.txt
```

`.venv` runs every data script; `.venv-embedding` (CPU torch,
sentence-transformers) runs only the three embedding scripts.

## 2. Get the bundle and unpack it

The bundle is `data-X.Y.Z.zip`, the release label chosen by the person who
made it, for example `data-0.1.0.zip` (about 4.7 MB, 1 310 files); the
note `data-X.Y.Z.md` beside it says what is inside. It is shared on the
team drive; where exactly is not decided yet, so "the team drive" is a
placeholder. Copy it to `.local/bundles/` and unpack:

```
.venv/Scripts/python scripts/unpack-data.py .local/bundles/data-0.1.0.zip
```

The script checks the sha256 of every file before it writes anything,
writes only into `data/`, `.local/pipeline/`, `.local/route-cache/` and
`.local/llm-replay/`, and prints the release, the data, parser, prompt and
taxonomy versions and the embedding model. Files that git tracks here (the
hand-written files of `data/`) are never written: git owns them, and a
tracked file that differs from the bundle is listed with the commit the
bundle was packed from, so pull that commit or rebuild. It refuses (and
writes nothing) when the local data version was built later than the
bundle's, or when another local file differs from the bundle and was
changed after the bundle was packed (for example a replay file recorded
since): check which side is right, then rerun with `--force`. A file that
differs only in line endings counts as the same. Record files that are
here but not in the bundle are listed; `--prune` deletes them.

Download and unpack in one step: `.venv/Scripts/python scripts/get-data.py X.Y.Z`
takes the zip from `.local/bundles/` or, when the team publishes releases on
GitHub, from the release `data-X.Y.Z` of the repository, and runs the unpack.
The Docker stack of [local-stack.md](local-stack.md) runs it while building
its images, so the data goes into the images, not into a volume.

To make a release from your own machine (the person who built the data):

```
.venv/Scripts/python scripts/pack-data.py --release X.Y.Z
```

It type-checks the data files (`node scripts/build-data-types.mjs --check`,
about ten seconds), writes `.local/bundles/data-X.Y.Z.zip` with a
`manifest.json` (release, versions, git commit and dirty flag, what changed
since the previous release here, sha256 and size per file) and the note,
and refuses to pack when `data-version.json`, `index-cards.json`,
`index-vectors.json` and `innovations/` disagree on the data version or the
record ids, when the vectors name no embedding model, when the last build
skipped source records without a valid derived record, or when `X.Y.Z` is
not above the newest release in `.local/bundles/`. `--rebuild` runs the
build steps first (next section); `--no-cache` leaves the replay files out;
`--force` overrides the refusals about the label and the skipped records.

## 3. Download the embedding model once, then run offline

The vectors in `data/index-vectors.json` were built with the model the
unpack printed (`OPI-PIB/PolDense-400M`); queries must use the same model.
Download it, and the 150M fallback, into the Hugging Face cache while
online:

```
.venv-embedding/Scripts/python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('OPI-PIB/PolDense-400M')"
.venv-embedding/Scripts/python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('OPI-PIB/PolDense-150M')"
```

If the Hub asks for a login (PolDense is under the Gemma Terms of Use),
accept the terms on the model page and set `HF_TOKEN`. From then on set
`HF_HUB_OFFLINE=1` so that nothing contacts the Hub (the demo laptop has no
network): `export HF_HUB_OFFLINE=1` in Git Bash, `$env:HF_HUB_OFFLINE = "1"`
in PowerShell.

## 4. Start the embedding service and check it

```
.venv-embedding/Scripts/python scripts/embedding-service.py --self-test
.venv-embedding/Scripts/python scripts/embedding-service.py
curl http://127.0.0.1:8765/health
```

`--self-test` loads the model, embeds one query and two passages and exits
0 when shapes and norms are right. The service listens on 127.0.0.1:8765
(`--host`, `--port` or `EMBEDDING_HOST`, `EMBEDDING_PORT`). `/health`
returns the model and dims and the model and data version of
`data/index-vectors.json`; they must match the unpack's output. The service
refuses to start when the vectors were built with another model. For the
fallback, `EMBEDDING_MODEL=OPI-PIB/PolDense-150M` needs vectors built with
it (`.venv-embedding/Scripts/python scripts/build-index-vectors.py`).

## 5. Check the data against the types

```
node scripts/build-data-types.mjs --check
```

It type-checks every file present in `data/` against
`src/lib/data/types.ts` with the project's tsc (install the app first:
`npx pnpm@12.6.0 install`; json-schema-to-typescript and js-yaml come
through npx, so the first run needs the network). Then start the app as in
`AGENTS.md`.

## Rebuild instead of unpack (partner hand-over)

After a partner hand-over or a change of the prompt or
the taxonomies, the data is rebuilt rather than unpacked: unpack the last
bundle first (so only new or changed records are extracted), add the new
source records, run the extraction with the skill `/extract-innovations`
in Claude Code (`.claude/skills/extract-innovations/`, contract in
[innovation-record.md](innovation-record.md) section 1), then make the
next release with the build steps included:

```
.venv/Scripts/python scripts/pack-data.py --release X.Y.Z --rebuild
```

`--rebuild` runs steps 4 to 7 of the rebuild order in
[data/README.md](../data/README.md) (`derive-records.py build`,
`build-static-data.py --only origins,organisations`,
`build-index-vectors.py` with the embedding venv, `check-links.py` and the
build again) and stops at the first failure; `--no-links` skips the link
check on a machine without network. The extraction and the static
downloads (`fetch-static-data.py`) never run from here: a source record
without a valid derived record makes the pack refuse. Share the zip and
its note.
