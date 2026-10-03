# syntax=docker/dockerfile:1
# The images of the local stack (docs/local-stack.md), one target each:
#   data       the data release DATA_RELEASE, got and unpacked by scripts/get-data.py
#              (.local/bundles/data-X.Y.Z.zip of the build context, else the GitHub release)
#   app        the Next.js build over that data, served by `next start`
#   embedding  the embedding service (FR-3.7) with the model and that release's vectors
# The data goes in at build time because the app prerenders pages and routes
# from data/ (the map routes are force-static); a new release is a rebuild.
#
#   docker compose --env-file .env.dev --profile stack build

# ------------------------------------------------------------------ data
FROM python:3.14-slim AS data
ARG DATA_RELEASE
ARG DATA_SHA256
ARG DATA_REPO
WORKDIR /work
COPY scripts/get-data.py scripts/unpack-data.py scripts/
# The zips of .local/bundles/ are the only files of .local/ in the context (.dockerignore).
RUN --mount=type=bind,source=.,target=/context \
    --mount=type=secret,id=github_token \
    mkdir -p .local/bundles \
 && { cp /context/.local/bundles/data-*.zip .local/bundles/ 2>/dev/null || true; } \
 && GITHUB_TOKEN="$(cat /run/secrets/github_token 2>/dev/null)" \
    DATA_RELEASE="${DATA_RELEASE}" DATA_SHA256="${DATA_SHA256}" DATA_REPO="${DATA_REPO}" \
    python scripts/get-data.py --root /work \
 && rm -rf .local/bundles .local/pipeline

# ------------------------------------------------------------------- app
FROM node:24-bookworm-slim AS app
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@12.6.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY --exclude=.local . .
COPY --from=data /work/data ./data
RUN pnpm build
# The replay files of the release (12.4): copied into the writable volume
# /app/.local on start, without overwriting what this laptop recorded since.
COPY --from=data /work/.local /app/replay-seed

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "mkdir -p .local && cp -Rn replay-seed/. .local/ && node_modules/.bin/tsx scripts/db-migrate.ts && node_modules/.bin/tsx scripts/seed.ts && exec node_modules/.bin/next start -H 0.0.0.0 -p 3000"]

# ------------------------------------------------------------- embedding
FROM python:3.14-slim AS embedding
# PolDense is gated on the Hub (Gemma terms): the token comes from the secret
# hf_token (HF_TOKEN in .env.dev) and is never stored in a layer.
ARG EMBEDDING_MODEL=OPI-PIB/PolDense-400M
ENV EMBEDDING_MODEL=${EMBEDDING_MODEL} \
    HF_HOME=/models \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements-embedding.txt ./
# CPU torch first, from the PyTorch index: PyPI's Linux wheel pulls the CUDA libraries.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu \
        "torch==$(sed -n 's/^torch==//p' requirements-embedding.txt)" \
 && pip install --no-cache-dir -r requirements-embedding.txt
RUN --mount=type=secret,id=hf_token \
    HF_TOKEN="$(cat /run/secrets/hf_token 2>/dev/null)" \
    python -c "import os; from sentence_transformers import SentenceTransformer; SentenceTransformer(os.environ['EMBEDDING_MODEL'])"
ENV HF_HUB_OFFLINE=1

COPY scripts/embedding-service.py scripts/
COPY --from=data /work/data/index-vectors.json data/

EXPOSE 8765
HEALTHCHECK --interval=10s --timeout=5s --start-period=180s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/health', timeout=4)"
CMD ["python", "scripts/embedding-service.py", "--host", "0.0.0.0"]
