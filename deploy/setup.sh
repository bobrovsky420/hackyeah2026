#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 server (docs/server-deploy.md):
# Node 24 and pnpm, Caddy, Python 3.14 through uv with the embedding
# environment and the model, the two systemd units and the Caddyfile, then
# the first build through deploy/update.sh. Run it as the login user (not
# root) from the checkout, after .env.server is filled in:
#
#   bash deploy/setup.sh <site address>     e.g. router.example.pl or 3-120-45-67.sslip.io
#
# Running it again is safe: every step checks what is already there.
set -euo pipefail

SITE="${1:?usage: bash deploy/setup.sh <site address>}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_USER="$(id -un)"
cd "$APP_DIR"

if [ "$APP_USER" = root ]; then
  echo "setup: run as the login user with sudo rights, not as root" >&2
  exit 1
fi
if [ ! -f .env.server ]; then
  cp deploy/server.env.example .env.server
  chmod 600 .env.server
  echo "setup: fill in .env.server (at least HF_TOKEN), then run this again" >&2
  exit 1
fi
chmod 600 .env.server
set -a; . ./.env.server; set +a

echo "== swap (next build and torch need more than a small machine has)"
if ! swapon --show | grep -q .; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "== system packages, Node 24, Caddy"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
fi
sudo apt-get update
sudo apt-get install -y nodejs caddy git curl ca-certificates
PNPM_VERSION="$(node -p 'require("./package.json").packageManager.split("@")[1]')"
if [ "$(pnpm --version 2>/dev/null || true)" != "$PNPM_VERSION" ]; then
  sudo npm install -g "pnpm@$PNPM_VERSION"
fi

echo "== Python 3.14 and the embedding environment"
if ! command -v uv >/dev/null && [ ! -x "$HOME/.local/bin/uv" ]; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
export PATH="$HOME/.local/bin:$PATH"
[ -x .venv-embedding/bin/python ] || uv venv --python 3.14 .venv-embedding
# CPU torch first, from the PyTorch index: PyPI's Linux wheel pulls the CUDA libraries.
uv pip install --python .venv-embedding/bin/python --index-url https://download.pytorch.org/whl/cpu \
  "torch==$(sed -n 's/^torch==//p' requirements-embedding.txt)"
uv pip install --python .venv-embedding/bin/python -r requirements-embedding.txt

echo "== the embedding model (gated on the Hub: HF_TOKEN, Gemma terms accepted once)"
HF_TOKEN="${HF_TOKEN:?HF_TOKEN is empty in .env.server}" \
EMBEDDING_MODEL="${EMBEDDING_MODEL:-OPI-PIB/PolDense-400M}" \
  .venv-embedding/bin/python -c "import os; from sentence_transformers import SentenceTransformer; SentenceTransformer(os.environ['EMBEDDING_MODEL'])"

echo "== systemd units and Caddy"
for unit in embedding app; do
  sed -e "s|@APP_DIR@|$APP_DIR|g" -e "s|@APP_USER@|$APP_USER|g" "deploy/$unit.service" \
    | sudo tee "/etc/systemd/system/$unit.service" >/dev/null
done
sed -e "s|@SITE@|$SITE|g" deploy/Caddyfile | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable embedding app
sudo systemctl reload-or-restart caddy

echo "== first build and start"
bash deploy/update.sh --no-pull

echo "setup: done; open https://$SITE"
