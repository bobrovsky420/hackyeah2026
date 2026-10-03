#!/usr/bin/env bash
# One-time link between Azure and the GitHub workflow
# .github/workflows/deploy-azure.yml (docs/azure-deploy.md). Run it once, by
# someone who is Owner of the subscription, in Azure Cloud Shell (Bash) or
# any shell where `az login` was done:
#
#   bash bootstrap.sh
#
# It creates the resource group, the identity GitHub Actions logs in with
# (OIDC: no password, only from the environment "production" of the
# repository, Contributor on this resource group only) and the SSH deploy
# key. With the GitHub CLI logged in (`gh auth login`, an admin of the
# repository) it also creates the environment and sets the variables and
# the key secret; otherwise it prints them for the repository settings.
# The VM itself is created by the workflow's first run.
#
# Settings, all optional, as environment variables:
#   GITHUB_REPO           default bobrovsky420/hackyeah2026
#   AZURE_RESOURCE_GROUP  default hackyeah2026-rg
#   AZURE_LOCATION        default polandcentral
#   AZURE_VM_NAME         default router
#   AZURE_DNS_LABEL       default <AZURE_VM_NAME>-<first 6 characters of the subscription id>
#
# Running it again is safe: every step checks what is already there.
set -euo pipefail
export MSYS_NO_PATHCONV=1  # Git Bash: keep /subscriptions/... as it is

REPO="${GITHUB_REPO:-bobrovsky420/hackyeah2026}"
RG="${AZURE_RESOURCE_GROUP:-hackyeah2026-rg}"
LOCATION="${AZURE_LOCATION:-polandcentral}"
VM_NAME="${AZURE_VM_NAME:-router}"

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"
DNS_LABEL="${AZURE_DNS_LABEL:-$VM_NAME-$(printf %s "$SUBSCRIPTION_ID" | cut -c1-6)}"
echo "bootstrap: subscription $SUBSCRIPTION_ID, $RG in $LOCATION, repository $REPO"

echo "== resource providers and the resource group"
for ns in Microsoft.Compute Microsoft.Network; do
  az provider register --namespace "$ns" -o none
done
az group create -n "$RG" -l "$LOCATION" -o none
RG_ID="$(az group show -n "$RG" --query id -o tsv)"

echo "== the deploy identity (GitHub OIDC, environment production)"
APP_NAME="github-deploy-$(printf %s "$REPO" | tr / -)"
CLIENT_ID="$(az ad app list --display-name "$APP_NAME" --query '[0].appId' -o tsv)"
if [ -z "$CLIENT_ID" ]; then
  CLIENT_ID="$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)"
fi
az ad sp show --id "$CLIENT_ID" -o none 2>/dev/null || az ad sp create --id "$CLIENT_ID" -o none
SUBJECT="repo:$REPO:environment:production"
if [ "$(az ad app federated-credential list --id "$CLIENT_ID" --query "[?subject=='$SUBJECT'] | length(@)" -o tsv)" = 0 ]; then
  az ad app federated-credential create --id "$CLIENT_ID" -o none --parameters "{
    \"name\": \"github-production\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"$SUBJECT\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }"
fi
# A new service principal takes a moment to reach the role service.
for attempt in 1 2 3 4 5 6; do
  if [ "$(az role assignment list --assignee "$CLIENT_ID" --scope "$RG_ID" --role Contributor --query 'length(@)' -o tsv)" != 0 ]; then
    break
  fi
  az role assignment create --assignee "$CLIENT_ID" --scope "$RG_ID" --role Contributor -o none && break
  [ "$attempt" = 6 ] && { echo "bootstrap: the role assignment failed" >&2; exit 1; }
  sleep 10
done

echo "== the SSH deploy key"
KEY="$HOME/.ssh/deploy-$VM_NAME"
mkdir -p "$HOME/.ssh"
[ -f "$KEY" ] || ssh-keygen -t ed25519 -N "" -C "github-deploy-$VM_NAME" -f "$KEY" >/dev/null

VARS="AZURE_CLIENT_ID=$CLIENT_ID
AZURE_TENANT_ID=$TENANT_ID
AZURE_SUBSCRIPTION_ID=$SUBSCRIPTION_ID
AZURE_RESOURCE_GROUP=$RG
AZURE_LOCATION=$LOCATION
AZURE_VM_NAME=$VM_NAME
AZURE_DNS_LABEL=$DNS_LABEL"

if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  echo "== GitHub: the environment production, its variables and the key"
  gh api -X PUT "repos/$REPO/environments/production" >/dev/null
  while IFS='=' read -r k v; do
    gh variable set "$k" -R "$REPO" -e production -b "$v"
  done <<<"$VARS"
  gh secret set VM_SSH_PRIVATE_KEY -R "$REPO" -e production <"$KEY"
  cat <<EOF

bootstrap: done. Still to set in GitHub (Settings, Environments, production):
  secrets   HF_TOKEN, ANTHROPIC_API_KEY, ROPS_TOKEN
  variable  DATA_RELEASE (for example 0.0.6), with the release data-<X.Y.Z> published
Then: Actions, "Deploy to Azure", Run workflow.
EOF
else
  cat <<EOF

bootstrap: done. In GitHub, repository Settings, Environments, create
"production", then add to it:

Variables:
$VARS
DATA_RELEASE=<the data release, for example 0.0.6>

Secrets:
HF_TOKEN, ANTHROPIC_API_KEY, ROPS_TOKEN, and VM_SSH_PRIVATE_KEY with the
whole text below (both marker lines included):

$(cat "$KEY")

Then: Actions, "Deploy to Azure", Run workflow.
EOF
fi
