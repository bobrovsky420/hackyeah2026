# The server on Azure, deployed from GitHub Actions

For the team that runs the public demo on Azure. The server is the one of
[server-deploy.md](server-deploy.md): the app and the embedding service as
two systemd services behind Caddy on one Ubuntu VM, set up by
`deploy/setup.sh` and updated by `deploy/update.sh`. What Azure adds is a
pipeline: anyone with write access to the repository runs the workflow
"Deploy to Azure" in the Actions tab, and a GitHub runner creates the VM
when it does not exist, delivers the code, the data release and the
settings, sets up or updates the server and checks the site. Nobody needs
a laptop with tools or keys for a deploy, and nothing is stored in
GitHub's secrets or environments, so no repository admin is needed: the
secrets live in an Azure Key Vault and the other settings in a committed
file.

| File | What it does |
|---|---|
| [.github/workflows/deploy-azure.yml](../.github/workflows/deploy-azure.yml) | The pipeline, started by hand (section 4) |
| [deploy/azure/main.bicep](../deploy/azure/main.bicep) | The VM (Ubuntu 24.04, `Standard_B2ms`, 2 vCPU and 8 GB, 64 GB disk), a static IP with the free name `<label>.<region>.cloudapp.azure.com`, a firewall with 80 and 443 open |
| [deploy/azure/remote.sh](../deploy/azure/remote.sh) | Runs on the VM: `setup.sh` the first time, `update.sh` after that |
| [deploy/azure/settings.env](../deploy/azure/settings.env) | The settings the pipeline reads: the Azure ids, the Key Vault, the data release (nothing secret) |
| [deploy/azure/bootstrap.sh](../deploy/azure/bootstrap.sh) | Once, by a subscription Owner: the link between Azure and GitHub and the Key Vault (section 1) |

Why a VM and not Container Apps or App Service: the entries live in one
JSON file that exactly one process may write ([storage.md](storage.md)),
and a container platform starts the new revision before it stops the old
one, so two processes would share the file during every deploy. The
embedding model (PolDense, about 1.6 GB, gated) and the data release (not
in git) also stay simpler on a disk than in an image.

## What a run does

1. On a GitHub runner: `pnpm lint` and `pnpm typecheck`.
2. Reads `deploy/azure/settings.env`, downloads the asset
   `data-X.Y.Z.zip` of the GitHub release `data-X.Y.Z`, logs in to Azure
   through OIDC (no stored password; Azure accepts only a run started
   from `main`), reads the secrets from the Key Vault, and creates the VM
   from `main.bicep` when it does not exist (a stopped VM is started).
3. Opens SSH in the firewall for the runner's address only, pushes the
   commit to deploy (the head of `main`, or the input `ref`) to the VM's
   repository with `git push` (the VM never holds GitHub credentials),
   copies the zip into `.local/bundles/` and writes `.env.server` from
   the vault's secrets.
4. Runs `deploy/azure/remote.sh`: the first time `deploy/setup.sh`
   (Node, Caddy, Python and the model, the services; 10 to 15 minutes),
   after that `deploy/update.sh --no-pull` (data release through
   `get-data.py`, packages, build, restart; about 3 minutes, the app down
   for about 2 of them).
5. Closes SSH again (also when a step failed) and waits for
   `https://<site>/api/health`.

The entries (`.local/store/records.json`) stay on the VM's disk across
deploys.

## 1. Link Azure and GitHub, once

Needs: Owner of the Azure subscription (the script assigns roles). No
GitHub admin and no local tools: in the Azure portal open Cloud Shell
(the `>_` icon), choose Bash, and run:

```
gh auth login            # the repository is private: lets Cloud Shell download the script
gh api "repos/bobrovsky420/hackyeah2026/contents/deploy/azure/bootstrap.sh?ref=main" \
  -H "Accept: application/vnd.github.raw" > bootstrap.sh
AZURE_SUBSCRIPTION=DimauSubscription bash bootstrap.sh
```

(Or upload `deploy/azure/bootstrap.sh` with Manage files, Upload.)
`AZURE_SUBSCRIPTION` (a name or an id) picks the subscription; without
it the script uses the one `az account show` names. The resource group
`hackyeah2026-rg` is reused when it exists, and the VM and the vault go
to its region; otherwise the script creates it in `polandcentral`. The
defaults (repository `bobrovsky420/hackyeah2026`, branch `main`,
resource group `hackyeah2026-rg`, VM `router`, vault
`hy26-<subscription id prefix>`) change through environment variables,
for example `AZURE_RESOURCE_GROUP=hackyeah2026-we-rg AZURE_LOCATION=westeurope`
when the region of the group has no quota for the VM size; the list is
at the top of the script. Running it again is safe.

It creates the resource group when missing; an app registration
`github-deploy-<owner>-<repo>` that GitHub Actions may log in as only
from the branch `main` of this repository, with Contributor on this
resource group only; the Key Vault (RBAC: the app may read secrets, the
person running the script may write them); and the SSH deploy key,
which it keeps only in the vault as `vm-ssh-private-key`.

At the end it prints the `AZURE_` lines: put them in
[deploy/azure/settings.env](../deploy/azure/settings.env) and commit to
`main` (anyone with write access; the values are ids, not secrets).

## 2. The secrets in the Key Vault

In Cloud Shell (the script prints these lines with the vault's name), or
in the portal (Key Vault, Objects, Secrets, Generate/Import):

| Secret | Value |
|---|---|
| `hf-token` | Hugging Face token: Bielik, and the gated PolDense model (Gemma terms accepted once with the token's account); required |
| `anthropic-api-key` | the fallback provider |
| `rops-token` | the code of the ROPS panel; without it the panel stays locked |
| `server-env-extra`, optional | more lines for `.env.server`, for example `REPLAY_ONLY=true` ([server.env.example](../deploy/server.env.example)) |
| `vm-ssh-private-key` | set by the script; do not change |

```
az keyvault secret set --vault-name <vault> -n hf-token --value '<token>'
```

A changed secret reaches the server with the next run. Another team
member who should set secrets needs the role "Key Vault Secrets Officer"
on the vault (Access control (IAM), Add role assignment).

The non-secret settings are in `deploy/azure/settings.env`:
`DATA_RELEASE` (for example `0.0.6`), optionally `AZURE_VM_SIZE`
(default `Standard_B2ms`; `Standard_B2s`, 4 GB, is the minimum) and
`DATA_REPO` (the repository with the data releases, default this one).
The run always reads the file of `main`.

## 3. Publish the data release

The data is not in git ([data-setup.md](data-setup.md)). The person who
made the release publishes its zip once: on GitHub, Releases, Draft a new
release, tag `data-X.Y.Z` (for example `data-0.0.6`), attach
`data-X.Y.Z.zip` from `.local/bundles/` (and its note as the
description), Publish. Then set `DATA_RELEASE=X.Y.Z` in `deploy/azure/settings.env`. A run whose
release is missing stops before it touches Azure, with the name of the
missing asset.

## 4. Deploy

Actions, "Deploy to Azure", Run workflow: leave the branch on `main` (a
run from another branch fails at the Azure login), optionally a data
release that overrides `DATA_RELEASE`, and
"Run the full server setup again" only after a change to `deploy/setup.sh`,
the services or the Caddyfile. The run's summary links the site; the
first run prints the site address (`https://<label>.<region>.cloudapp.azure.com`)
at the end of its log.

Roll back: run the workflow with `ref` set to the previous commit (its
hash, a tag or a branch); the settings still come from `main`.

## 5. Look after it

The commands of [server-deploy.md](server-deploy.md), section 5, on the
VM. To get there without opening SSH: the VM's "Run command" page in the
portal (RunShellScript, runs as root), for example
`systemctl status app embedding caddy --no-pager` or
`journalctl -u app -n 100 --no-pager`. For an SSH session, open the port
for your address and use the deploy key from the vault:

```
az keyvault secret show --vault-name <vault> -n vm-ssh-private-key --query value -o tsv > ~/.ssh/deploy-router
chmod 600 ~/.ssh/deploy-router
az network nsg rule create -g hackyeah2026-rg --nsg-name router-nsg -n admin-ssh \
  --priority 200 --source-address-prefixes <your ip>/32 --destination-port-ranges 22 --protocol Tcp
ssh -i ~/.ssh/deploy-router azureuser@<site address>
az network nsg rule delete -g hackyeah2026-rg --nsg-name router-nsg -n admin-ssh
```

## 6. Cost and clean-up

`Standard_B2ms` with its disk and the static IP cost about 70 USD a month;
stop the VM in the portal ("Stop" deallocates it) when nobody needs it:
the address stays, and the next run of the workflow starts it again.
Before the demo, take a snapshot of the OS disk. After the event, in
Cloud Shell:

```
az group delete -n hackyeah2026-rg
az keyvault purge -n <vault>
az ad app delete --id <AZURE_CLIENT_ID>
```

(The vault stays recoverable for 90 days after the group is deleted;
`purge` frees its name at once.)
