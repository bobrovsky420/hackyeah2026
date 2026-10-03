# The server: the app on AWS

For the person who runs the public demo (Analyst 2, specification 12.9).
The app and the embedding service run as two systemd services on one
Ubuntu server on AWS Lightsail, straight from a checkout, with Caddy in
front for TLS. The files are in [deploy/](../deploy/).

## What runs

| Service | What it is | Where |
|---|---|---|
| `caddy` | TLS for the site address, forwards to the app | ports 80 and 443, `/etc/caddy/Caddyfile` from [deploy/Caddyfile](../deploy/Caddyfile) |
| `app` | `next start` over the build in `.next` | 127.0.0.1:3000, [deploy/app.service](../deploy/app.service) |
| `embedding` | `scripts/embedding-service.py` in `.venv-embedding` (FR-3.7) | 127.0.0.1:8765, the app's default `EMBEDDING_URL`, [deploy/embedding.service](../deploy/embedding.service) |

The data release is unpacked into the checkout (`data/`,
`.local/route-cache/`, `.local/llm-replay/`) by `scripts/get-data.py`
and built into the app, so a new release is a rebuild. The entries live
in `.local/store/records.json` of the checkout ([storage.md](storage.md))
and survive a restart and an update. When the embedding service is down,
the app answers with the lexical fallback (7.3), so a restart of the
embedding service is never an outage.

## 1. Create the server

In the Lightsail console (https://lightsail.aws.amazon.com):

1. Create instance: platform Linux, blueprint "OS Only", Ubuntu 24.04
   LTS, the 4 GB plan or larger (the embedding service needs up to 2 GB
   under load, and the build needs memory too; the setup adds 2 GB of
   swap). Use a plan with x86, not Arm.
2. Networking: create a static IP and attach it to the instance; in the
   IPv4 firewall, add HTTPS (443) beside the SSH (22) and HTTP (80) rules
   already there.
3. The site address: a DNS `A` record of the team's domain pointing to
   the static IP, or, without a domain, the free name
   `<ip-with-dashes>.sslip.io` (for 3.120.45.67: `3-120-45-67.sslip.io`),
   which Caddy gets a real certificate for as well.

Connect with the browser SSH of the console, or download the key
from the account page and use `ssh -i key.pem ubuntu@<static ip>`.

## 2. Get the checkout, the data and the settings onto the server

The repository is private: create a deploy key on the server and add it
read-only on GitHub (repository Settings, Deploy keys):

```
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
git clone git@github.com:bobrovsky420/hackyeah2026.git
cd hackyeah2026
mkdir -p .local/bundles
```

The data release: copy the zip from a laptop that has it (from the
repository root there):

```
scp -i key.pem .local/bundles/data-0.0.2.zip ubuntu@<static ip>:hackyeah2026/.local/bundles/
```

Instead of the copy, `GITHUB_TOKEN` in `.env.server` lets `get-data.py` download the
GitHub release `data-X.Y.Z`.

The settings: `cp deploy/server.env.example .env.server`, then fill in
`.env.server` (`nano .env.server`): `DATA_RELEASE`, `HF_TOKEN` (for Bielik
and for the first download of the gated PolDense model: accept the Gemma
terms once on the model page with the token's account),
`ANTHROPIC_API_KEY`, `ROPS_TOKEN` and `ROPS_REVIEWER`. The file is
git-ignored and readable by the owner only; the setup checks that.

## 3. Set up and start

```
bash deploy/setup.sh <site address>
```

It installs Node 24, pnpm, Caddy and uv; creates `.venv-embedding` with
Python 3.14, CPU torch and `requirements-embedding.txt`; downloads the
model; installs the two services and the Caddyfile; then runs the first
update (next section). The first run takes 10 to 15 minutes. It ends
with the answer of `/api/health`; then open `https://<site address>`.
Running it again is safe, for example after a failed step.

## 4. Update

After a push to `main`, or with a new `DATA_RELEASE` in `.env.server`
(and its zip in `.local/bundles/`):

```
bash deploy/update.sh
```

It pulls, installs the data release (`get-data.py --prune` does nothing
when the release is already there), installs the packages, stops the
app, builds, restarts the embedding service when the vectors changed,
starts the app and waits for `/api/health`. The app is down during the
build, about two minutes: never update while the jury is using the
app.

Roll back: `git checkout <previous commit>`, then
`bash deploy/update.sh --no-pull`; back on the branch with
`git checkout main`.

## 5. Look after it

```
systemctl status app embedding caddy
journalctl -u app -f                 # the log line [route] ... retrieve:embedding-service shows the service is used
journalctl -u embedding -n 50
curl -s http://127.0.0.1:3000/api/health
curl -s http://127.0.0.1:8765/health
sudo systemctl restart app           # after a change to .env.server
```

- A copy of the store: `scp -i key.pem
  ubuntu@<static ip>:hackyeah2026/.local/store/records.json .`; it holds
  personal data (12.6), so it stays on team machines.
- Before the demo, take a Lightsail snapshot of the instance: a broken
  server is back in minutes from it.
- Cost: the Lightsail plan and the static IP (free while attached);
  delete the instance and release the static IP after the event.
