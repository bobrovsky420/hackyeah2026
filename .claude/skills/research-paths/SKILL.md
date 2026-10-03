---
name: research-paths
description: Re-verify, refresh or recreate the legal and funding paths in data/built/paths/ (the "ścieżka wdrożenia" block of the route), or draft a new path, from their primary sources - save copies of the acts and call pages, draft the YAML with a verbatim quote for every fact, validate with scripts/check-paths.py and scripts/check-evidence.py, have a second agent check the drafts, and report the changes for approval before anything in data/built/paths/ changes; the research files stay in .local/paths-research/. Use when the user asks to check, update, refresh, recreate or add a path, or to re-verify the paths before a demo.
---

# Research paths: the coordinator playbook

The 30 files of `data/built/paths/` (the live paths the app reads) were
drafted by an AI assistant from the facts in
section 14.4 of
[docs/functional-specification.md](../../../docs/functional-specification.md),
without legal review (decision P.8), and re-researched with this skill.
They are not in git: they travel in the data bundle. The
research files behind them stay in `.local/`. The
per-path instructions are [worker.md](worker.md); the referees are
`scripts/check-paths.py` (the drafts) and `scripts/check-evidence.py` (the
evidence: quotes found in the saved copies, every field covered, issuer
against subject, applicant types, the changes table); the sources are
saved and indexed by `scripts/fetch-sources.py`; the report is built by
`scripts/build-paths-report.py`.

Rules:

- Nothing in `data/built/paths/` or in the specification changes before
  the user approves the report (step 4). Drafts live in the run folder.
- `data/` holds only what the app reads: the live path files. Every
  research file (saved sources, index, evidence, drafts, checks, hints,
  report, notes) lives in the run folder under `.local/paths-research/`.
- No fact without a verbatim quote from a saved copy. A fact that rests
  on a search snippet or on memory is "not verified".
- `reviewer` stays `null` and the prototype note stays: this is research,
  not legal review.
- Never rename or delete a path id; the app and `tests/problems/` refer to
  the ids.
- Every Python command runs with `.venv/Scripts/python` from the
  repository root. Stage nothing; other sessions may edit the repository
  at the same time.
- Workers and fixers write only inside `<run>/<id>/` and
  `<run>/drafts/<id>.yaml`; subagents may not write summary or report
  files. The coordinator writes only `<run>/checks/<batch>.md`,
  `<run>/report.md` (through the script, plus two hand-written sections),
  `<run>/hints.md` (through the script) and `<run>/run-notes.md`.
- A hint the coordinator passes on is labelled "unverified". The
  coordinator never states a legal mapping itself: the table "Applicant
  types" in worker.md is the only mapping.
- `timing.kind` follows the rule in worker.md step 3 until the product
  decides on the roll-forward of annual calls; `check-paths.py` warns for
  every annual path whose latest call is past, with the date the app
  would show, and the report lists these warnings.

## 0. Set up

- The argument: one or more path ids, `all`, or `new "<name>" [<url> ...]`.
- The run folder: `.local/paths-research/<today, YYYY-MM-DD>/`. It is
  git-ignored like the rest of `.local/`, is not in the data bundle and is
  not read by the app; the report names every URL, so another machine can
  fetch the sources again. A second run
  on the same day continues in it; the fetch script does not fetch a URL
  again that the folder already holds (unless `--refresh`), but fetches a
  thin copy again.
- PDF text needs pypdf, installed into the session's scratchpad, never into
  the pinned venv:
  `.venv/Scripts/python -m pip install --quiet --target <scratchpad>/pylib pypdf`.
- Baseline: run `.venv/Scripts/python scripts/check-paths.py` and note its
  errors and warnings (an error in a live path file is a finding of the
  run, not a reason to stop), and note `git status --short` so a stray
  write can be told apart later. The path files are not in git: if a live
  file to check differs from the draft of the last run in
  `.local/paths-research/` (an edit by hand since), ask the user before
  you start.
- For `new`: make sure no existing file covers the same programme or legal
  basis (`grep` the names and acts in `data/built/paths/`); if one does,
  check that path instead and say so.

## 1. Research

One or two paths: do the work yourself, following [worker.md](worker.md)
step by step. More: launch workers with the Agent tool
(`subagent_type: "general-purpose"`, `run_in_background: true`), at most
four at a time, one path each, with exactly this prompt, the placeholders
filled:

```
Work in the repository at <absolute path of the repository root>.
Read .claude/skills/research-paths/worker.md and follow it exactly.
Your path: <id> (for a new path: the name "<name>" and the URLs <urls>; choose the id as worker.md says).
Run folder: .local/paths-research/<date>/. Today is <YYYY-MM-DD>. pypdf is in <scratchpad>/pylib.
Read .local/paths-research/<date>/hints.md first if it exists; a hint is a lead, never evidence.
Write only the three places worker.md names; do not edit any other file and do not stage anything.
```

After every worker:

1. Run both validators:

   ```
   .venv/Scripts/python scripts/check-paths.py --dir .local/paths-research/<date>/drafts
   .venv/Scripts/python scripts/check-evidence.py --run .local/paths-research/<date> <id>
   ```

   An error line of the path goes back to its worker once (SendMessage to
   its agent id: "Fix the error lines of check-evidence.py and
   check-paths.py for <id> from your saved copies, then reply with the five
   lines of worker.md step 5."). A path that still fails after that is
   "not verified" in the report.
2. Compare `git status --short` with the baseline. A new untracked file
   (the run folder is ignored, so anything that shows was written
   elsewhere) was written by the worker: delete it and redo that path. A
   changed tracked file: do not revert it (another session may be at
   work); tell the user and treat that path as not done.
3. Regenerate the hints for the workers still to come:
   `.venv/Scripts/python scripts/build-paths-report.py --run .local/paths-research/<date> --hints`.

A worker's reply is not evidence; the validators and step 2 are.

## 2. Second check

Launch one fresh agent (`subagent_type: "general-purpose"`) per batch of
at most five drafts that passed both validators, as soon as the batch is
ready, with the prompt below. The prompt is final: if it has to change
during a run, re-check the batches done before the change, or record in
`run-notes.md` which paths got the older one.

```
Work in the repository at <absolute path of the repository root>. Read only; write nothing. Today is <YYYY-MM-DD>.
Paths: <ids>. For each path read: the draft .local/paths-research/<date>/drafts/<id>.yaml, the live file data/built/paths/<id>.yaml (missing for a new path), the evidence .local/paths-research/<date>/<id>/evidence.md, the index .local/paths-research/<date>/<id>/sources/index.md and the copies it names (read the .txt beside each copy). scripts/check-evidence.py has already confirmed that every quote is in its copy (except the copies marked with "!" and the rows with a note instead of a quote: read those yourself); do not repeat that.
Check, in this order, and report every finding:
1. Subject. Every copy that gives an amount, a window, a step, a condition or an eligibility list was issued by the subject named in the evidence header (for a programme with strands: this strand). A notice reprinted on another body's site, a provider's recruitment, another strand's call or rules: not this path's. Check the "Issuer" cells against the documents themselves.
2. Missed facts. Read index.md and the copies for calls (nabór, termin, ogłoszenie, konkurs), suspensions, extensions and closings (wstrzym, zawiesz, przedłuż, wydłuż, zamkn, wyczerpan), rules (regulamin, zasady) and eligibility lists (art. 3 ust. 3, spółdzielni socjalnych, kościeln, koła gospodyń, osoby fizyczne) that the draft does not state and the evidence does not list under "Not used"; name the copy key and the line.
3. Values. For every row of the Changes table, and every value of a new path: the quote supports the value as of today (amount, date, who applies, who decides); a newer document wins over an older one, P over S; the timing kind follows the rule "timing.kind" of .claude/skills/research-paths/worker.md step 3; no sentence of the draft is an estimate; the Kind of each change follows worker.md step 2.
4. Applicant types. Compare the four rows applicant_types:jst, ngo, pes, mieszkancy with the eligible-entity list of the rules or the act and the table "Applicant types" of worker.md; name the entity the draft missed or added without support.
5. Polish, against section 11 of docs/functional-specification.md (points 2 to 5) and the checklist of worker.md step 4: register, glossary terms (never "samorząd" alone for gmina, powiat or JST; never "NGO"), formats, the act's own terms, no sentence about sources or modelling in notes_pl, amount_note_pl or timing.note_pl, no English.
Reply in Markdown: per path a heading "## <id>" and a numbered list, one finding per line, in the form
"<n>. <field> | <wording or substantive> | <problem> | <copy key and line, or none> | <what to do>".
At most twenty lines per path, no praise, no summary; write "No findings" under a path that has none.
```

Save each reply as `.local/paths-research/<date>/checks/<batch>.md` (the
coordinator's own file). Then, for every path with findings, launch one
fresh fixer (`subagent_type: "general-purpose"`, `model: "sonnet"`,
`run_in_background: true`), at most four at a time, with this prompt, the
path's numbered findings pasted in:

```
Work in the repository at <absolute path of the repository root>. Today is <YYYY-MM-DD>.
Read .claude/skills/research-paths/worker.md, sections "Subject and issuer", "Applicant types", 2, 3 and 4.
Your path: <id>. Run folder: .local/paths-research/<date>/. pypdf is in <scratchpad>/pylib.
Apply the numbered findings below to .local/paths-research/<date>/drafts/<id>.yaml and .local/paths-research/<date>/<id>/evidence.md. Every new or changed value needs a verbatim quote from a copy under .local/paths-research/<date>/<id>/sources/ (read the .txt beside the copy), a row in the Facts table and a row in the Changes table. If the copies do not support a value, set it as worker.md says for an unverified fact and list it under "Not verified". Fetch a new source only when a finding names a URL, with scripts/fetch-sources.py as worker.md says. Run scripts/check-paths.py --dir .local/paths-research/<date>/drafts and scripts/check-evidence.py --run .local/paths-research/<date> <id> until both pass for your path. Write only those two files and the sources folder; stage nothing; do not write a summary file.
Reply with one line per finding: its number, then "applied", "not applied: <reason>" or "open: <what a person must decide>", and then the five lines of worker.md step 5.
Findings:
<the checker's numbered list for this path>
```

One fix round per path. Do not send the findings back to the researcher:
its context costs 200 000 to 300 000 tokens to reload, and every fact
must come from the saved copies anyway. A finding the fixer reports as
"open" goes into "Decisions for a person"; one "not applied" for a
substantive finding: check it yourself in the copies. For a path you
researched yourself, fix the findings yourself. Then run both validators
on all drafts and compare `git status --short` with the baseline again.

## 3. Report

```
.venv/Scripts/python scripts/build-paths-report.py --run .local/paths-research/<date>
```

writes `.local/paths-research/<date>/report.md` from the drafts, the live
path files and the evidence: the comparison table (status, changed fields per
kind, selection fields changed) and the totals, the validators' warnings
(including every annual path whose date the app rolls forward), the
collected "Outside this path" lines, and one section per path (its
Changes table, Not used, Not verified, Sources failed, Contradictions and
the proposed 14.4 cells). Then write the two sections the script leaves
for you, at the top of the report (a rebuild keeps them):

- "The most serious errors": the errors that would mislead a user most.
- "Decisions for a person": the fixers' open points, the product
  questions, the paths whose subject or scope is in doubt, and for
  `tests/unit/route/paths.test.ts` (it names real paths at a fixed date)
  which changes might move its expectations.

Give the user the summary in the chat and ask for approval per path. Do
not go on without an answer.

## 4. Apply (only what the user approved)

1. Copy each approved draft over `data/built/paths/<id>.yaml` (a new
   path: as a new file).
2. Run `.venv/Scripts/python scripts/check-paths.py`,
   `node scripts/build-data-types.mjs --check` and
   `npx vitest run tests/unit/route/paths.test.ts`. A failing selection
   test is a finding to report, not a test to edit on your own.
3. Update section 14.4: the changed cells of each row, and "checked
   <YYYY-MM-DD>" in its last column next to P or S; take facts off the
   list "Not verified" once they are verified. For a new path also add it
   to the baseline list in 8.7 and FR-8.3, and raise the count of files
   ("The 30 files") in 8.7 and in `data/README.md`.
4. Tell the user that the cached demo routes still show the old path
   block until `npx pnpm@12.6.0 cache:warm --refresh` reruns them (it
   calls the model; run it only when asked).
5. The path files are not in git: they reach other machines only in a
   data release. Offer to make one (`.venv/Scripts/python
   scripts/pack-data.py --release X.Y.Z`, the next label above the last
   release); run it only when asked. Propose a one-line commit message in
   the style of the recent commits for the specification. The run folder
   stays in `.local/paths-research/` (not committed, not packed).
