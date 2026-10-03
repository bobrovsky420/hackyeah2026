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

## App

- The app in `src/` is Next.js 16 (App Router) with TypeScript, Tailwind
  CSS 4 and shadcn/ui-style components. Next.js 16 differs from older
  versions: read the guide in `node_modules/next/dist/docs/` before changing
  framework code. `next.config.ts` sets `agentRules: false`, so `next dev`
  never writes into this file.
- Commands, from the repository root with the pnpm version pinned in
  `package.json`: `npx pnpm@12.6.0 install`, `npx pnpm@12.6.0 dev`
  (http://localhost:3000), `npx pnpm@12.6.0 lint`,
  `npx pnpm@12.6.0 typecheck` and `npx pnpm@12.6.0 build`. Lint and
  typecheck pass before a commit is proposed.
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
- The data is mocked in `src/lib/mock/`: canned routes in the shape of
  schema 8.4 (types in `src/lib/contracts/`) and fixtures extracted from
  `data/`; `/api/droga` stands in for the pipeline. Innovation text is
  shown only for CC BY 4.0 records, always with the attribution line and
  the prototype note of FR-1.8.
- The forms post to route handlers under `src/app/api/`, which keep the
  entries in the in-memory store of `src/lib/server/store.ts`; a restart
  empties it. The real app replaces that module with PostgreSQL behind the
  same functions.
- The ROPS console (`/rops`, S7) asks for the access code in `ROPS_TOKEN`;
  without it the prototype's code is `rops-prototyp`, so set a real one on
  any shared server. `ROPS_REVIEWER` names the reviewer in the action log.
- Console forms submit through `submitTo` in
  `src/components/console/submit.ts`, not `<form action>`: React resets a
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
