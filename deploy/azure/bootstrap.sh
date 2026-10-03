#!/usr/bin/env bash
# One-time link between Azure and the GitHub workflow
# .github/workflows/deploy-azure.yml (docs/azure-deploy.md). Run it once, by
# someone who is Owner of the subscription, in Azure Cloud Shell (Bash) or
# any shell where `az login` was done:
#
#   AZURE_SUBSCRIPTION=<name or id> bash bootstrap.sh
#
# It creates the resource group (or reuses it), the identity GitHub Actions
# logs in with (OIDC: no password, only from the branch main of the
# repository, Contributor on this resource group only), the Key Vault that
# holds the deploy secrets, and the SSH deploy key inside it. Nothing is set
# in GitHub, so no repository admin is needed: the script prints the
# settings for deploy/azure/settings.env, which anyone with write access
# commits. The VM itself is created by the workflow's first run.
#
# Settings, all optional, as environment variables:
#   AZURE_SUBSCRIPTION    name or id; default the one `az account show` names
#   GITHUB_REPO           default bobrovsky420/hackyeah2026
#   GITHUB_BRANCH         the branch the workflow deploys from, default main
#   GITHUB_OIDC_SUBJECT   the subject GitHub presents, when the CLI cannot look it up
#   AZURE_RESOURCE_GROUP  default hackyeah2026-rg; an existing group is reused
#   AZURE_LOCATION        default the existing group's region, else polandcentral
#   AZURE_VM_NAME         default router
#   AZURE_DNS_LABEL       default <AZURE_VM_NAME>-<first 6 characters of the subscription id>
#   AZURE_KEY_VAULT       default hy26-<first 8 characters of the subscription id>
#
# Running it again is safe: every step checks what is already there.
set -euo pipefail
export MSYS_NO_PATHCONV=1  # Git Bash: keep /subscriptions/... as it is

[ -z "${AZURE_SUBSCRIPTION:-}" ] || az account set --subscription "$AZURE_SUBSCRIPTION"

REPO="${GITHUB_REPO:-bobrovsky420/hackyeah2026}"
BRANCH="${GITHUB_BRANCH:-main}"
RG="${AZURE_RESOURCE_GROUP:-hackyeah2026-rg}"
EXISTING_LOCATION="$(az group show -n "$RG" --query location -o tsv 2>/dev/null || true)"
LOCATION="${AZURE_LOCATION:-${EXISTING_LOCATION:-polandcentral}}"
if [ -n "$EXISTING_LOCATION" ] && [ "$LOCATION" != "$EXISTING_LOCATION" ]; then
  echo "bootstrap: $RG already exists in $EXISTING_LOCATION, not $LOCATION; unset AZURE_LOCATION or pick another AZURE_RESOURCE_GROUP" >&2
  exit 1
fi
VM_NAME="${AZURE_VM_NAME:-router}"

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"
DNS_LABEL="${AZURE_DNS_LABEL:-$VM_NAME-$(printf %s "$SUBSCRIPTION_ID" | cut -c1-6)}"
KV="${AZURE_KEY_VAULT:-hy26-$(printf %s "$SUBSCRIPTION_ID" | cut -c1-8)}"
echo "bootstrap: subscription $(az account show --query name -o tsv) ($SUBSCRIPTION_ID), $RG in $LOCATION, repository $REPO, branch $BRANCH"

echo "== resource providers and the resource group"
for ns in Microsoft.Compute Microsoft.Network Microsoft.KeyVault; do
  az provider register --namespace "$ns" --wait -o none
done
[ -n "$EXISTING_LOCATION" ] || az group create -n "$RG" -l "$LOCATION" -o none
RG_ID="$(az group show -n "$RG" --query id -o tsv)"

# Role assignments reach the services a little after they are made: retry.
assign() {  # assign <assignee object or app id> <role> <scope>
  for attempt in 1 2 3 4 5 6; do
    if [ "$(az role assignment list --assignee "$1" --scope "$3" --role "$2" --query 'length(@)' -o tsv)" != 0 ]; then
      return 0
    fi
    az role assignment create --assignee "$1" --scope "$3" --role "$2" -o none 2>/dev/null && return 0
    [ "$attempt" = 6 ] && { echo "bootstrap: assigning $2 failed" >&2; exit 1; }
    sleep 10
  done
}

echo "== the deploy identity (GitHub OIDC, branch $BRANCH)"
APP_NAME="github-deploy-$(printf %s "$REPO" | tr / -)"
CLIENT_ID="$(az ad app list --display-name "$APP_NAME" --query '[0].appId' -o tsv)"
if [ -z "$CLIENT_ID" ]; then
  CLIENT_ID="$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)"
fi
az ad sp show --id "$CLIENT_ID" -o none 2>/dev/null || az ad sp create --id "$CLIENT_ID" -o none
# GitHub presents the subject in one of two forms: repo:<owner>/<repo>:... or,
# for repositories on the newer format, with the numeric ids,
# repo:<owner>@<owner id>/<repo>@<repo id>:... Register both; the ids come
# from the GitHub CLI when it is logged in, or from GITHUB_OIDC_SUBJECT.
SUBJECTS="repo:$REPO:ref:refs/heads/$BRANCH"
if [ -n "${GITHUB_OIDC_SUBJECT:-}" ]; then
  SUBJECTS="$SUBJECTS $GITHUB_OIDC_SUBJECT"
elif command -v gh >/dev/null && IDS="$(gh api "repos/$REPO" --jq '"\(.owner.id) \(.id)"' 2>/dev/null)"; then
  read -r OWNER_ID REPO_ID <<<"$IDS"
  SUBJECTS="$SUBJECTS repo:${REPO%%/*}@$OWNER_ID/${REPO#*/}@$REPO_ID:ref:refs/heads/$BRANCH"
else
  echo "bootstrap: no GitHub CLI login; registering only $SUBJECTS (see docs/azure-deploy.md if the login fails)" >&2
fi
n=0
for SUBJECT in $SUBJECTS; do
  n=$((n + 1))
  if [ "$(az ad app federated-credential list --id "$CLIENT_ID" --query "[?subject=='$SUBJECT'] | length(@)" -o tsv)" = 0 ]; then
    az ad app federated-credential create --id "$CLIENT_ID" -o none --parameters "{
      \"name\": \"github-$(printf %s "$BRANCH" | tr -c 'A-Za-z0-9-' -)-$n\",
      \"issuer\": \"https://token.actions.githubusercontent.com\",
      \"subject\": \"$SUBJECT\",
      \"audiences\": [\"api://AzureADTokenExchange\"]
    }"
  fi
done
assign "$CLIENT_ID" Contributor "$RG_ID"

echo "== the Key Vault $KV (the deploy secrets)"
if ! az keyvault show -n "$KV" -g "$RG" -o none 2>/dev/null; then
  az keyvault create -n "$KV" -g "$RG" -l "$LOCATION" --enable-rbac-authorization true -o none
fi
KV_ID="$(az keyvault show -n "$KV" -g "$RG" --query id -o tsv)"
assign "$CLIENT_ID" "Key Vault Secrets User" "$KV_ID"
ME="$(az ad signed-in-user show --query id -o tsv)"
assign "$ME" "Key Vault Secrets Officer" "$KV_ID"

echo "== the SSH deploy key (secret vm-ssh-private-key)"
if ! az keyvault secret show --vault-name "$KV" -n vm-ssh-private-key -o none 2>/dev/null; then
  TMP="$(mktemp -d)"
  ssh-keygen -t ed25519 -N "" -C "github-deploy-$VM_NAME" -f "$TMP/key" >/dev/null
  # The new role may take a minute to apply to the vault.
  for attempt in $(seq 1 12); do
    az keyvault secret set --vault-name "$KV" -n vm-ssh-private-key --file "$TMP/key" -o none 2>/dev/null && break
    [ "$attempt" = 12 ] && { echo "bootstrap: could not write to $KV; run the script again in a minute" >&2; rm -rf "$TMP"; exit 1; }
    sleep 10
  done
  rm -rf "$TMP"
fi

cat <<EOF

bootstrap: done.

1. Put these lines in deploy/azure/settings.env and commit them to $BRANCH
   (no secrets in them; or send them to whoever does the commit):

AZURE_CLIENT_ID=$CLIENT_ID
AZURE_TENANT_ID=$TENANT_ID
AZURE_SUBSCRIPTION_ID=$SUBSCRIPTION_ID
AZURE_RESOURCE_GROUP=$RG
AZURE_VM_NAME=$VM_NAME
AZURE_DNS_LABEL=$DNS_LABEL
AZURE_KEY_VAULT=$KV

2. Put the app's secrets into the vault (here, or in the portal: Key Vault
   $KV, Objects, Secrets):

az keyvault secret set --vault-name $KV -n hf-token --value '<Hugging Face token>'
az keyvault secret set --vault-name $KV -n anthropic-api-key --value '<Anthropic key>'
az keyvault secret set --vault-name $KV -n rops-token --value '<code of the ROPS panel>'

3. Actions, "Deploy to Azure", Run workflow (from $BRANCH).
EOF
