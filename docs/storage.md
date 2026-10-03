# Storage

How the app keeps its entries: the needs, contact requests, readiness
registrations, idea cards (7.13), evaluations of innovations (7.14),
routes, feedback, content reports, the moderation and
screening logs, the counters, the conversations, mentors and partnership
posts of 7.15, and the knowledge the ROPS panel keeps (its
knowledge items and its word on innovations). The ROPS panel (7.9) reads
and decides the statuses and moderation fields and writes the
moderation log. Decided: no database in any
installation. The entries live in the server's memory
and are saved to one JSON file, so they survive a restart and a redeploy,
and a fresh clone runs with nothing to set up.

Commands are from the repository root; `pnpm` stands for `npx pnpm@12.6.0`.

## What is stored where

The store is `src/server/db/`: one async interface (`repository.ts`), the
memory implementation (`memory.ts`) and the file around it (`file.ts`).
`index.ts` opens it once per process; pages, route handlers and server
actions call `repository()`, client components never do.

- The file is `.local/store/records.json` (git-ignored), or the path in
  `STORE_FILE`, relative to the repository root. `STORE_FILE=memory`
  keeps the entries in memory only, gone with the process: a throwaway
  server, the Playwright server (`playwright.config.ts`) and the pipeline
  scripts (`pnpm eval`, `pnpm cache:warm`) run so.
- The file holds the whole store as JSON (`version`, `saved_at`, `pid`,
  `state`), in the shapes of section 8 of the specification. It is loaded
  when the server starts and written after every change: the changes of
  one request go out as one write, whole to a temporary name and then
  renamed into place, so a reader never sees half a file. When the
  process exits, a pending write is made synchronously.
- A fresh store (no file) starts with the example entries of
  `examples.ts`: three needs (the first approved for publication, so a
  route about lonely seniors shows it as a similar case, FR-3.9), the two consented and verified team
  entries of the readiness registry (FR-6.5) and one idea card with its
  similar innovations (`pm-przyklad-1`, the stable address of the screen
  checks), and for 7.15 two mentors, two conversations whose keys are
  public on purpose (`EXAMPLE_THREAD_KEYS`) and one approved partnership
  post; all marked as examples. A conversation stores only the hashes of
  its keys, never a key.
- A list added in a later version (the idea cards, the evaluations, the
  panel's knowledge items and its word on innovations, the conversations,
  mentors and partnership posts) is optional in the
  file: a file saved before it opens with the list empty instead of
  being set aside as unreadable. A field added later gets its default
  when the file opens (an idea card's status "nowy" and reply null, an
  evaluation's `forwarded_at` null); an idea card's `canvas` is optional
  and present only on a card sent as a CANVAS application.
- Beside the file: `records.json.bak`, a copy taken every time the server
  starts (the recovery point of that start), and, after a file that could
  not be read, `records.json.unreadable-<time>`, which the server sets
  aside before starting afresh. A file written by a newer version of the
  app stops the server instead. Names `records.json.<pid>.<n>.tmp` are
  writes that did not finish; the server removes them at start.
- The line `[store] .local/store/records.json: 3 needs, 2 readiness, 0
  routes` in the server's log names the file it opened.

Never in the file, in the server's memory only (`src/server/ephemeral.ts`):
the rate limiter's request times per client address (12.5 and FR-10.2
allow IP addresses nowhere else) and the gate's repeat and abuse memory
(FR-12.1, FR-6.4, FR-12.14), hashed or per identity for an hour or a day.
A restart resets those limits.

## One process per file

Two processes on one file overwrite each other's saves, each with its
whole state: the last to write wins and the other's entries are lost. So
one server per file: a second server on the same machine runs with
`STORE_FILE=memory` or its own path, and a server that Playwright reuses
on port 3100 needs `STORE_FILE=memory` like its other variables.

## Retention

The periods of 12.6 are applied by the server itself, when the
store opens and once a day after that (`src/server/retention.ts`):

- routes, with their feedback: from 4 November 2026 (30 days after the
  event) every route created before that day; `RETENTION_ROUTES_UNTIL`
  (YYYY-MM-DD) moves the day, and a value that is not a date is reported
  and ignored;
- contact requests: 90 days after they were sent;
- readiness registrations, idea cards, evaluations, partnership posts
  and conversations: after their `retention_until`, which a new message
  of a conversation moves 12 months on
  (12 months after they were sent);
- the screening log: entries after 14 days, kept texts after seven days,
  also on every write of the log.

Needs stay until ROPS decides; the moderation log and the content reports
are kept. What a run removed is logged as `[store] retention removed ...`.

## Personal data

The file holds what the forms collected: names, e-mail addresses and
phone numbers of contact requests, registrations, idea cards and test
sign-ups, the names and optional e-mail addresses of conversations and
partnership posts, the texts of needs, ideas, evaluations and
conversations,
and for seven days the texts the gate declined (FR-12.7). Treat it like
the database it replaces: never commit it, never put it in a data bundle
(`pack-data.py` leaves `.local/store/` alone), and mind where it lies. On
a developer's laptop the repository, `.local/` included, may sit in a
OneDrive folder, which syncs the file to the cloud and to that person's
other machines; a deployment keeps it on the server's disk only.

## Reset

Stop the server, delete `.local/store/records.json` (and its `.bak` when
the old entries must go for good), start again: the store starts with the
examples.

## Demonstration data (decision R.6)

When `data/built/` holds `demo-questions.yaml`, `demo-records.yaml` and
`demo-routes.json`, a fresh store file starts with the examples and a
simulated twelve-week pilot for the ROPS panel (`src/server/db/demo.ts`):
about 250 questions with their routes, 80 needs, 45 idea cards, 109
evaluations, 40 contact requests, 25 readiness registrations, mentors,
partnership posts, conversations, content reports and the moderation log
of their decisions. There is no variable: the files are the switch. A
seeded generator draws the dates, counted back from the start of the
server, and the decisions. Every such record has `demo: true`: the panel
marks it and says so on every page, its trends can leave it out, and the
public pages and the route never show it.

- The questions and texts are edited in `data/curated/demo-questions.yaml`
  and `data/curated/demo-records.yaml` (committed). `pnpm demo:routes`
  computes the routes of new questions into `data/built/demo-routes.json`
  and copies the two files beside it; after an edit of a text, run it
  again (nothing new to compute, no model call). The three built files
  travel in the data bundle.
- The data acts on a fresh store file only: to switch it on or off, stop
  the server, run `pnpm demo:routes` or delete the three `data/built/demo-*`
  files, delete `.local/store/records.json` (keep a copy if it holds real
  entries) and start again. The dates follow the start, so a reset the
  day before a demo keeps the twelve weeks current.
- A memory store (`STORE_FILE=memory`: the Playwright server, the
  scripts) never gets it.
- Entries made while the server runs (a question the jury asks live) are
  real and count beside the simulated ones; "Tylko prawdziwe wpisy" in
  the trends shows them alone.
- When only some of the three files are there, the start logs which one
  is missing (`[store] ... is missing`) and the store starts with the
  examples only.

## Tests

`pnpm test` runs the contract suite of `tests/unit/db/` against the memory
repository and against the file repository, on temporary files outside
the repository; under Vitest the app's own `repository()` always uses
memory. The Playwright journeys run their server with `STORE_FILE=memory`,
so every run starts from the examples and never touches this machine's
store.

## Deployment (12.9, Analyst 2)

- The file must sit on a disk that outlives the process. On the server
  of [server-deploy.md](server-deploy.md) it is
  `.local/store/records.json` of the checkout, which survives a restart,
  an update and a rebuild. A host without a persistent disk (an ephemeral
  file system) needs a mounted volume for `.local/store/`, or every
  restart starts from the examples.
- One app process per file (above). Nothing to migrate on a deploy: the
  app reads the file it finds. A file of a newer format stops an older
  version of the app, so roll forward rather than back.
- The "database dump" of 12.4 and 13.5 is a copy of the file, taken while
  the server is stopped; the `.bak` of a start is one.
