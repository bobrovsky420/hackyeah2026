import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { catalogue as loadCatalogue } from "@/lib/catalogue";
import { llmProvider } from "@/lib/env";
import { describeLlm, getLlm, loadPrompt } from "@/lib/llm";
import { createEmbedClient } from "@/server/match";
import { bannedWords } from "@/server/route/safety";
import { percentile } from "./stats";
import { DEFAULT_TASK_CASES_DIR, EVAL_TASKS, loadTaskCases, runTaskCase, scoreTaskCase, type EvalTask, type TaskCase, type TaskObservation } from "./tasks";

/*
 * `pnpm eval:tasks` (decision A.17): the golden cases of tests/task-cases/
 * against the configured model, a report in .local/reports/tasks-<time>.md
 * and .json, exit code 0 when every run passes, 1 when one fails, 2 on a
 * usage or setup error. `--check` only loads and checks the cases against
 * the data, with no model call, for CI. The provider comes from the
 * environment as for the app; scripts/eval-tasks.ts sets LLM_PROVIDER from
 * --provider before this module builds the chain.
 */

export const TASKS_USAGE = `pnpm eval:tasks [options]

Runs the golden cases of tests/task-cases/ (the idea assistant and the
Middleman) against the configured model and writes
.local/reports/tasks-<timestamp>.md and .json.

  --provider <p>   openai-compatible (default), anthropic or replay
  --task <t>       only the cases of adapt, develop, show or inspire
  --only <ids>     only these cases, e.g. A01,D02
  --repeat <n>     run every case n times (default 1)
  --check          load and check the cases against the data, call no model
  --cases <dir>    case folder (default tests/task-cases)
  --out <dir>      report folder (default .local/reports)
  --verbose        keep the app's log lines
  --help           this text`;

export interface TasksArgs {
  provider: string | null;
  task: EvalTask | null;
  only: string[];
  repeat: number;
  check: boolean;
  casesDir: string;
  outDir: string;
  verbose: boolean;
  help: boolean;
}

export class TasksUsageError extends Error {}

export function parseTasksArgs(argv: string[]): TasksArgs {
  const args: TasksArgs = {
    provider: null,
    task: null,
    only: [],
    repeat: 1,
    check: false,
    casesDir: DEFAULT_TASK_CASES_DIR,
    outDir: path.join(process.cwd(), ".local", "reports"),
    verbose: false,
    help: false,
  };
  const value = (index: number, flag: string) => {
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) throw new TasksUsageError(`${flag} needs a value`);
    return next;
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--provider") {
      const provider = value(i++, flag);
      if (!["openai-compatible", "anthropic", "replay"].includes(provider)) throw new TasksUsageError(`--provider: ${provider} is not openai-compatible, anthropic or replay`);
      args.provider = provider;
    } else if (flag === "--task") {
      const task = value(i++, flag);
      if (!(EVAL_TASKS as readonly string[]).includes(task)) throw new TasksUsageError(`--task: ${task} is not ${EVAL_TASKS.join(", ")}`);
      args.task = task as EvalTask;
    } else if (flag === "--only") {
      args.only = value(i++, flag)
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    } else if (flag === "--repeat") {
      const repeat = Number(value(i++, flag));
      if (!Number.isInteger(repeat) || repeat < 1 || repeat > 20) throw new TasksUsageError("--repeat: a whole number from 1 to 20");
      args.repeat = repeat;
    } else if (flag === "--cases") {
      args.casesDir = path.resolve(value(i++, flag));
    } else if (flag === "--out") {
      args.outDir = path.resolve(value(i++, flag));
    } else if (flag === "--check") args.check = true;
    else if (flag === "--verbose") args.verbose = true;
    else if (flag === "--help" || flag === "-h") args.help = true;
    else throw new TasksUsageError(`unknown flag ${flag}`);
  }
  return args;
}

export interface TaskRunResult {
  case: TaskCase;
  observation: TaskObservation;
  failures: string[];
}

function pct(part: number, whole: number): string {
  return whole === 0 ? "n/a" : `${Math.round((part / whole) * 100)} %`;
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** The report's Markdown: the setting, a line per task, a line per run, and what each failed run lacked. */
export function tasksMarkdown(meta: { runId: string; startedAt: string; provider: string; model: string | null; embedding: boolean; dataVersion: string; prompts: Record<string, string> }, results: TaskRunResult[]): string {
  const lines: string[] = [];
  const passed = results.filter((result) => result.failures.length === 0).length;
  lines.push(`# Evaluation of the model tasks, ${meta.startedAt.slice(0, 16).replace("T", " ")} UTC`, "");
  lines.push(`${passed} of ${results.length} runs passed.`, "");
  lines.push("| Setting | Value |", "|---|---|");
  lines.push(`| Run id | ${meta.runId} |`, `| Provider | ${meta.provider}${meta.model ? `, ${meta.model}` : ""} |`, `| Embedding service | ${meta.embedding ? "reachable" : "not reachable: the retriever of inspire falls back to the lexical scorer"} |`, `| Data | ${meta.dataVersion} |`);
  for (const [task, version] of Object.entries(meta.prompts)) lines.push(`| Prompt of ${task} | ${version} |`);
  lines.push("", "## By task", "", "| Task | Runs | Passed | Parts kept from the model | Dropped by the checks | Polish issues | Latency p50 | Latency p95 |", "|---|---|---|---|---|---|---|---|");
  for (const task of EVAL_TASKS) {
    const rows = results.filter((result) => result.case.task === task);
    if (rows.length === 0) continue;
    const kept = rows.reduce((sum, row) => sum + row.observation.kept, 0);
    const proposed = rows.reduce((sum, row) => sum + row.observation.proposed, 0);
    const polish = rows.reduce((sum, row) => sum + row.failures.filter((failure) => failure.startsWith("polish")).length, 0);
    const latencies = rows.map((row) => row.observation.totalMs / 1000);
    lines.push(
      `| ${task} | ${rows.length} | ${rows.filter((row) => row.failures.length === 0).length} | ${kept} of ${proposed} (${pct(kept, proposed)}) | ${rows.reduce((sum, row) => sum + row.observation.dropped.length, 0)} | ${polish} | ${(percentile(latencies, 50) ?? 0).toFixed(1)} s | ${(percentile(latencies, 95) ?? 0).toFixed(1)} s |`,
    );
  }
  lines.push("", "## Runs", "", "| Case | Task | Run | Result | Kept | Answered by | Time | What failed |", "|---|---|---|---|---|---|---|---|");
  for (const { case: c, observation: o, failures } of results) {
    const by = [...new Set(o.calls.map((call) => `${call.provider}${call.cached ? " (recording)" : ""}${call.error ? ` (${call.error})` : ""}`))].join(", ") || "nothing";
    lines.push(`| ${c.id} | ${c.task} | ${o.repeat} | ${failures.length === 0 ? "pass" : "FAIL"} | ${o.kept} of ${o.proposed} | ${by} | ${(o.totalMs / 1000).toFixed(1)} s | ${cell(failures.join("; "))} |`);
  }
  const failed = results.filter((result) => result.failures.length > 0);
  if (failed.length > 0) {
    lines.push("", "## The answers of the failed runs");
    for (const { case: c, observation: o } of failed) {
      lines.push("", `### ${c.id} (run ${o.repeat}): ${c.title}`, "");
      for (const [part, texts] of Object.entries(o.texts)) for (const text of texts) lines.push(`- ${part}${o.modelTexts[part]?.includes(text) ? "" : " (template)"}: ${text}`);
      for (const note of o.dropped) lines.push(`- dropped by the checks: ${note}`);
      if (o.pathIds.length > 0) lines.push(`- paths: ${o.pathIds.join(", ")}`);
    }
  }
  lines.push("", "## Case files", "", "| Case | File | sha256 |", "|---|---|---|");
  for (const c of [...new Map(results.map((result) => [result.case.id, result.case])).values()]) lines.push(`| ${c.id} | ${c.file} | ${c.sha256.slice(0, 16)} |`);
  return `${lines.join("\n")}\n`;
}

function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
}

/** The reasons of the `*_dropped` log lines of the app (assistant_dropped, middleman_dropped) since the last take. */
const dropped: string[] = [];
function collectDropped(verbose: boolean): void {
  const original = console.info.bind(console);
  console.info = (...items: unknown[]) => {
    const line = typeof items[0] === "string" ? items[0] : "";
    if (line.startsWith("{")) {
      try {
        const parsed = JSON.parse(line) as { event?: string; notes?: unknown };
        if (parsed.event?.endsWith("_dropped") && Array.isArray(parsed.notes)) dropped.push(...parsed.notes.map(String));
      } catch {
        // not a log line of the app
      }
    }
    if (verbose) original(...items);
  };
  console.warn = verbose ? console.warn : () => undefined;
}

export async function tasksMain(args: TasksArgs): Promise<number> {
  collectDropped(args.verbose);
  const data = loadCatalogue();
  const { cases: all, issues } = loadTaskCases(args.casesDir, data);
  for (const issue of issues) process.stderr.write(`${issue.file}: ${issue.message}\n`);
  if (issues.length > 0) return 2;
  if (!data.dataset) process.stderr.write("data/built/ is missing: the cases run on the fixtures, without the real paths.\n");
  const unknown = args.only.filter((id) => !all.some((c) => c.id === id));
  if (unknown.length > 0) {
    process.stderr.write(`--only: no case ${unknown.join(", ")}\n`);
    return 2;
  }
  const cases = all.filter((c) => (!args.task || c.task === args.task) && (args.only.length === 0 || args.only.includes(c.id)));
  if (args.check) {
    process.stdout.write(`pnpm eval:tasks --check: ${all.length} cases in ${path.relative(process.cwd(), args.casesDir)} are valid against data ${data.version}\n`);
    return 0;
  }
  const head = llmProvider();
  const described = describeLlm();
  if (head !== "replay" && described.configured.length === 0) {
    process.stderr.write("No language model is configured: set HF_TOKEN, or OPENAI_COMPAT_BASE_URL, OPENAI_COMPAT_MODEL and OPENAI_COMPAT_API_KEY for a local host, or ANTHROPIC_API_KEY.\n");
    return 2;
  }
  const started = new Date();
  const runId = `${stamp(started).slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex")}`;
  const embed = createEmbedClient();
  const embedding = await embed(["sprawdzenie"], "query").then(
    () => true,
    () => false,
  );
  const deps = { llm: getLlm(), catalogue: data, banned: bannedWords(), embed, now: () => new Date(), runTag: head === "replay" ? null : `ocena ${runId}` };
  process.stdout.write(`pnpm eval:tasks: ${cases.length} cases, ${args.repeat} run(s) each, provider ${described.provider}${described.model ? ` (${described.model})` : ""}\n`);
  const results: TaskRunResult[] = [];
  for (const c of cases) {
    for (let repeat = 1; repeat <= args.repeat; repeat++) {
      dropped.length = 0;
      const observation = { ...(await runTaskCase(c, deps, repeat)), dropped: [...dropped] };
      const failures = scoreTaskCase(c, observation, deps.banned);
      results.push({ case: c, observation, failures });
      process.stdout.write(`${c.id} ${c.task.padEnd(8)} ${repeat} ${failures.length === 0 ? "pass" : "FAIL"} kept ${observation.kept}/${observation.proposed} ${(observation.totalMs / 1000).toFixed(1)} s${failures.length ? `  ${failures[0]}` : ""}\n`);
    }
  }
  const prompts = Object.fromEntries([...new Set(cases.map((c) => c.task))].map((task) => [task, loadPrompt(task).version]));
  const meta = { runId, startedAt: started.toISOString(), provider: described.provider, model: described.model, embedding, dataVersion: data.version, prompts };
  mkdirSync(args.outDir, { recursive: true });
  const base = path.join(args.outDir, `tasks-${stamp(started)}`);
  writeFileSync(`${base}.md`, tasksMarkdown(meta, results));
  writeFileSync(`${base}.json`, `${JSON.stringify({ meta, results: results.map(({ case: c, observation, failures }) => ({ case: c.id, task: c.task, observation, failures })) }, null, 2)}\n`);
  const passed = results.filter((result) => result.failures.length === 0).length;
  process.stdout.write(`${passed} of ${results.length} runs passed; report ${path.relative(process.cwd(), base)}.md\n`);
  return passed === results.length ? 0 : 1;
}
