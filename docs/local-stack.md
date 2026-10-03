# The local stack: the whole app on one laptop

For a team member who runs the app on their own laptop: the demo laptop
(specification 12.4 and 13.4) or any other. It needs Docker and a checkout
of this repository, and nothing else: no Node.js, no Python, no model
download by hand. Commands are from the repository root and are the same
in PowerShell, Git Bash and a macOS or Linux shell.

## What runs

Three services of [docker-compose.yml](../docker-compose.yml), profile
`stack`, from the targets of [docker/Dockerfile](../docker/Dockerfile):

| Service | Image | What it holds |
|---|---|---|
| `db` | `pgvector/pgvector:pg16` | PostgreSQL 16, the same service as `pnpm db:up`; data in the volume `db-data` |
| `embedding` | `hackyeah2026/embedding` | The embedding service (FR-3.7) with the model and the vectors of the data release, so it runs offline |
| `app` | `hackyeah2026/app` | The app built over the data release; on start it copies the release's replay files into the volume `stack-local` (never over a file recorded since), applies the migrations and the example entries, then serves http://localhost:3000 |

The data release goes into the images at build time: the build takes
`data-X.Y.Z.zip` from `.local/bundles/`, or downloads it from the GitHub
release `data-X.Y.Z` of this repository, checks it and unpacks it
(`scripts/get-data.py`, then `scripts/unpack-data.py`). It has to be
build time, because the app prerenders pages and the map routes from
`data/`. Both images carry the same release, so the app and the vectors
always agree. Only this machine can reach the app and the database.

## 1. Prepare `.env.dev`

The stack reads the same git-ignored `.env.dev` as development. At least:

```
POSTGRES_PASSWORD=<any password of letters and digits>
DATA_RELEASE=0.1.0
HF_TOKEN=<Hugging Face token>
```

- `POSTGRES_PASSWORD` goes into a URL unescaped, so letters and digits only.
- `DATA_RELEASE` is the data release to build in. Without it, the newest
  `data-X.Y.Z.zip` in `.local/bundles/` is taken.
- `HF_TOKEN` is needed twice: to build the embedding image (PolDense is
  gated on the Hub under the Gemma terms; accept them once on the model
  page with the account of the token) and for Bielik on the router at run
  time. With images loaded from a file (section 5) it is needed only for
  Bielik.
- Optional: `GITHUB_TOKEN` (a token that can read this repository, while
  it is private; used at build time only), `DATA_SHA256` (pins the zip),
  `ANTHROPIC_API_KEY` (the fallback provider), `REPLAY_ONLY=true` (no model
  calls at all: only the cached routes of the demo answer, specification
  12.9), `APP_PORT` (default 3000, the port of `next dev` too),
  `EMBEDDING_MODEL=OPI-PIB/PolDense-150M` (needs a release whose vectors
  were built with it).

## 2. Build the images

```
docker compose --env-file .env.dev --profile stack build
```

The first build takes some minutes (CPU torch and the 1.5 GB model); after
that the model layers come from the cache and a rebuild takes about a
minute. Build again after pulling new code or changing `DATA_RELEASE`.
Without a network, copy the zip to `.local/bundles/` first.

## 3. Start

```
docker compose --env-file .env.dev --profile stack up -d --wait
```

`--wait` returns when the database, the embedding service and the app are
healthy, about half a minute. Then open http://localhost:3000. Check:

```
docker compose --env-file .env.dev --profile stack ps
docker compose --env-file .env.dev --profile stack logs app
curl http://localhost:3000/api/health
```

`/api/health` names the data version and the provider that answers first;
the log line `[route] ... retrieve:embedding-service` of a request shows
that the retriever uses the service, not the keyword fallback.

## 4. Another release, stop, reset

- Another release: set `DATA_RELEASE`, then `build` and `up -d --wait`.
- Stop and keep everything: `docker compose --env-file .env.dev --profile stack stop`.
- Start from nothing: `docker compose --env-file .env.dev --profile stack down -v`.
  Every need, contact request and recorded route is gone, and `db-data` is
  also the database of `pnpm db:up` on this machine.

## 5. Carry the images to another laptop

On a laptop that built them:

```
docker save -o stack-images.tar hackyeah2026/app hackyeah2026/embedding pgvector/pgvector:pg16
```

On the other laptop, with a checkout of the same commit and its own
`.env.dev` (section 1):

```
docker load -i stack-images.tar
docker compose --env-file .env.dev --profile stack up -d --wait
```

No build, no network: the data and the model are inside. The file is about
3 GB. Images are built for the processor of the building machine: an image
from a Windows or Intel laptop does not run on an Apple Silicon Mac, which
builds its own (section 2). The embedding image contains the PolDense
weights, so it stays inside the team, with the Gemma terms of use.

## Memory and disk

After start the three containers use under 1 GB (the model is mapped from
disk and read as needed); plan 2 GB for the embedding service under load.
Docker Desktop on Windows gives its Linux machine half of the laptop's
memory by default, which is enough on 8 GB. The images take about 4 GB of
disk once unpacked.
