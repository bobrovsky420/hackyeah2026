# Repository instructions

Instructions for every AI assistant working in this repository. The
challenge, the team and the decisions made so far are in
[docs/challenge-selection.md](docs/challenge-selection.md).

## Writing conventions

- Never use en dashes (U+2013) or em dashes (U+2014) in documents: Markdown
  files, README files, docs pages, notes and commit messages. Write the
  ASCII hyphen-minus (`-`) instead.
- Exception: presentations and printable documents for users may use the en
  dash, always with a space on both sides (space, U+2013, space). Never an
  em dash, and never an en dash without the spaces.

## Data pipeline

- Every Python command runs with `.venv/Scripts/python` from the
  repository root; packages are pinned in `requirements.txt`. The three
  embedding scripts (`embedding-probe.py`, `build-index-vectors.py`,
  `embedding-service.py`) run with `.venv-embedding/Scripts/python`,
  pinned in `requirements-embedding.txt`.
- The catalogue data flows raw snapshot (`.local/raw/`) to
  `.local/pipeline/sources/` (parser) to `.local/pipeline/derived/`
  (extraction workers) to `data/innovations/` (build). `data/` holds only
  what the app serves; `.local/` is machine-local. The contract is
  [docs/innovation-record.md](docs/innovation-record.md); the referee is
  `scripts/derive-records.py`; the extraction runs through the skill
  `/extract-innovations`. Do not edit a folder another step owns.
- The static reference data flows `scripts/fetch-static-data.py`
  (downloads into `.local/`) to `scripts/build-static-data.py` (builds
  `data/places/`, `data/map/` and `data/indicators.json`). Build outputs
  are git-ignored; `data/taxonomies.json`, `data/duplicates-decisions.json`,
  `data/advisors.yaml` and `data/implementations.yaml` are hand-written and
  committed.
- A data release for another machine is
  `.venv/Scripts/python scripts/pack-data.py --release X.Y.Z` (with
  `--rebuild` after the records changed), which writes
  `.local/bundles/data-X.Y.Z.zip` and its note; `scripts/unpack-data.py <zip>`
  restores it and never touches the files git tracks
  ([docs/data-setup.md](docs/data-setup.md)).

## App

- The app in `src/` is Next.js 16 (App Router) with TypeScript, Tailwind
  CSS 4 and shadcn/ui-style components. Next.js 16 differs from older
  versions: read the guide in `node_modules/next/dist/docs/` before changing
  framework code. `next.config.ts` sets `agentRules: false`, so `next dev`
  never writes into this file.
- Folders and files have English names everywhere, `src/app/` included
  ("gmina" counts as the English term, as in the specification).
  Only the URL a reader sees is Polish: `src/lib/page-routes.ts` maps each
  page folder to its Polish URL, and `next.config.ts` rewrites the Polish
  URL to the folder and redirects the folder's path to the Polish URL.
  Links and tests use the Polish URLs; a new page gets a row there. The
  API is English on disk and in the URL (specification 9.2).
- Commands, from the repository root with the pnpm version pinned in
  `package.json`: `npx pnpm@12.6.0 install`, `npx pnpm@12.6.0 dev`
  (http://localhost:3000), `npx pnpm@12.6.0 lint`,
  `npx pnpm@12.6.0 typecheck` and `npx pnpm@12.6.0 build`. Lint and
  typecheck pass before a commit is proposed. A fresh clone follows
  [docs/quick-start.md](docs/quick-start.md).
- Tests (Playwright, in `tests/e2e/`): `npx pnpm@12.6.0 test:e2e` runs the
  journeys, `npx pnpm@12.6.0 a11y` runs axe on every screen in the three
  themes (zero critical or serious findings, and 7:1 text), and
  `npx pnpm@12.6.0 screenshots` writes every screen at 360 px, 1280 px and
  the projector size to `.local/screenshots/`. Each run builds the app and
  serves it on port 3100 unless a server already listens there (then it is
  reused, so stop an old one first). Locally the browser is Edge. After a
  change to a screen, `test:e2e` and `a11y` pass too.
- Every user-visible string lives in `messages/pl.json` under
  `<screen>.<element>` keys and is read with `t()` from `src/lib/i18n.ts`;
  no Polish text in components (specification, section 11).
- Colours, type and radii come from the tokens in `src/app/globals.css`
  (OP-15); components use the token utilities such as `bg-primary` or
  `text-muted-foreground`, never raw hex values. Text reaches 7:1 against
  its background, controls are at least 44 px high, focus is the 3 px ring
  of the tokens (specification 12.2).
- Forms and the innovation details are pages, never dialogs or side
  panels; single choices are native radios in tiles
  (`src/components/ui/choice.tsx`), never chips.
- No cookies, except the access-code cookie of the ROPS console: the view
  settings and the intake draft live in the browser under the keys of
  `src/lib/storage-keys.ts`; the inline script in `src/app/layout.tsx`
  applies the view settings before the first paint.
- The app reads `data/` through one server-only facade,
  `src/lib/catalogue.ts`; when `data/` is missing or fails the loader's
  checks it falls back to the committed fixtures in `src/lib/mock/`, so a
  fresh clone runs (`DATA_SOURCE=data|mock` forces one). Client components
  get what they need as props, never from the facade. Innovation text is
  always shown with the attribution line and the prototype note of FR-1.8;
  the MIIS items like every ROPS item (decided 29 September 2026), their
  licence named by its terms.
- The backend lives in `src/server/`: the gate (`gate/`, 7.12), the
  matcher (`match/`, 7.3), the composer (`route/`, 7.4), the needs bank
  (`needs/`, 7.5) and `pipeline.ts`, which runs them with the replay cache
  of FR-3.5 (`route-cache.ts`, files in `.local/route-cache/`). The modules
  meet only through the types of `src/server/contracts.ts` and receive the
  model as an `Llm` function, so their Vitest tests
  (`npx pnpm@12.6.0 test`, in `tests/unit/`) never reach the network. The
  model adapter is `src/lib/llm/` (9.3: Bielik, then Anthropic, then Llama,
  then the per-call recording in `.local/llm-replay/`), configured through
  `src/lib/env.ts`, which also reads `.env.dev` outside production. The
  prompts are `prompts/<task>.md` with a `version` in the front matter.
  `/api/routes` runs the pipeline when the real data and a model are
  there; `ROUTE_ENGINE=canned` forces the prototype's keyword stand-in
  (`src/lib/mock/scenarios.ts`, canned routes in `src/lib/mock/routes.ts`),
  which the Playwright journeys use. The retriever needs the embedding
  service (`.venv-embedding/Scripts/python scripts/embedding-service.py`)
  and falls back to a lexical scorer without it. `npx pnpm@12.6.0 eval`
  runs the test problems of 13.1 and writes `reports/`;
  `npx pnpm@12.6.0 cache:warm` fills the replay cache for the demo. The
  route limit is `RATE_LIMIT_ROUTES_PER_MINUTE` (default 10).
- The map (S4) runs MapLibre GL 6 on the local GeoJSON only; its worker
  files are served from the installed package by
  `src/app/vendor/maplibre/`. The map's class colours stay the same in
  every theme, like an image, and are the only raw colours in components;
  the legend and the table carry the same values.
- The forms post to route handlers under `src/app/api/`, which keep the
  entries through the async repository of `src/server/db/`
  (`repository()`): the server's memory, saved to one JSON file
  (`.local/store/records.json`, or `STORE_FILE`) after every change and
  loaded at start, so a restart keeps them; `STORE_FILE=memory` keeps
  them in memory only (the Playwright server, the pipeline scripts).
  There is no database (decided 29 September 2026), and one process per
  file. Only server code calls it; the composer gets the readiness
  registry as a dependency. The rate limiter's and the gate's short-lived
  memory stay in `src/lib/server/store.ts`, never in the file. Retention
  runs inside the server. Details, reset and deployment are in
  [docs/storage.md](docs/storage.md).
- The ROPS console (`/rops`, S7) asks for the access code in `ROPS_TOKEN`.
  Without it, `next dev` accepts the prototype's code `rops-prototyp` and a
  production server keeps the console locked. The Playwright config starts
  its server with that code, the canned route engine, an empty replay
  recording for the gate (no model calls), the store in memory and high
  limits; a server it reuses needs the same variables, listed in
  `playwright.config.ts`.
  `ROPS_REVIEWER` names the reviewer in the action log.
- Console forms submit through `submitTo` in
  `src/components/forms/submit.ts`, not `<form action>`: React resets a
  form after its action, and the reset puts even a controlled select back
  on its first option.
- The React Compiler lint rules apply: no writes to `document` inside a
  component body (use a module-level helper), and hooks that return refs
  are destructured.

## Commit messages

- After every bigger change, propose a one-line commit message in the final
  response. If earlier changes are still uncommitted, the message covers
  them as well as the new change.
- Follow the style of the most recent commits of this repository.
- Never add a `Co-Authored-By` trailer or any other attribution to Claude or
  Anthropic.
