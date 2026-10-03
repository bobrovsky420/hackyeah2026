# Database

How the app keeps its entries, and how to run it on PostgreSQL locally.
PostgreSQL 16 with Drizzle (specification
9.1), and the in-memory store stays as the fallback, so a fresh clone and
the Playwright journeys run without a database.

Commands are for Windows (Git Bash or PowerShell) from the repository root
with Docker Desktop running; `pnpm` stands for `npx pnpm@12.6.0`.

## What is stored where

The repository of `src/server/db/` is one async interface
(`repository.ts`) with two implementations. `src/server/db/index.ts` picks
PostgreSQL (`postgres.ts`) when `DATABASE_URL` is set and the server's
memory (`memory.ts`) otherwise; a restart empties the memory. Pages, route
handlers and server actions call `repository()`; client components never
do.

| Table | What (specification) | Columns besides jsonb |
|---|---|---|
| `routes` | Routes for the permalink (8.4); the whole route as jsonb; a `redirected` route without the reader's text (FR-2.5) | `id`, `created_at`, `mode`, `place_terc`, `decline_reviewed_at` (the declined-texts review, FR-12.8) |
| `needs` | The needs bank (8.5) | status, moderation, gmina, target groups (text array), consents, dates, `example` |
| `contact_requests` | Contact requests (8.6, FR-6.4) | status, moderation, target, dates |
| `readiness` | The readiness registry (8.6, FR-6.5) | verification, gmina, topics, `retention_until`, `example` |
| `feedback` | "Czy ta droga pomaga?" (FR-10.1) | route id, value, date |
| `content_reports` | "Zgłoś problem z tą treścią" (8.11) | target, reason, moderation |
| `moderation_log` | Every console action with the reviewer (FR-12.8) | all |
| `screening_log` | The gate's log (FR-12.7): no identity; the text only for `declined` and spam, seven days; entries 14 days (12.6); `ref` (the route a text belongs to) and `reviewed_at` for the declined-texts review (FR-12.8) | all |
| `generated_briefs` | Needs whose brief was generated once (FR-10.2) | all |
| `event_counters` | The counters of FR-10.2 | name, count, since |

Never written to the database, in memory in both cases
(`src/lib/server/store.ts`): the rate limiter's request times per client
address (12.5 and FR-10.2 allow IP addresses nowhere else), and the gate's
repeat and abuse memory (FR-12.1, FR-6.4, FR-12.14), hashed or per
identity for an hour or a day. A restart resets those limits; with one app
container that is acceptable.

The retention of the screening log is applied on every write and read of
the log. The other retention defaults of 12.6 (OP-18) run as a job, once a
day on the host (for example from cron), with `pnpm retention`
(`scripts/retention.ts`, the rules in `src/server/retention.ts`):

- routes, with their feedback: from 4 November 2026 (30 days after the
  event) every route created before that day; `--routes-until=YYYY-MM-DD`
  or `RETENTION_ROUTES_UNTIL` moves the day;
- contact requests: 90 days after they were sent;
- readiness registrations: after their `retention_until`;
- the screening log: entries after 14 days, kept texts after seven days.

Needs stay until ROPS decides; the moderation log and the content reports
are kept. `pnpm retention --dry-run` prints the counts and deletes
nothing. The job reads `DATABASE_URL` like `pnpm seed`.

## First start

1. Put a password for the local database into `.env.dev` (git-ignored),
   any long random string:

   ```
   POSTGRES_PASSWORD=<random>
   ```

2. Start the database, apply the migrations and load the examples:

   ```
   pnpm db:up
   pnpm db:migrate
   pnpm seed
   ```

   `db:up` runs `docker compose --env-file .env.dev up -d --wait db`: the
   image `pgvector/pgvector:pg16` (pgvector installed, unused unless
   FR-3.7 is switched on) on `127.0.0.1:5432` with the named volume
   `db-data`. On an empty volume it also creates the database
   `hubmi_test` for the tests. `POSTGRES_PORT` in `.env.dev` moves the
   port.

   `db:migrate` and `seed` read `DATABASE_URL` from the environment or
   `.env.dev`; without it they use the local database above with
   `POSTGRES_PASSWORD`. Both are idempotent. The seed adds the three
   example needs and the two consented and verified team entries of the
   readiness registry (FR-6.5), all marked "Przykład"; an entry that
   exists already is left alone.

3. Run the app on the database: set `DATABASE_URL` in `.env.dev` (the
   line is there, commented out) and start `pnpm dev`:

   ```
   DATABASE_URL=postgres://hubmi:<password>@localhost:5432/hubmi
   ```

   Without `DATABASE_URL` the app keeps everything in memory, as before.
   Scripts that run the pipeline (`pnpm eval`, `pnpm cache:warm`) read
   `.env.dev` too, so with the line active they need the database
   running.

## Change the schema

Edit `src/server/db/schema.ts`, then

```
pnpm db:generate
pnpm db:migrate
```

`db:generate` (drizzle-kit) writes a new SQL file and its snapshot into
`src/server/db/migrations/`; commit both with the schema change. Never
edit an applied migration; add a new one. Map the new columns in both
repositories and cover them in the contract tests.

## Tests

`pnpm test` runs the contract suite of `tests/unit/db/` against memory
always. Against PostgreSQL it runs when `DATABASE_URL_TEST` is set in the
environment (not only in `.env.dev`, so the suite never reaches a database
by accident). It migrates that database and empties every table before
each test, so point it at `hubmi_test`, never at the development database:

```
DATABASE_URL_TEST=postgres://hubmi:<password>@localhost:5432/hubmi_test npx vitest run tests/unit/db
```

The other unit tests and the Playwright journeys always run on memory.

## Reset, stop, remove

```
docker compose --env-file .env.dev stop db          # stop, keep the data
docker compose --env-file .env.dev down -v          # remove the container and the volume: every entry is gone
pnpm db:up && pnpm db:migrate && pnpm seed          # start again from empty
```

## Deployment (12.9, Analyst 2)

- Set `DATABASE_URL` for the app container; without it the deployed app
  silently keeps everything in memory.
- Run `pnpm db:migrate` before the app starts on every deploy (it is
  idempotent), and `pnpm seed` once. Both need `tsx` and the folder
  `src/server/db/migrations/` in the image, or a separate migrate step
  with the repository checked out.
- The connection pool of the app holds up to 10 connections.
