import type { RoleCode } from "@/lib/contracts";
import { mean } from "./stats";
import type { PairKind, Problem } from "./problems";
import type { Observation, ProblemResult } from "./types";

/*
 * The fairness checks of FR-12.11 and 13.1 (F01-F03). The format of 13.1
 * has one text per file and no way to write a pair, so the harness derives
 * the second run where the pair is the same text:
 *
 * - role (F01, "a"): the text as mieszkaniec and as urzad-gminy; the
 *   file's own run counts for its role, the other is derived. Pass: the
 *   same solutions (the set of ids; the paths may differ).
 * - place (F02, "b"): the file's gmina and a gmina of the other setting,
 *   Kraków for a rural or mixed gmina and Radziemice (gmina wiejska) for
 *   an urban one. Pass: best fits within FIT_TOLERANCE points.
 * - target group (F03, "c"): two different texts (cudzoziemcy against
 *   seniorzy), so the file names the other file in `pair_with`. Pass: best
 *   fits within FIT_TOLERANCE points.
 *
 * The kind comes from `pair`, else from the id (F01 role, F02 place, F03
 * target group, as in 13.1). With --fairness-all every route case of the
 * ten also gets the role and the place pair, as diagnostics.
 */

export const FIT_TOLERANCE = 10;
/** 13.1 F02 compares a rural gmina with Kraków. */
export const URBAN_TERC = "1261011";
/** Radziemice, gmina wiejska (powiat proszowicki): the rural side for an urban problem. */
export const RURAL_TERC = "1214062";
export const ROLE_PAIR: readonly [RoleCode, RoleCode] = ["mieszkaniec", "urzad-gminy"];

export interface PlannedRun {
  problem: Problem;
  variant: string;
  role: RoleCode | null;
  placeTerc: string | null;
  /** A variant the harness made up: scored as diagnostics only. */
  derived: boolean;
}

export interface PairPlan {
  /** e.g. "F01", or "P03/role" for --fairness-all. */
  id: string;
  kind: PairKind;
  /** The official pairs of 13.1 count for the exit code; the --fairness-all ones do not. */
  official: boolean;
  a: { problemId: string; variant: string; label: string };
  b: { problemId: string; variant: string; label: string };
}

export interface PairSkip {
  id: string;
  reason: string;
}

export function pairKindOf(problem: Problem): PairKind | null {
  if (problem.pair) return problem.pair;
  if (problem.set !== "F") return null;
  const number = problem.id.slice(0, 3);
  return number === "F01" ? "role" : number === "F02" ? "place" : number === "F03" ? "target_group" : null;
}

/** Urban for a gmina miejska; rural for a gmina wiejska or miejsko-wiejska (13.1 pairs a rural gmina with Kraków). */
export function counterpartTerc(kind: string | null): string {
  return kind === "gmina miejska" ? RURAL_TERC : URBAN_TERC;
}

export interface PlanOptions {
  fairnessAll?: boolean;
  /** The gmina kind of a TERC ("gmina wiejska", ...), null when unknown. */
  placeKind: (terc: string) => string | null;
}

export interface Plan {
  runs: PlannedRun[];
  pairs: PairPlan[];
  skipped: PairSkip[];
}

/** Every run the problems need: the base run of each, the repeats (R12), and the derived sides of the pairs. */
export function planRuns(problems: readonly Problem[], options: PlanOptions): Plan {
  const runs: PlannedRun[] = [];
  const pairs: PairPlan[] = [];
  const skipped: PairSkip[] = [];
  const keys = new Set<string>();
  const addRun = (run: PlannedRun) => {
    const key = `${run.problem.id}|${run.variant}`;
    if (!keys.has(key)) {
      keys.add(key);
      runs.push(run);
    }
  };
  const base = (problem: Problem) => ({ problemId: problem.id, variant: "base" });

  for (const problem of problems) {
    addRun({ problem, variant: "base", role: problem.role, placeTerc: problem.placeTerc, derived: false });
    for (let n = 2; n <= problem.repeat; n++) {
      addRun({ problem, variant: `repeat:${n}`, role: problem.role, placeTerc: problem.placeTerc, derived: false });
    }
  }

  const rolePair = (problem: Problem, id: string, official: boolean) => {
    const side = (role: RoleCode) => {
      if (problem.role === role) return { ...base(problem), label: role };
      const variant = `role:${role}`;
      addRun({ problem, variant, role, placeTerc: problem.placeTerc, derived: true });
      return { problemId: problem.id, variant, label: role };
    };
    pairs.push({ id, kind: "role", official, a: side(ROLE_PAIR[0]), b: side(ROLE_PAIR[1]) });
  };
  const placePair = (problem: Problem, id: string, official: boolean) => {
    if (!problem.placeTerc) {
      skipped.push({ id, reason: "the problem has no place, so there is no other setting to compare" });
      return;
    }
    const kind = options.placeKind(problem.placeTerc);
    const other = counterpartTerc(kind);
    const variant = `place:${other}`;
    addRun({ problem, variant, role: problem.role, placeTerc: other, derived: true });
    pairs.push({
      id,
      kind: "place",
      official,
      a: { ...base(problem), label: `${problem.placeTerc} (${kind ?? "unknown kind"})` },
      b: { problemId: problem.id, variant, label: `${other} (${options.placeKind(other) ?? "unknown kind"})` },
    });
  };

  const counterparts = new Set(problems.flatMap((problem) => (problem.pairWith ? [problem.pairWith] : [])));
  for (const problem of problems) {
    const kind = pairKindOf(problem);
    if (!kind || counterparts.has(problem.id)) continue;
    if (kind === "role") rolePair(problem, problem.id, true);
    else if (kind === "place") placePair(problem, problem.id, true);
    else if (!problem.pairWith) skipped.push({ id: problem.id, reason: "a target-group pair needs the other text: name its file in pair_with" });
    else {
      const other = problems.find((candidate) => candidate.id === problem.pairWith);
      if (!other) skipped.push({ id: problem.id, reason: `pair_with ${problem.pairWith} is not among the loaded problems` });
      else pairs.push({ id: problem.id, kind, official: true, a: { ...base(problem), label: problem.id }, b: { ...base(other), label: other.id } });
    }
  }

  if (options.fairnessAll) {
    for (const problem of problems) {
      if (problem.set !== "P" || problem.expected.mode !== "route") continue;
      rolePair(problem, `${problem.id}/role`, false);
      placePair(problem, `${problem.id}/place`, false);
    }
  }
  return { runs, pairs, skipped };
}

// ------------------------------------------------------------- comparison

export interface PairResult {
  id: string;
  kind: PairKind;
  official: boolean;
  a: { label: string; solutions: string[]; bestFit: number | null; mode: string | null };
  b: { label: string; solutions: string[]; bestFit: number | null; mode: string | null };
  sameSolutions: boolean;
  fitDifference: number | null;
  pass: boolean;
  detail: string;
}

function side(label: string, observation: Observation | undefined) {
  return {
    label,
    solutions: observation?.solutions.map((solution) => solution.id) ?? [],
    bestFit: observation?.solutions[0]?.fit ?? null,
    mode: observation?.mode ?? null,
  };
}

/** One pair from its two runs; a run that failed or was not routed fails the pair. */
export function comparePair(plan: PairPlan, a: Observation | undefined, b: Observation | undefined): PairResult {
  const left = side(plan.a.label, a);
  const right = side(plan.b.label, b);
  const sameSolutions = [...left.solutions].sort().join("|") === [...right.solutions].sort().join("|");
  // No solution counts as a fit of 0: a need that is routed on one side only is a difference.
  const fitDifference = a && b ? Math.abs((left.bestFit ?? 0) - (right.bestFit ?? 0)) : null;
  const result = { id: plan.id, kind: plan.kind, official: plan.official, a: left, b: right, sameSolutions, fitDifference };

  const broken = [a, b].find((observation) => !observation || observation.error || observation.outcome !== "need");
  if (!a || !b || broken) {
    const why = !a || !b ? "a run is missing" : broken?.error ? `a run failed: ${broken.error}` : `a run was not routed (outcome ${broken?.outcome})`;
    return { ...result, pass: false, detail: why };
  }
  if (plan.kind === "role") {
    return {
      ...result,
      pass: sameSolutions,
      detail: sameSolutions ? "the same solutions" : `different solutions: ${left.solutions.join(", ") || "none"} against ${right.solutions.join(", ") || "none"}`,
    };
  }
  const pass = (fitDifference ?? Infinity) <= FIT_TOLERANCE;
  return { ...result, pass, detail: `best fit ${left.bestFit ?? "none"} against ${right.bestFit ?? "none"}: difference ${fitDifference} (at most ${FIT_TOLERANCE})` };
}

// -------------------------------------------------------- per target group

export interface TargetGroupRow {
  group: string;
  /** Built records with this code (catalogue coverage). */
  records: number | null;
  problems: string[];
  passed: number;
  /** hit@3 over the problems that name expected innovations. */
  hits: number;
  hitCases: number;
  meanBestFit: number | null;
}

/** FR-12.11 "results reported per target group": each base run under every group its problem expects. */
export function perTargetGroup(results: readonly ProblemResult[], problems: readonly Problem[], coverage: ReadonlyMap<string, number>): TargetGroupRow[] {
  const byId = new Map(problems.map((problem) => [problem.id, problem]));
  const rows = new Map<string, TargetGroupRow & { fits: number[] }>();
  for (const result of results) {
    const problem = byId.get(result.problemId);
    if (!problem || result.variant !== "base" || problem.expected.outcome !== "need") continue;
    const groups = problem.expected.targetGroups.length ? problem.expected.targetGroups : ["(none named)"];
    for (const group of groups) {
      const row = rows.get(group) ?? { group, records: coverage.get(group) ?? null, problems: [], passed: 0, hits: 0, hitCases: 0, meanBestFit: null, fits: [] };
      row.problems.push(problem.id);
      if (result.pass) row.passed += 1;
      const hit = result.checks.find((check) => check.name === "hit@3");
      if (hit) {
        row.hitCases += 1;
        if (hit.pass) row.hits += 1;
      }
      const best = result.observation.solutions[0]?.fit;
      if (best !== undefined) row.fits.push(best);
      rows.set(group, row);
    }
  }
  return [...rows.values()]
    .map(({ fits, ...row }) => ({ ...row, meanBestFit: mean(fits) }))
    .sort((a, b) => a.group.localeCompare(b.group));
}
