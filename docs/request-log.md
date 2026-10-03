# Request log

The request log of specification 12.8 and FR-3.6: one JSON line per
event, with the trace id of the request it belongs to, so the model
calls, the matching and the route of one request read together. The code
is `src/lib/telemetry.ts`.

## Where the lines go

- Always to stdout (the systemd journal on the server, the terminal on a
  laptop).
- With `LOG_DIR` set, also to `<LOG_DIR>/events-YYYY-MM-DD.jsonl`
  (relative to the repository root, for example `LOG_DIR=.local/logs`).
  Files older than 14 days are deleted when the day turns (12.6).

## Variables

| Variable | Default | Effect |
|---|---|---|
| `LOG_DIR` | unset | Also write the lines to daily JSONL files in this folder |
| `PAGE_EVENTS` | off | `on` renders the page beacon and accepts `/api/events`; read when the layout renders, so a production build takes it from its build |

`PAGE_EVENTS` stays off on a public server: the privacy page says the
pages use no tracking tools. It is meant for local runs of the simulated
users and for analysis.

## Common fields

Every line has `ts`, `event`, `trace_id`, `entry` (the API path or action
the trace started at), `route_id` (once the route of the request has its
id), `synthetic`, `run_id` and `persona`. A line outside a request has a
null trace.

A request with the header `x-simulation-run: <id>` is marked
`synthetic: true` with that `run_id`; `x-simulation-persona` fills
`persona`. Header values that are not id-like (letters, digits, `._:-`, at
most 80) are dropped.

## Events

| Event | Written by | Fields |
|---|---|---|
| `http_request` | every POST under `/api/` except `/api/events` | `method`, `status`, `duration_ms`, `error` on a throw |
| `gate_screened` | the gate, every kind of text | `kind`, `category`, `confidence`, `outcome`, `individual_case`, `sensitive_topics`, `crisis_banner`, `redaction_count`, `rules_fired`, `repeats_seen`, `model_ms` |
| `llm_call` | the model chain | `task`, `provider`, `model`, `prompt_version`, tokens, `latency_ms`, `cached`, `outcome`, `failed`, `cost_usd` |
| `match` | the matcher | `mode`, `retriever`, `retrieved` (the 15 nearest with rank, score and whether stage 1 kept them), `candidates` (with their retrieval rank), `assessments` (fit, counts of reasons and gaps), `top_ids`, detected groups and domains |
| `route_completed` | the pipeline and the canned engine | `engine`, `mode`, `cache_hit`, `latency_ms`, `place_terc`, `powiat_terc`, `role`, `target_groups_given`, `text_length`, screening facts, `solution_ids`, `fit_scores`, `path_ids`, people counts, tokens, `cost_usd`, `stages` |
| `brief_completed` | the brief of a need | `need_id`, `stages` |
| `count` | every event counter of FR-10.2 | `name`, for example `route_created:route`, `need_saved`, `feedback_given:tak` |
| `ui_page_viewed`, `ui_page_left`, `ui_link_clicked`, `ui_button_clicked` | `/api/events`, with `PAGE_EVENTS=on` | `path`, `visit_id`, `target`, `target_id`, `section`, `duration_ms` |

The page events come from `src/components/shell/page-events.tsx`: a view
and the time on the page, every link followed (our own path, or only the
host of an outside link) and the buttons marked with `data-track`
(print, download, the feedback vote). The visit id lives in the tab's
memory and is gone on a reload; nothing is stored in the browser.

## Simulated users

The skill `/simulate-users` (`.claude/skills/simulate-users/`) writes
personas to `.local/simulation/<run>/requests.yaml` and
`npx pnpm@12.6.0 simulate --run <run>` plays them through the UI
(`scripts/simulate-users.ts`) of the dev server on port 3000, which writes
the log to its `LOG_DIR` and its entries to the main store. With
`--serve` it builds the app and serves it on port 3300 with
`LOG_DIR=.local/simulation/logs`, `PAGE_EVENTS=on`,
`STORE_FILE=.local/simulation/store.json`, the live engine and the keys of
`.env.dev`. Its lines carry `synthetic: true`, the `run_id` and the
persona.

## What never goes in

No user text, no client address, no key: the lines hold ids, codes,
numbers and lengths. A failure to write a line never fails the request.
