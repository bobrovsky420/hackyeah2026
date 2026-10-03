# Quick start

The app on your own machine, from a fresh clone, with the real data, a
model and the embedding retriever. There is no database: the data comes
as files, and the model is reached with an API key.

Commands are for a Unix shell (Linux or macOS) from the repository root.
On Windows, run them in Git Bash and write `.venv/Scripts/python` for
`.venv/bin/python`.

## What you need

- git and Node.js 22 or later (npx comes with it).
- Python 3.14 (the pins were made with it).
- About 3 GB of disk for the Python packages and the embedding model.
- A Hugging Face account with a token that may read gated repositories
  and call Inference Providers, and the Gemma terms accepted once on the
  page of [OPI-PIB/PolDense-400M](https://huggingface.co/OPI-PIB/PolDense-400M)
  with that account.
- The data bundle `data-X.Y.Z.zip` (step 4).

## 1. Clone the app

```
git clone https://github.com/bobrovsky420/hackyeah2026.git HackYeah2026
cd HackYeah2026
npx pnpm@12.6.0 install
```

## 2. Create the Python environment

On macOS and Windows, skip the second line.

```
python3 -m venv .venv
.venv/bin/python -m pip install --index-url https://download.pytorch.org/whl/cpu torch==2.14.0
.venv/bin/python -m pip install -r requirements.txt
```

## 3. Set the keys

Create `.env.dev` in the repository root:

```
HF_TOKEN=<Hugging Face token>
```

## 4. Add the real data

Download the bundle `data-0.0.2.zip` to `~/Downloads`, then copy it into
`.local/bundles/` and unpack it:

```
mkdir -p .local/bundles
cp ~/Downloads/data-0.0.2.zip .local/bundles/
.venv/bin/python scripts/unpack-data.py .local/bundles/data-0.0.2.zip
```

## 5. Start the app with the embeddings

```
npx pnpm@12.6.0 dev:embeddings
```

Wait for `serving OPI-PIB/PolDense-400M (1024 dimensions) on
http://127.0.0.1:8765`, then open http://localhost:3000.

## 6. Check that it all runs

- Open http://localhost:3000/api/health and check the data version.
- Describe a need, ask for a route and look for
  `retrieve:embedding-service` in the log.

## Run the browser tests

The Playwright runs build the app and use Edge; on a machine without it,
name another installed browser:

```
E2E_CHANNEL=chrome npx pnpm@12.6.0 test:e2e
E2E_CHANNEL=chrome npx pnpm@12.6.0 a11y
```

## Reset

- The entries: stop the server, `rm .local/store/records.json`.
- The data: run `unpack-data.py` again; git keeps the hand-written files
  of `data/curated/`, the built ones in `data/built/` are git-ignored.

## Where things are

- [AGENTS.md](../AGENTS.md): the rules of the repository, the commands,
  the stack.
- [functional-specification.md](functional-specification.md): what is
  built and why.
- [storage.md](storage.md): the store; [data-setup.md](data-setup.md):
  the data; [server-deploy.md](server-deploy.md): the
  server; [data/README.md](../data/README.md): the data contract.
