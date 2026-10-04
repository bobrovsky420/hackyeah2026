#!/usr/bin/env bash
# Run on the Azure VM by the workflow .github/workflows/deploy-azure.yml
# (docs/azure-deploy.md), from the checkout the workflow pushed, after it
# wrote .env.server and copied the data release into .local/bundles/.
# The first time (no app service yet) or with --setup it runs
# deploy/setup.sh; otherwise deploy/update.sh --no-pull.
#
#   bash deploy/azure/remote.sh <site address> [--setup]
set -euo pipefail

SITE="${1:?usage: bash deploy/azure/remote.sh <site address> [--setup]}"
APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$APP_DIR"

# A fresh VM may still be running cloud-init, which holds the apt lock.
if command -v cloud-init >/dev/null; then
  cloud-init status --wait >/dev/null || true
fi
# No session here answers a prompt: apt and needrestart must not ask.
echo 'debconf debconf/frontend select Noninteractive' | sudo debconf-set-selections
if [ -d /etc/needrestart/conf.d ] && [ ! -f /etc/needrestart/conf.d/90-deploy.conf ]; then
  echo "\$nrconf{restart} = 'a';" | sudo tee /etc/needrestart/conf.d/90-deploy.conf >/dev/null
fi

if [ "${2:-}" = --setup ] || [ ! -f /etc/systemd/system/app.service ] || [ ! -x .venv/bin/python ]; then
  echo "== full setup of the server"
  bash deploy/setup.sh "$SITE"
else
  echo "== update"
  bash deploy/update.sh --no-pull
fi
