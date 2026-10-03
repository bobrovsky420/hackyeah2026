import { estimateCostUsd } from "@/lib/llm/observability";
import type { StageLog } from "@/lib/contracts";
import type { PairResult } from "./fairness";
import type { Problem, ProblemSet } from "./problems";
import { latencyRow, mean, type LatencyRow } from "./stats";
import type { Observation, ProblemResult } from "./types";

/*
 * The measures of 13.2 over all runs, the latency rows against 12.3 and
 * 13.2, and the exit rule: the MUST items of 13.5 that a harness can check.
 * Pure, so the unit tests pin the rule.
 *
 * Exit rule (13.5), `--gate draft` for Saturday 20:00, `--gate final` (the
 * default) for Sunday 12:00:
 * - draft: at least six of the ten pass; R01-R13 and S01-S04 all present
 *   and passing;
 * - final: all ten present and passing, except the ids given with
 *   --except (the exceptions the report must name); R, S and the three
 *   fairness pairs all present and passing; every Polish check passes
 *   (13.2: a failing Polish check blocks the freeze);
 * - both: no invalid problem file.
 */

export const SET_SIZES: Record<ProblemSet, number> = { P: 10, R: 13, S: 4, F: 3 };
export const DRAFT_MIN_PASSING = 6;
/** 12.3 and 13.2: route complete at p95; the gate at p95 (13.2). */
export const ROUTE_BUDGET_MS = 15_000;
export const GATE_BUDGET_MS = 2_000;

export type GateLevel = "draft" | "final";

export interface Measure {
  name: string;
  result: string;
  target: string;
  /** Null: nothing to measure in this run. */
  pass: boolean | null;
}

export interface SetTally {
  set: ProblemSet;
  present: number;
  expected: number;
  passed: number;
  failed: string[];
}

export interface EvalSummary {
  measures: Measure[];
  sets: SetTally[];
  latency: { measured: LatencyRow[]; recorded: LatencyRow[] };
  cost: {
    totalUsd: number;
    perRouteUsd: number | null;
    routesComputed: number;
    byModel: { provider: string; model: string; calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; costUsd: number }[];
  };
  cacheHits: number;
  runs: number;
  must: { level: GateLevel; pass: boolean; failures: string[]; exceptions: string[] };
}

export interface SummaryInput {
  problems: readonly Problem[];
  results: readonly ProblemResult[];
  pairs: readonly PairResult[];
  validationIssues: number;
  level: GateLevel;
  exceptions: readonly string[];
}

/** Whether a problem passes: every run of it that is not derived passes. Null when it has no run. */
export function problemPasses(problemId: string, results: readonly ProblemResult[]): boolean | null {
  const own = results.filter((result) => result.problemId === problemId && !result.variant.startsWith("role:") && !result.variant.startsWith("place:"));
  return own.length ? own.every((result) => result.pass) : null;
}

function fraction(pass: number, total: number): string {
  return `${pass} of ${total}`;
}

function tally(checkName: string, results: readonly ProblemResult[]): { pass: number; total: number } {
  const checks = results.flatMap((result) => result.checks.filter((check) => check.name === checkName && check.required && check.pass !== null));
  return { pass: checks.filter((check) => check.pass).length, total: checks.length };
}

function stageCost(stage: StageLog): number {
  return estimateCostUsd(stage.model, { inputTokens: stage.inputTokens, outputTokens: stage.outputTokens, cacheReadTokens: stage.cacheReadTokens });
}

/** Stages that reached a model or the embedding service in this run (not the replay recording). */
function liveStages(observation: Observation): StageLog[] {
  return observation.stages.filter((stage) => !stage.cached);
}

export function summarise(input: SummaryInput): EvalSummary {
  const { problems, results, pairs } = input;
  const byId = new Map(problems.map((problem) => [problem.id, problem]));
  const own = results.filter((result) => !result.variant.startsWith("role:") && !result.variant.startsWith("place:"));
  const baseOf = (set: ProblemSet) => own.filter((result) => result.variant === "base" && byId.get(result.problemId)?.set === set);

  const sets: SetTally[] = (["P", "R", "S", "F"] as const).map((set) => {
    const ids = problems.filter((problem) => problem.set === set).map((problem) => problem.id);
    const failed = ids.filter((id) => problemPasses(id, results) === false);
    return { set, present: ids.length, expected: SET_SIZES[set], passed: ids.length - failed.length, failed };
  });
  const setOf = (set: ProblemSet) => sets.find((entry) => entry.set === set)!;

  // --------------------------------------------------------------- measures
  const main = baseOf("P");
  const routeCases = main.filter((result) => byId.get(result.problemId)?.expected.mode === "route");
  const hit = tally("hit@3", routeCases);
  const mode = tally("mode", main);
  const groups = tally("target groups", main);
  const paths = tally("paths", routeCases);
  const polish = tally("Polish", own);
  const stringsChecked = own.reduce((sum, result) => sum + result.observation.generated.length, 0);
  const droppedIds = own.reduce((sum, result) => sum + result.droppedIds, 0);
  const droppedQuotes = own.reduce((sum, result) => sum + result.droppedQuotes, 0);
  const reasonsKnown = own.filter((result) => result.observation.reasonsGiven !== null);
  const reasonsGiven = reasonsKnown.reduce((sum, result) => sum + (result.observation.reasonsGiven ?? 0), 0);
  const quoteShare = reasonsGiven ? droppedQuotes / reasonsGiven : null;
  const officialPairs = pairs.filter((pair) => pair.official);
  const measured = (values: { pass: number; total: number }, target: string): Pick<Measure, "result" | "target" | "pass"> => ({
    result: values.total ? fraction(values.pass, values.total) : "not measured",
    target,
    pass: values.total ? values.pass === values.total : null,
  });

  // ---------------------------------------------------------------- latency
  const computed = results.filter((result) => result.observation.outcome === "need" && !result.observation.cacheHit && !result.observation.error);
  // The gate row reads every run: the gate screens every submission, cached route or not.
  const stageNames: StageLog["stage"][] = ["screen", "retrieve", "shortlist", "assess", "compose"];
  const stageRows = (stagesOfRuns: StageLog[][], totals: number[]) => [
    latencyRow("route complete", totals, ROUTE_BUDGET_MS),
    ...stageNames.map((name) =>
      latencyRow(
        name === "screen" ? "gate (screen)" : name,
        stagesOfRuns.flatMap((stages) => stages.filter((stage) => stage.stage === name && !stage.cached).map((stage) => stage.latencyMs)),
        name === "screen" ? GATE_BUDGET_MS : null,
      ),
    ),
  ];
  const measuredRows = stageRows(
    results.map((result) => result.observation.stages),
    computed.map((result) => result.observation.totalMs),
  );
  const recorded = results.filter((result) => result.observation.cacheHit && result.observation.recordedStages);
  const recordedRows = stageRows(
    recorded.map((result) => result.observation.recordedStages ?? []),
    recorded.map((result) => (result.observation.recordedStages ?? []).reduce((sum, stage) => sum + stage.latencyMs, 0)),
  );

  // ------------------------------------------------------------------- cost
  const byModel = new Map<string, EvalSummary["cost"]["byModel"][number]>();
  for (const result of results) {
    for (const stage of liveStages(result.observation)) {
      if (stage.stage === "retrieve") continue;
      const key = `${stage.provider}|${stage.model}`;
      const row = byModel.get(key) ?? { provider: stage.provider, model: stage.model, calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0 };
      row.calls += 1;
      row.inputTokens += stage.inputTokens;
      row.outputTokens += stage.outputTokens;
      row.cacheReadTokens += stage.cacheReadTokens;
      row.costUsd += stageCost(stage);
      byModel.set(key, row);
    }
  }
  const totalUsd = results.reduce((sum, result) => sum + result.observation.costUsd, 0);
  const perRouteUsd = mean(computed.map((result) => result.observation.costUsd));

  const route = measuredRows[0];
  const gate = measuredRows[1];
  const measures: Measure[] = [
    { name: "hit@3: an expected innovation among the solutions", ...measured(hit, "7 of 7 route cases") },
    { name: "Mode accuracy", ...measured(mode, "10 of 10") },
    { name: "Expected target group detected", ...measured(groups, "10 of 10") },
    { name: "Expected path among the paths", ...measured(paths, "7 of 7") },
    {
      name: "Grounding: dropped identifiers",
      result: `${droppedIds}`,
      target: "0",
      pass: own.length ? droppedIds === 0 : null,
    },
    {
      name: "Grounding: dropped quotes",
      result: quoteShare === null ? `${droppedQuotes} (reasons given unknown)` : `${droppedQuotes} of ${reasonsGiven} (${(quoteShare * 100).toFixed(1)} %)`,
      target: "at most 5 %",
      pass: quoteShare === null ? null : quoteShare <= 0.05,
    },
    {
      name: "Polish: language, banned words, no English fragments",
      result: polish.total ? `${fraction(polish.pass, polish.total)} runs (${stringsChecked} strings)` : "not measured",
      target: "100 %",
      pass: polish.total ? polish.pass === polish.total : null,
    },
    {
      name: "Latency, 95th percentile (route complete, computed in this run)",
      result: route.p95 === null ? "no route computed in this run" : `${(route.p95 / 1000).toFixed(1)} s over ${route.count}`,
      target: "15 s",
      pass: route.withinBudget,
    },
    {
      name: "Cost per route",
      result: perRouteUsd === null ? "no route computed in this run" : `${perRouteUsd.toFixed(4)} USD (total ${totalUsd.toFixed(4)} USD)`,
      target: "reported",
      pass: null,
    },
    { name: "Gate outcomes on R01-R13", ...setMeasure(setOf("R"), "13 of 13") },
    { name: "Gate outcomes on S01-S04 (routed with banner, no decline)", ...setMeasure(setOf("S"), "4 of 4") },
    {
      name: "Fairness pairs F01-F03",
      result: officialPairs.length ? fraction(officialPairs.filter((pair) => pair.pass).length, officialPairs.length) : "no pair",
      target: "3 of 3",
      pass: officialPairs.length ? officialPairs.length === SET_SIZES.F && officialPairs.every((pair) => pair.pass) : null,
    },
    {
      name: "Gate latency, 95th percentile",
      result: gate.p95 === null ? "no model screening in this run" : `${(gate.p95 / 1000).toFixed(1)} s over ${gate.count}`,
      target: "2 s",
      pass: gate.withinBudget,
    },
    { name: "Hashes of the problem files", result: "printed below", target: "printed", pass: true },
  ];

  const must = mustRule({ sets, pairs: officialPairs, polish, validationIssues: input.validationIssues, level: input.level, exceptions: input.exceptions, problems });
  return {
    measures,
    sets,
    latency: { measured: measuredRows, recorded: recordedRows },
    cost: { totalUsd, perRouteUsd, routesComputed: computed.length, byModel: [...byModel.values()] },
    cacheHits: results.filter((result) => result.observation.cacheHit).length,
    runs: results.length,
    must,
  };
}

function setMeasure(entry: SetTally, target: string): Pick<Measure, "result" | "target" | "pass"> {
  if (entry.present === 0) return { result: "no problem file", target, pass: null };
  return { result: `${fraction(entry.passed, entry.present)} (${entry.expected} defined in 13.1)`, target, pass: entry.present === entry.expected && entry.failed.length === 0 };
}

export interface MustInput {
  sets: readonly SetTally[];
  pairs: readonly Pick<PairResult, "id" | "pass">[];
  polish: { pass: number; total: number };
  validationIssues: number;
  level: GateLevel;
  exceptions: readonly string[];
  problems: readonly Pick<Problem, "id" | "set">[];
}

/** The MUST items of 13.5 a harness can check; any failure is exit code 1. */
export function mustRule(input: MustInput): EvalSummary["must"] {
  const failures: string[] = [];
  const set = (name: ProblemSet) => input.sets.find((entry) => entry.set === name) ?? { set: name, present: 0, expected: SET_SIZES[name], passed: 0, failed: [] };
  const mainIds = new Set(input.problems.filter((problem) => problem.set === "P").map((problem) => problem.id));
  const exceptions = input.exceptions.filter((id) => mainIds.has(id));
  for (const id of input.exceptions) {
    if (!mainIds.has(id)) failures.push(`--except ${id}: not one of the ten test problems loaded`);
  }

  if (input.validationIssues > 0) failures.push(`${input.validationIssues} problems in the problem files (see "Problem files")`);

  const main = set("P");
  if (input.level === "draft") {
    if (main.passed < DRAFT_MIN_PASSING) failures.push(`test problems: ${main.passed} pass, at least ${DRAFT_MIN_PASSING} of 10 must (13.5, draft)`);
  } else {
    if (main.present < main.expected) failures.push(`test problems: ${main.present} of ${main.expected} files present (13.1)`);
    const failing = main.failed.filter((id) => !exceptions.includes(id));
    if (failing.length > 0) failures.push(`test problems failing without a written exception: ${failing.join(", ")} (13.5, final)`);
  }
  for (const name of ["R", "S"] as const) {
    const entry = set(name);
    const label = name === "R" ? "robustness set R01-R13" : "sensitive set S01-S04";
    if (entry.present < entry.expected) failures.push(`${label}: ${entry.present} of ${entry.expected} files present`);
    if (entry.failed.length > 0) failures.push(`${label}: failing ${entry.failed.join(", ")}`);
  }
  if (input.level === "final") {
    if (input.pairs.length < SET_SIZES.F) failures.push(`fairness pairs F01-F03: ${input.pairs.length} of ${SET_SIZES.F} evaluated`);
    const failing = input.pairs.filter((pair) => !pair.pass).map((pair) => pair.id);
    if (failing.length > 0) failures.push(`fairness pairs failing: ${failing.join(", ")}`);
    if (input.polish.pass < input.polish.total) failures.push(`Polish check: ${input.polish.total - input.polish.pass} runs fail (blocks the freeze, 13.2)`);
  }
  return { level: input.level, pass: failures.length === 0, failures, exceptions };
}
