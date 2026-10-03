---
name: extract-innovations
description: Run the extraction of derived fields for the innovation catalogue (.local/pipeline/sources to .local/pipeline/derived) with cheap worker subagents, validate every record with scripts/derive-records.py, build data/innovations and prepare the human check. Use when the user asks to run, resume, pilot or rebuild the ingestion or extraction pipeline, or to derive fields for new source records.
---

# Extract innovations: the coordinator playbook

You are the coordinator. Workers are subagents. The referee is
`scripts/derive-records.py`. The contract is
[docs/innovation-record.md](../../../docs/innovation-record.md); the
worker instructions are [prompts/extract.md](../../../prompts/extract.md).
Read both before the first run of a session.

Rules for the coordinator:

- You never write or edit a derived record yourself. A record that fails
  goes back to a worker with the validator's error lines.
- You never change `prompts/extract.md`, `data/taxonomies.json` or the
  schemas during a run. A needed change is reported to the user; it is a
  new prompt or taxonomy version and a rerun.
- You never mark a record valid by hand. Only the validator does.
- Every Python command runs with `.venv/Scripts/python` from the
  repository root.

## 0. Preconditions

```
.venv/Scripts/python scripts/parse-catalogues.py        # source records, idempotent
.venv/Scripts/python scripts/derive-records.py status   # counts and the manifest
```

`prompts/extract-example.json` must exist and be valid:

```
.venv/Scripts/python scripts/derive-records.py validate --file prompts/extract-example.json
```

It is the worked example the workers read. If it is missing or invalid,
stop and tell the user.

## 1. Pilot (once per prompt version and per worker model)

The pilot set is `.claude/skills/extract-innovations/pilot.json` (ten ids: five from each
catalogue, chosen to cover legal entities, natural persons, informal
groups, a MIIS item and an entry with missing sections). Run it as one
batch with one Sonnet worker (section 3), validate, then run
`derive-records.py show <id>` for each of the ten and read the result
against the source text yourself. Look first for the known failure mode
of small workers, seen in the smoke test: a
sentence in `problem_pl` or `summary_pl` that states a cause, a feeling
or a benefit the source never mentions. The validator cannot catch it;
only reading can. Report to the user: how many are valid, how many are
right, the unsupported sentences, the wording problems, and your
recommendation (Sonnet at the session's default effort is the measured choice; say so if the pilot contradicts it). The user decides the
model. Do not start the full run before that decision.

## 2. Batches

```
.venv/Scripts/python scripts/derive-records.py batches --size 12
```

prints JSON lists of the ids that are missing, invalid or stale. Use
`--source nat` or `--source rops` to run one catalogue first (the ROPS
records are shorter; start with them).

## 3. Launching a worker

Use the Agent tool with `subagent_type: "general-purpose"`, `model:
"sonnet"`, `run_in_background: true`. Run at most six workers at the same
time. Workers inherit the reasoning effort of this session, so run the
coordinator at the default effort (`/effort` shows it). The custom agent
`extract-worker-max` (Sonnet, effort max) exists, but the measurement
found no gain worth its four minutes per record. The prompt of a worker is exactly
this text with the placeholders filled:

```
Work in the repository at <absolute path of the repository root>.
Read prompts/extract.md and follow it exactly; it names the two files to read first.
Your batch: <comma-separated ids>.
Write generated_by: "<model id, e.g. claude-sonnet-5>" and generated_at: "<today, YYYY-MM-DD>".
Write only .local/pipeline/derived/<id>.json for the ids of your batch; do not edit any other file; do not use the network.
When done, run the validator as prompts/extract.md says, fix ERROR lines (at most two rounds), and report in at most ten lines: ids written, the validator's summary line, doubts.
```

The model id to write comes from the model you launch: `claude-haiku-4-5`
for Haiku, `claude-sonnet-5` for Sonnet, `claude-opus-5-5` for Opus. If a
retry uses another model, the record carries that model.

## 4. After every worker

```
.venv/Scripts/python scripts/derive-records.py validate <the batch's ids>
git status --short
```

The coordinator's validation is the one that counts. A worker's report
is not evidence: in the smoke tests a Haiku worker
reported ten valid records when five were invalid, and instead of writing
the records it wrote two scripts into the repository root, one of which
tried to call the Anthropic API. So, after every worker: if `git status`
shows any new or changed file outside `.local/pipeline/derived/`, delete
it and treat the whole batch as invalid (delete its derived files and
requeue), whatever the worker reported. For each id still
invalid: relaunch a worker for the failed ids only, with the error lines
appended to the prompt under "Errors from the previous attempt:". After
two failed attempts, launch the third with `subagent_type: "extract-worker-max"`
once. After that, leave the
record invalid and list it in the final report.

Keep a short running log in your own words (batches launched, valid,
retried) so the user can follow. Do not print records.

## 5. Finish

```
.venv/Scripts/python scripts/derive-records.py status
.venv/Scripts/python scripts/derive-records.py build
.venv/Scripts/python scripts/derive-records.py sample --n 20 --seed <today's day of month>
```

Report: the status table, the data version, merged and possible
duplicates (`.local/pipeline/duplicates.json`), the records left invalid
with their errors, the count of warnings by kind (wording, inferred cost,
domain `inne`), and the path of `docs/review-sample.md` for the human
check (committed, so the reviewer on another machine can read and mark
it). Propose a one-line commit message covering `docs/review-sample.md`;
the build outputs in `data/` are git-ignored.

## 6. Resuming and reruns

The run is idempotent: `batches` lists only what is missing, invalid or
stale, so an interrupted run resumes with the same commands. After a
prompt or taxonomy change (a new version), every record becomes invalid
and the full run repeats; the pilot repeats first. After the parser
changes a source (new fingerprint), only the stale records rerun.

## 7. Partner hand-over on 3 October

If the partner provides a file, the adapter writes the source records
(FR-1.6): copy `tests/fixtures/partner/mapping.yaml`, put the partner's
column headers into it, and run
`.venv/Scripts/python scripts/ingest-partner.py --file <file> --map <mapping.yaml> --dry-run`,
then without `--dry-run`. The new `inn-partner-*` ids show as missing in
`status` (row `partner`); `batches --source partner` lists them. Then this
skill runs unchanged on the new ids. Do not extract from a file that has
no source record. Rehearsed with the five-row sample
in a copy of the repository.
