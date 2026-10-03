import type { PairResult, PairSkip, TargetGroupRow } from "./fairness";
import type { LoadedProblems, Problem, ValidationIssue } from "./problems";
import type { LatencyRow } from "./stats";
import type { EvalSummary } from "./summary";
import type { ProblemResult } from "./types";

/*
 * The evaluation report of 13.2: reports/eval-<timestamp>.md for the team
 * (summary first, then the problems, latency, cost, fairness, the details
 * and the hashes) and a JSON file next to it with the same data, which
 * "Jak to działa" reads for the date of the last run (FR-11.7). A problem
 * marked sensitive never has its text in either file, nor the need
 * summary the model wrote from it; the other texts are the team's own.
 */

export const REPORT_SCHEMA = "hubmi-eval-report/1";

export interface ReportMeta {
  command: "eval" | "cache:warm";
  runId: string;
  startedAt: string;
  finishedAt: string;
  /** True for the lawyer's folder tests/problems; a draft set never becomes the "last run" of FR-11.7. */
  official: boolean;
  options: {
    provider: string;
    readCache: boolean;
    concurrency: number;
    gate: string;
    exceptions: string[];
    fairnessAll: boolean;
    runTag: boolean;
    only: string[];
  };
  environment: {
    llmHead: string;
    llmModel: string | null;
    llmConfigured: string[];
    dataVersion: string;
    promptVersions: Record<string, string>;
    embeddingModel: string;
    embeddingReachable: boolean;
  };
}

export interface ReportData {
  meta: ReportMeta;
  loaded: LoadedProblems;
  results: ProblemResult[];
  pairs: PairResult[];
  skippedPairs: PairSkip[];
  targetGroups: TargetGroupRow[];
  summary: EvalSummary;
}

/** The JSON of the report: everything the Markdown shows, with the sensitive texts left out. */
export function reportJson(data: ReportData): unknown {
  const byId = new Map(data.loaded.problems.map((problem) => [problem.id, problem]));
  return {
    schema: REPORT_SCHEMA,
    ...data.meta,
    lastRun: data.meta.finishedAt,
    problemsDir: data.loaded.dir,
    summary: data.summary,
    must: data.summary.must,
    problems: data.loaded.problems.map((problem) => ({
      id: problem.id,
      set: problem.set,
      title: problem.title,
      file: problem.file,
      sha256: problem.sha256,
      author: problem.author,
      writtenOn: problem.writtenOn,
      sensitive: problem.sensitive,
      text: problem.sensitive ? null : problem.text,
      role: problem.role,
      placeTerc: problem.placeTerc,
      expected: problem.expected,
      runs: data.results.filter((result) => result.problemId === problem.id).map((result) => safeResult(result, problem)),
    })),
    pairs: data.pairs,
    skippedPairs: data.skippedPairs,
    targetGroups: data.targetGroups,
    hashes: data.loaded.hashes,
    validation: data.loaded.issues,
    unknownProblems: data.results.filter((result) => !byId.has(result.problemId)).length,
  };
}

function safeResult(result: ProblemResult, problem: Problem) {
  const observation = problem.sensitive
    ? { ...result.observation, generated: result.observation.generated.filter((item) => item.field !== "need_summary_pl") }
    : result.observation;
  return { ...result, observation };
}

// ----------------------------------------------------------------- Markdown

function cell(value: unknown): string {
  const text = value === null || value === undefined || value === "" ? "-" : String(value);
  return text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

function table(head: string[], rows: unknown[][]): string {
  if (rows.length === 0) return "_None._\n";
  return [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`)].join("\n") + "\n";
}

function status(pass: boolean | null): string {
  return pass === null ? "n/a" : pass ? "pass" : "FAIL";
}

function seconds(ms: number | null): string {
  return ms === null ? "-" : `${(ms / 1000).toFixed(1)} s`;
}

function usd(value: number | null): string {
  return value === null ? "-" : value.toFixed(4);
}

function latencyTable(rows: LatencyRow[]): string {
  return table(
    ["Measure", "Runs", "p50", "p95", "Max", "Budget", "Status"],
    rows.map((row) => [row.name, row.count, seconds(row.p50), seconds(row.p95), seconds(row.max), seconds(row.budgetMs), status(row.withinBudget)]),
  );
}

function check(result: ProblemResult | undefined, name: string): string {
  const found = result?.checks.find((item) => item.name === name);
  return found ? status(found.pass) : "-";
}

export function reportMarkdown(data: ReportData): string {
  const { meta, loaded, results, pairs, summary } = data;
  const byId = new Map(loaded.problems.map((problem) => [problem.id, problem]));
  const out: string[] = [];
  const push = (...lines: string[]) => out.push(...lines);

  push(`# Evaluation report ${meta.finishedAt.slice(0, 16).replace("T", " ")} UTC`, "");
  push(
    `Run \`${meta.runId}\` of \`pnpm ${meta.command}\`, ${meta.startedAt} to ${meta.finishedAt}. Problems from \`${loaded.dir}\`` +
      (meta.official ? " (the official set)." : " (a draft set, not the official tests/problems)."),
    "",
  );
  push(
    table(
      ["Setting", "Value"],
      [
        ["Model chain", `${meta.options.provider} (head ${meta.environment.llmHead}${meta.environment.llmModel ? `, ${meta.environment.llmModel}` : ""}; configured: ${meta.environment.llmConfigured.join(", ") || "none"})`],
        ["Route cache", meta.options.readCache ? "read (FR-3.5); misses are computed and stored" : "bypassed (--no-cache): every route computed, nothing stored"],
        ["Run id in live prompts (13.2)", meta.options.runTag ? "yes" : "no"],
        ["Data version", meta.environment.dataVersion],
        ["Prompt versions", Object.values(meta.environment.promptVersions).join(", ")],
        ["Embedding", `${meta.environment.embeddingModel}, service ${meta.environment.embeddingReachable ? "reachable" : "NOT reachable: lexical fallback"}`],
        ["Runs", `${summary.runs} (${summary.cacheHits} served from the route cache)`],
        ["Exit rule (13.5)", `${summary.must.level}${summary.must.exceptions.length ? `, exceptions ${summary.must.exceptions.join(", ")}` : ""}`],
      ],
    ),
  );

  push(`## Result: ${summary.must.pass ? "PASS" : "FAIL"}`, "");
  if (summary.must.failures.length) push(...summary.must.failures.map((failure) => `- ${failure}`), "");
  else push("Every MUST item of 13.5 the harness checks is met.", "");
  if (summary.must.exceptions.length) {
    push("Exceptions written into this report (13.5, final):", "", ...summary.must.exceptions.map((id) => `- ${id}: ${byId.get(id)?.title ?? ""}`), "");
  }

  push("## Summary (13.2)", "");
  push(table(["Measure", "Result", "Target", "Status"], summary.measures.map((measure) => [measure.name, measure.result, measure.target, status(measure.pass)])));
  push(table(["Set", "Files", "Defined in 13.1", "Passing", "Failing"], summary.sets.map((set) => [set.set, set.present, set.expected, set.passed, set.failed.join(", ")])));

  push("## Problems", "");
  const own = results.filter((result) => !result.variant.startsWith("role:") && !result.variant.startsWith("place:"));
  push(
    table(
      ["Problem", "Run", "Expected", "Got", "hit@3", "Groups", "Paths", "People", "Polish", "Solutions (fit)", "Total", "Cache", "Cost USD", "Result"],
      own.map((result) => {
        const problem = byId.get(result.problemId);
        const o = result.observation;
        const expected = problem?.expected.mode ? `${problem.expected.outcome}/${problem.expected.mode}` : (problem?.expected.outcome ?? "-");
        const got = o.error ? "error" : o.outcome === "need" ? `need/${o.clarificationNeeded ? "clarification" : o.mode}` : o.outcome;
        return [
          result.problemId,
          result.variant,
          expected,
          got,
          check(result, "hit@3"),
          check(result, "target groups"),
          check(result, "paths"),
          check(result, "people"),
          check(result, "Polish"),
          o.solutions.map((solution) => `${solution.id} (${solution.fit})`).join(", "),
          seconds(o.totalMs),
          o.cacheHit ? "hit" : "miss",
          usd(o.costUsd),
          result.pass ? "pass" : "FAIL",
        ];
      }),
    ),
  );

  push("## Latency (12.3, 13.2)", "");
  push("Measured in this run (routes computed now; the gate row covers every submission that reached the model):", "");
  push(latencyTable(summary.latency.measured));
  if (summary.latency.recorded[0].count > 0) {
    push("Recorded when the cached routes were computed (from the evaluation records in .local/eval-cache/):", "");
    push(latencyTable(summary.latency.recorded));
  }
  push("Nearest-rank percentiles. \"Route, first block visible\" (6 s) is a browser measure and is not taken here.", "");

  push("## Cost (12.10)", "");
  push(
    `Total ${usd(summary.cost.totalUsd)} USD in this run; ${summary.cost.routesComputed} routes computed, ${usd(summary.cost.perRouteUsd)} USD per computed route. Estimated from the token counts with the prices of src/lib/llm/observability.ts.`,
    "",
  );
  push(
    table(
      ["Provider", "Model", "Calls", "Input tokens", "Output tokens", "Cache-read tokens", "USD"],
      summary.cost.byModel.map((row) => [row.provider, row.model, row.calls, row.inputTokens, row.outputTokens, row.cacheReadTokens, usd(row.costUsd)]),
    ),
  );

  push("## Fairness (FR-12.11)", "");
  push(
    table(
      ["Pair", "Kind", "Counts", "A", "A solutions (best fit)", "B", "B solutions (best fit)", "Result", "Detail"],
      pairs.map((pair) => [
        pair.id,
        pair.kind,
        pair.official ? "yes" : "diagnostic",
        pair.a.label,
        `${pair.a.solutions.join(", ") || "none"} (${pair.a.bestFit ?? "-"})`,
        pair.b.label,
        `${pair.b.solutions.join(", ") || "none"} (${pair.b.bestFit ?? "-"})`,
        pair.pass ? "pass" : "FAIL",
        pair.detail,
      ]),
    ),
  );
  if (data.skippedPairs.length) push(...data.skippedPairs.map((skip) => `- ${skip.id} not compared: ${skip.reason}`), "");
  push("Per target group (the base runs of every problem routed as a need, under each group it expects):", "");
  push(
    table(
      ["Target group", "Records in the catalogue", "Problems", "Passing", "hit@3", "Mean best fit"],
      data.targetGroups.map((row) => [
        row.group,
        row.records,
        row.problems.join(", "),
        `${row.passed} of ${row.problems.length}`,
        row.hitCases ? `${row.hits} of ${row.hitCases}` : "-",
        row.meanBestFit === null ? "-" : row.meanBestFit.toFixed(0),
      ]),
    ),
  );

  push("## Details", "");
  for (const problem of loaded.problems) {
    push(`### ${problem.id} ${problem.title}`, "");
    push(
      `Set ${problem.set}; ${problem.role ?? "no role"}; ${problem.placeTerc ?? "no place"}; written by ${problem.author} on ${problem.writtenOn}; \`${problem.file}\` sha256 \`${problem.sha256.slice(0, 16)}\``,
      "",
    );
    if (problem.sensitive) push("_The text is marked sensitive and is not shown._", "");
    else push(...problem.text.split("\n").map((line) => `> ${line}`), "");
    for (const result of results.filter((item) => item.problemId === problem.id)) {
      const o = result.observation;
      push(`**Run ${result.variant}**: ${result.pass ? "pass" : "FAIL"}${o.cacheHit ? " (route cache hit)" : ""}${o.input.placeName ? `, ${o.input.placeName}` : ""}${o.input.role ? `, ${o.input.role}` : ""}`, "");
      push(table(["Check", "Required", "Status", "Detail"], result.checks.map((item) => [item.name, item.required ? "yes" : "no", status(item.pass), item.detail])));
      if (o.solutions.length) push(`Solutions: ${o.solutions.map((solution) => `${solution.id} (${solution.fit})`).join(", ")}. Paths: ${o.pathIds.join(", ") || "none"}.`, "");
      if (o.stage1Ids) push(`Stage 1: ${o.stage1Ids.join(", ") || "none"}. Detected groups: ${o.detectedTargetGroups?.join(", ") || "none"}.`, "");
      if (o.retriever) push(`Retriever: ${o.retriever.provider}${o.retriever.notes.length ? ` (${o.retriever.notes.join("; ")})` : ""}.`, "");
      if (o.summary) push(`Summary: ${o.summary}`, "");
      const stages = o.cacheHit && o.recordedStages ? [...o.stages, ...o.recordedStages.filter((stage) => stage.stage !== "screen")] : o.stages;
      if (stages.length) {
        push(
          table(
            ["Stage", "Provider", "Model", "Prompt", "ms", "Tokens in/out/cache", "Dropped ids", "Dropped quotes", "Notes"],
            stages.map((stage, index) => [
              o.cacheHit && index >= o.stages.length ? `${stage.stage} (recorded)` : stage.stage,
              stage.provider,
              stage.model,
              stage.promptVersion,
              stage.latencyMs,
              `${stage.inputTokens}/${stage.outputTokens}/${stage.cacheReadTokens}`,
              stage.droppedIds.length,
              stage.droppedReasons,
              stage.notes.join("; "),
            ]),
          ),
        );
      }
    }
    if (problem.notes) push(`Notes of the author: ${problem.notes.replace(/\n+/g, " ")}`, "");
  }

  push("## Problem files", "");
  push(table(["File", "sha256"], loaded.hashes.map((hash) => [hash.file, hash.sha256])));
  push(validationSection(loaded.issues));
  return out.join("\n");
}

function validationSection(issues: ValidationIssue[]): string {
  if (issues.length === 0) return "Every problem file is valid.\n";
  return `Problems in the problem files (the files are not run):\n\n${table(["File", "Field", "Problem"], issues.map((issue) => [issue.file, issue.field || "(file)", issue.message]))}`;
}
