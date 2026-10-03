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
  repository root; packages are pinned in `requirements.txt`.
- The catalogue data flows raw snapshot (`.local/raw/`) to
  `.local/pipeline/sources/` (parser) to `.local/pipeline/derived/`
  (extraction workers) to `data/innovations/` (build). `data/` holds only
  what the app serves; `.local/` is machine-local. The contract is
  [docs/innovation-record.md](docs/innovation-record.md); the referee is
  `scripts/derive-records.py`; the extraction runs through the skill
  `/extract-innovations`. Do not edit a folder another step owns.

## Commit messages

- After every bigger change, propose a one-line commit message in the final
  response. If earlier changes are still uncommitted, the message covers
  them as well as the new change.
- Follow the style of the most recent commits of this repository.
- Never add a `Co-Authored-By` trailer or any other attribution to Claude or
  Anthropic.
