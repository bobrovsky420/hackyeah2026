# The server on Azure, deployed from GitHub Actions

For the team that runs the public demo on Azure. The server is the one of
[server-deploy.md](server-deploy.md): the app and the embedding service as
two systemd services behind Caddy on one Ubuntu VM, set up by
`deploy/setup.sh` and updated by `deploy/update.sh`. What Azure adds is a
pipeline: anyone with write access to the repository runs the workflow
"Deploy to Azure" in the Actions tab, and a GitHub runner creates the VM
when it does not exist, delivers the code, the data release and the
settings, sets up or updates the server and checks the site. Nobody needs
a laptop with tools or keys for a deploy.

| File | What it does |
|---|---|
| [.github/workflows/deploy-azure.yml](../.github/workflows/deploy-azure.yml) | The pipeline, started by hand (section 4) |
| [deploy/azure/main.bicep](../deploy/azure/main.bicep) | The VM (Ubuntu 24.04, `Standard_B2ms`, 2 vCPU and 8 GB, 64 GB disk), a static IP with the free name `<label>.<region>.cloudapp.azure.com`, a firewall with 80 and 443 open |
| [deploy/azure/remote.sh](../deploy/azure/remote.sh) | Runs on the VM: `setup.sh` the first time, `update.sh` after that |
| [deploy/azure/bootstrap.sh](../deploy/azure/bootstrap.sh) | Once, by a subscription Owner: the link between Azure and GitHub (section 1) |

Why a VM and not Container Apps or App Service: the entries live in one
JSON file that exactly one process may write ([storage.md](storage.md)),
and a container platform starts the new revision before it stops the old
one, so two processes would share the file during every deploy. The
embedding model (PolDense, about 1.6 GB, gated) and the data release (not
in git) also stay simpler on a disk than in an image.

## What a run does

1. On a GitHub runner: `pnpm lint` and `pnpm typecheck`.
2. In the environment `production`: downloads the asset
   `data-X.Y.Z.zip` of the GitHub release `data-X.Y.Z`, logs in to Azure
   through OIDC (no stored password), and creates the VM from
   `main.bicep` when it does not exist (a stopped VM is started).
3. Opens SSH in the firewall for the runner's address only, pushes the
   commit the run was started on to the VM's repository with `git push`
   (the VM never holds GitHub credentials), copies the zip into
   `.local/bundles/` and writes `.env.server` from the environment's
   secrets.
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

Needs: Owner of the Azure subscription (the script assigns a role), and
for the automatic GitHub part an admin of the repository. No local
tools: in the Azure portal open Cloud Shell (the `>_` icon), choose Bash,
upload `deploy/azure/bootstrap.sh` (Manage files, Upload) and run:

```
gh auth login            # optional: then the script sets the GitHub side too
bash bootstrap.sh
```

When the subscription is not the one `az account show` names:
`az account set --subscription "<name or id>"` first. The defaults
(repository `bobrovsky420/hackyeah2026`, resource group
`hackyeah2026-rg` in `polandcentral`, VM `router`) change through
environment variables, for example
`AZURE_LOCATION=westeurope bash bootstrap.sh` when the subscription has no
quota in Poland Central; the list is at the top of the script. Running it
again is safe.

It creates the resource group, an app registration
`github-deploy-<owner>-<repo>` that GitHub Actions may log in as only
from the environment `production` of this repository, with Contributor
on this resource group only, and the SSH deploy key
`~/.ssh/deploy-router` in Cloud Shell. With `gh` logged in it creates the
environment and sets the variables and `VM_SSH_PRIVATE_KEY`; otherwise it
prints them.

## 2. The settings in GitHub

Repository Settings, Environments, `production` (the script creates it
with `gh`, else create it):

| Kind | Name | Value |
|---|---|---|
| variable | `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`, `AZURE_LOCATION`, `AZURE_VM_NAME`, `AZURE_DNS_LABEL` | printed or set by the script |
| variable | `DATA_RELEASE` | the data release, for example `0.0.6` |
| variable, optional | `AZURE_VM_SIZE` | default `Standard_B2ms`; `Standard_B2s` (4 GB) is the minimum |
| variable, optional | `DATA_REPO` | the repository with the data releases, default this one |
| secret | `VM_SSH_PRIVATE_KEY` | set or printed by the script |
| secret | `HF_TOKEN` | Hugging Face token: Bielik, and the gated PolDense model (Gemma terms accepted once with the token's account) |
| secret | `ANTHROPIC_API_KEY` | the fallback provider |
| secret | `ROPS_TOKEN` | the code of the ROPS panel; without it the panel stays locked |
| secret, optional | `SERVER_ENV_EXTRA` | more lines for `.env.server`, for example `REPLAY_ONLY=true` ([server.env.example](../deploy/server.env.example)) |

Advised before the event: add the team as required reviewers of the
environment, so that a run waits for an approval and nobody restarts the
app while the jury uses it.

## 3. Publish the data release

The data is not in git ([data-setup.md](data-setup.md)). The person who
made the release publishes its zip once: on GitHub, Releases, Draft a new
release, tag `data-X.Y.Z` (for example `data-0.0.6`), attach
`data-X.Y.Z.zip` from `.local/bundles/` (and its note as the
description), Publish. Then set `DATA_RELEASE` to `X.Y.Z`. A run whose
release is missing stops before it touches Azure, with the name of the
missing asset.

## 4. Deploy

Actions, "Deploy to Azure", Run workflow: pick the branch (normally
`main`), optionally a data release that overrides `DATA_RELEASE`, and
"Run the full server setup again" only after a change to `deploy/setup.sh`,
the services or the Caddyfile. The run's summary links the site; the
first run prints the site address (`https://<label>.<region>.cloudapp.azure.com`)
at the end of its log.

Roll back: run the workflow on the previous commit (a branch or tag that
points to it).

## 5. Look after it

The commands of [server-deploy.md](server-deploy.md), section 5, on the
VM. To get there without opening SSH: the VM's "Run command" page in the
portal (RunShellScript, runs as root), for example
`systemctl status app embedding caddy --no-pager` or
`journalctl -u app -n 100 --no-pager`. For an SSH session, open the port
for your address and use the key from Cloud Shell:

```
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
az ad app delete --id <AZURE_CLIENT_ID>
```

and delete the environment `production` in GitHub.
