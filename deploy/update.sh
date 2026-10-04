#!/usr/bin/env bash
# Deploy the current main on the server (docs/server-deploy.md): pull,
# install the data release of DATA_RELEASE, install packages, build, and
# restart. The app is down during the build (about two minutes), because
# `next build` rewrites .next under a running server; never update while
# the jury uses the app. The embedding service restarts only when the
# vectors changed.
#
#   bash deploy/update.sh [--no-pull]
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"
set -a; . ./.env.server; set +a

[ "${1:-}" = --no-pull ] || git pull --ff-only

# The pins may have changed with the pull (torch stays, it is pinned and installed).
export PATH="$HOME/.local/bin:$PATH"
uv pip install --python .venv/bin/python -r requirements.txt

vectors_sum() { sha256sum data/built/index-vectors.json 2>/dev/null | cut -d' ' -f1 || true; }  # empty before the first release
before="$(vectors_sum)"
.venv/bin/python scripts/get-data.py --prune
after="$(vectors_sum)"

pnpm install --frozen-lockfile
trap 'echo "update: failed with the app stopped; fix it or roll back (docs/server-deploy.md, section 4)" >&2' ERR
sudo systemctl stop app
pnpm build

if [ "$before" != "$after" ] || ! systemctl is-active --quiet embedding; then
  sudo systemctl restart embedding
fi
sudo systemctl start app

echo "== waiting for /api/health"
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3000/api/health; then
    echo
    echo "update: $(git log -1 --format='%h %s')"
    exit 0
  fi
  sleep 2
done
echo "update: the app did not become healthy; see journalctl -u app -n 100" >&2
exit 1
