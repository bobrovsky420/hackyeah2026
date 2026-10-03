# Quick start

The app on your own machine, from a fresh clone. It runs with nothing
installed beyond Node.js: there is no database, [storage.md](storage.md)), the data comes as files, and the model is
an API key or a recording. Commands are for Windows (Git Bash or
PowerShell) from the repository root; on Linux and macOS write
`.venv/bin/python` for `.venv/Scripts/python` and set variables as
`VAR=value command`. Without Node.js or Python at all, the Docker stack of
[local-stack.md](local-stack.md) runs everything as two containers.

## 1. Run the app (five minutes)

Needs git and Node.js 22 or later.

```
git clone <repository URL> HackYeah2026
cd HackYeah2026
npx pnpm@12.6.0 install
npx pnpm@12.6.0 dev
```

Open http://localhost:3000. Without `data/` the app serves the prototype's
fixtures of `src/lib/mock/` and answers routes with the keyword stand-in
("canned"): every screen, the map and the forms work, and the routes are
the prepared examples. The ROPS console at http://localhost:3000/rops
takes the code `rops-prototyp` under `next dev`. Entries you save land in
`.local/store/records.json` and survive a restart; a fresh store starts
with three example needs and two example readiness registrations.

Checks: `npx pnpm@12.6.0 typecheck`, `lint` and `test` (Vitest);
`test:e2e`, `a11y` and `screenshots` build the app and serve it on port
3100 (locally in Edge), so stop a server of your own on that port first.

## 2. Add the real data (ten minutes)

The catalogue, the index cards, the vectors, the places and the replay
files of the demo come as one bundle, `data-X.Y.Z.zip`, from the person
who built the data or from the team drive (`data-0.0.2` at the time of
writing). Python 3.14:

```
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python scripts/unpack-data.py .local/bundles/data-0.0.2.zip
```

Copy the zip into `.local/bundles/` first. Restart `pnpm dev`:
`/api/health` names the data version, "Jak to działa" shows it, and the
routes run the real pipeline as soon as a model answers (step 3). What
the unpack checks, `get-data.py` for a published release, and a rebuild
after a partner hand-over are in [data-setup.md](data-setup.md).

## 3. Give it a model

Put the keys into `.env.dev` at the repository root (git-ignored; the app
and the scripts read it outside production, and a variable set in the
environment wins):

```
HF_TOKEN=<Hugging Face token>
ANTHROPIC_API_KEY=<optional, the fallback>
```

`HF_TOKEN` is Bielik on the Hugging Face router, the primary provider
(specification 9.3); then Anthropic, then Llama 3.3 on the same router,
then the per-call recording in `.local/llm-replay/`. Without any key,
`LLM_PROVIDER=replay` answers from the recording alone: the demo path and
the test problems of the bundle work, and a new text gets a 503 unless
its route is in the cache.

## 4. The retriever (optional)

Stage 1 of the matching ranks the index cards by embeddings (PolDense,
FR-3.7) through a small Python service; without it the app falls back to
a keyword scorer and says so in the request log.

```
.venv/Scripts/python -m venv .venv-embedding
.venv-embedding/Scripts/python -m pip install -r requirements-embedding.txt
.venv-embedding/Scripts/python scripts/embedding-service.py
```

The first start downloads the model (about 1.5 GB; PolDense is under the
Gemma terms, accepted once on the model page with the account of
`HF_TOKEN`). The service listens on 127.0.0.1:8765; the line
`retrieve:embedding-service` in the log of a route shows it is in use.
Details in [data-setup.md](data-setup.md), sections 3 and 4.

## Variables you may need

| Variable | What |
|---|---|
| `ROPS_TOKEN` | The console's access code; a production server without it keeps the console locked |
| `ROUTE_ENGINE=canned` or `live` | Forces the keyword stand-in or the real pipeline (default: live when the data and a model are there) |
| `LLM_PROVIDER=replay`, `REPLAY_ONLY=true` | The recording only, no model calls (the demo laptop) |
| `STORE_FILE` | The store's file, default `.local/store/records.json`; `memory` keeps the entries in memory only ([storage.md](storage.md)) |
| `DATA_SOURCE=data` or `mock` | Forces the real data (an error stops the app) or the fixtures |
| `PUBLIC_WRITES=false` | Closes every public form, the kill switch of FR-6.4 |
| `EMBEDDING_URL`, `EMBEDDING_MODEL` | The retriever's service and model (defaults 127.0.0.1:8765 and OPI-PIB/PolDense-400M) |

## Reset

- The entries: stop the server, delete `.local/store/records.json`.
- The data: run `unpack-data.py` again; git keeps the hand-written files
  of `data/`, the built ones are git-ignored.
- A second server on the same machine (another port) runs with
  `STORE_FILE=memory` or its own file: two servers on one file overwrite
  each other's saves.

## Where things are

- [AGENTS.md](../AGENTS.md): the rules of the repository, the commands,
  the stack.
- [functional-specification.md](functional-specification.md): what is
  built and why; [decision-log.md](decision-log.md): the decisions.
- [storage.md](storage.md): the store; [data-setup.md](data-setup.md):
  the data; [local-stack.md](local-stack.md): Docker;
  [data/README.md](../data/README.md): the data contract.
