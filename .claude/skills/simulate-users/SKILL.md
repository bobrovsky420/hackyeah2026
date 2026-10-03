---
name: simulate-users
description: Generate simulated users (personas with needs written in Polish, a place, a role and a browsing behaviour), or import them from the user's .txt or .md file of requests, and play them through the real app in a browser with scripts/simulate-users.ts, so the request log (docs/request-log.md) fills with traced, synthetic traffic for a demo, a test or the log analysis. Use when the user asks to simulate users, generate demo or test traffic, play personas or a file of requests, or fill the logs for analysis. Not for the evaluation set in tests/problems/ (that is pnpm eval).
---

# Simulate users: the coordinator playbook

The mechanism has three steps, each of which can run on its own:

1. **Generate or import**: write `.local/simulation/<run>/requests.yaml`
   by the rules of [personas.md](personas.md), or from the user's text
   file by [import.md](import.md), and check it.
2. **Play**: `npx pnpm@12.6.0 simulate --run <run>` drives the real UI
   of the developer's `next dev` on http://localhost:3000 in a browser for
   each persona and writes `.local/simulation/<run>/results.jsonl`.
3. **Read**: the server's request log of the run is in the dev server's
   `LOG_DIR` (`.local/logs/events-YYYY-MM-DD.jsonl` with the `.env.dev`
   of this repository), every line with `synthetic: true`, `run_id` and
   `persona`.

Rules:

- Nothing here touches `tests/problems/` or `data/`. The run plays
  against the dev server on port 3000 by the user's choice, so its
  routes, votes and saved needs go into the main store
  (`.local/store/records.json`) next to real entries; only the request
  log marks them synthetic. When the user wants them apart, add
  `--serve`: the runner then builds and serves the app on port 3300 with
  its own store (`.local/simulation/store.json`) and log
  (`.local/simulation/logs/`).
- Every live route costs model tokens (Bielik on the Hugging Face router,
  about 0.40 USD per million tokens). Before step 2, show the user the
  table of personas and the number of routes it will create (a clarified
  or recomputed route counts twice), and wait for the go-ahead.
- The texts you write are fiction written for this run. No real
  person's name, phone, e-mail or address; no text copied from
  `tests/problems/` or from a catalogue record. Imported texts are the
  user's and stay word for word (import.md says what to report).
- Stage nothing and commit nothing; the run folder is git-ignored.

## 0. Set up

- The run id: `sim-<today, YYYY-MM-DD>-<a, b, c...>`, the next free letter
  under `.local/simulation/`. The argument of the skill may give the
  number of personas (default 10), a theme ("only rural gminas", "the
  partial cases"), the pace (`demo` for a visible, slow run) or a path to
  a `.txt` or `.md` file of requests (then import, step 1b; the number of
  personas is the number of requests in the file unless the user limits
  it).
- Check that the live engine can run, without printing any value:
  - the embedding service answers:
    `curl -s -m 3 http://127.0.0.1:8765/health` (otherwise ask the user
    to start it: `npx pnpm@12.6.0 embeddings`, or the retriever falls
    back to lexical ranking and the run says so in its notes);
  - `.env.dev` names `HF_TOKEN` or `OPENAI_COMPAT_API_KEY` (names only:
    `sed -E 's/=.*//' .env.dev`);
  - the dev server answers: `curl -s http://localhost:3000/api/health`
    (otherwise ask the user to start it: `npx pnpm@12.6.0 dev`, or
    `dev:embeddings` for both);
  - `.env.dev` names `LOG_DIR` and `PAGE_EVENTS` (names only), and the
    dev server was started after they were added; otherwise the run has
    no log file and no page events;
  - with `--serve` only: port 3300 is free and no Playwright run
    (`test:e2e`, `a11y`) builds at the same time, because `--serve` runs
    `next build` into `.next/`.

## 1. Generate or import

**1a. Generate.** Read [personas.md](personas.md) and write the personas
yourself (no subagent: the set is small and must be balanced as a whole).

**1b. Import.** When the user gives a file, read the whole file, then
[import.md](import.md) and [personas.md](personas.md), and turn every
request into a persona yourself. The file may also be mixed with
generation ("my five requests plus five of yours").

Then, either way:

```
npx pnpm@12.6.0 simulate --run <run> --check
```

Fix every problem it lists. Show the user a table: id, intent, role,
gmina, the first sentence of the text, and the behaviour in a few words;
for an import, also mark which fields came from the file and which you
inferred, and list what import.md asks you to report.

## 2. Play

After the user's go-ahead:

```
npx pnpm@12.6.0 simulate --run <run>
```

Run it in the background; a persona takes about 40 to 90 s at the normal
pace (a live route alone takes 35 to 60 s), and the first one longer while
`next dev` compiles the pages. Options: `--pace fast` (no waiting, for a quick test),
`--pace demo --headed` (typing letter by letter in a visible browser, for
a demo), `--parallel 2` (two personas at once), `--only D01,D04`,
`--base-url <url>` (another running server), `--serve` (its own build,
store and log on port 3300, see the rules) with `--no-build` (reuse the
last build). The dev server's route limit is 10 a minute per address:
keep `--parallel` at 1 or 2 against it.

A persona that fails gets a screenshot in `<run>/errors/` and the run goes
on; the exit code is 1 when any failed.

## 3. Report

From `results.jsonl` and the request log of the run (filter the JSONL
lines on `run_id`), tell the user in a few lines:

- personas finished and failed, with the error of each failure;
- the modes against the intents (a `route` intent that ended in `none`
  is a finding, not a failure of the run);
- the median and the slowest wait for a route, and the cost from the
  `route_completed` lines;
- where the log is, for the analysis.

Write the same to `.local/simulation/<run>/notes.md`.
