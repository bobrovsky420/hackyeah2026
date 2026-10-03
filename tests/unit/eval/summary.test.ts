import { describe, expect, it } from "vitest";
import { parseArgs, UsageError } from "@/server/eval/args";
import type { Problem, ProblemSet } from "@/server/eval/problems";
import { scoreRun } from "@/server/eval/score";
import { latencyRow, percentile } from "@/server/eval/stats";
import { mustRule, summarise, type SetTally } from "@/server/eval/summary";
import { observation, problem, stage } from "./helpers";

/* The percentile math, the exit rule of 13.5 and the command lines of 9.6. */

describe("percentile (nearest rank)", () => {
  it("takes the value at rank ceil(p/100 * n)", () => {
    const values = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6];
    expect(percentile(values, 50)).toBe(5);
    expect(percentile(values, 95)).toBe(10);
    expect(percentile(values, 90)).toBe(9);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 95)).toBeNull();
    expect(percentile(Array.from({ length: 20 }, (_, i) => i + 1), 95)).toBe(19);
  });

  it("rejects a percentile outside (0, 100]", () => {
    expect(() => percentile([1], 0)).toThrow(RangeError);
    expect(() => percentile([1], 101)).toThrow(RangeError);
  });

  it("compares p95 with the budget", () => {
    expect(latencyRow("route", [9000, 16000], 15000)).toMatchObject({ p50: 9000, p95: 16000, withinBudget: false });
    expect(latencyRow("route", [9000], 15000).withinBudget).toBe(true);
    expect(latencyRow("route", [], 15000).withinBudget).toBeNull();
  });
});

function sets(entries: Partial<Record<ProblemSet, { present: number; failed?: string[] }>>): SetTally[] {
  const sizes = { P: 10, R: 12, S: 4, F: 3 } as const;
  return (["P", "R", "S", "F"] as const).map((set) => {
    const entry = entries[set] ?? { present: 0 };
    const failed = entry.failed ?? [];
    return { set, present: entry.present, expected: sizes[set], passed: entry.present - failed.length, failed };
  });
}

const PROBLEMS: Pick<Problem, "id" | "set">[] = Array.from({ length: 10 }, (_, i) => ({ id: `P${String(i + 1).padStart(2, "0")}`, set: "P" }));
const COMPLETE = { P: { present: 10 }, R: { present: 12 }, S: { present: 4 }, F: { present: 3 } };
const PAIRS = [
  { id: "F01", pass: true },
  { id: "F02", pass: true },
  { id: "F03", pass: true },
];

describe("mustRule (13.5)", () => {
  it("passes the final gate when everything is present and passing", () => {
    const rule = mustRule({ sets: sets(COMPLETE), pairs: PAIRS, polish: { pass: 10, total: 10 }, validationIssues: 0, level: "final", exceptions: [], problems: PROBLEMS });
    expect(rule).toMatchObject({ pass: true, failures: [] });
  });

  it("final: a failing test problem fails unless it is a written exception", () => {
    const input = { sets: sets({ ...COMPLETE, P: { present: 10, failed: ["P03"] } }), pairs: PAIRS, polish: { pass: 10, total: 10 }, validationIssues: 0, level: "final" as const, problems: PROBLEMS };
    expect(mustRule({ ...input, exceptions: [] }).failures).toEqual(["test problems failing without a written exception: P03 (13.5, final)"]);
    expect(mustRule({ ...input, exceptions: ["P03"] })).toMatchObject({ pass: true, exceptions: ["P03"] });
    expect(mustRule({ ...input, exceptions: ["P03", "P99"] }).failures).toEqual(["--except P99: not one of the ten test problems loaded"]);
  });

  it("draft: six of ten suffice, but R and S must be complete and pass; fairness and Polish wait for the final", () => {
    const draft = { pairs: [], polish: { pass: 0, total: 3 }, validationIssues: 0, level: "draft" as const, exceptions: [], problems: PROBLEMS };
    expect(mustRule({ ...draft, sets: sets({ ...COMPLETE, P: { present: 10, failed: ["P01", "P02", "P03", "P04"] } }) }).pass).toBe(true);
    expect(mustRule({ ...draft, sets: sets({ ...COMPLETE, P: { present: 10, failed: ["P01", "P02", "P03", "P04", "P05"] } }) }).failures).toEqual([
      "test problems: 5 pass, at least 6 of 10 must (13.5, draft)",
    ]);
    expect(mustRule({ ...draft, sets: sets({ ...COMPLETE, R: { present: 11 } }) }).failures).toEqual(["robustness set R01-R12: 11 of 12 files present"]);
    expect(mustRule({ ...draft, sets: sets({ ...COMPLETE, S: { present: 4, failed: ["S02"] } }) }).failures).toEqual(["sensitive set S01-S04: failing S02"]);
  });

  it("final: missing or failing fairness pairs, a failing Polish check and invalid files fail", () => {
    const failures = mustRule({
      sets: sets(COMPLETE),
      pairs: [{ id: "F01", pass: false }],
      polish: { pass: 9, total: 10 },
      validationIssues: 2,
      level: "final",
      exceptions: [],
      problems: PROBLEMS,
    }).failures;
    expect(failures).toEqual([
      '2 problems in the problem files (see "Problem files")',
      "fairness pairs F01-F03: 1 of 3 evaluated",
      "fairness pairs failing: F01",
      "Polish check: 1 runs fail (blocks the freeze, 13.2)",
    ]);
  });
});

describe("summarise", () => {
  it("measures hit@3, the mode and the latency and cost of computed routes only", () => {
    const p1 = problem();
    const p2 = problem({ id: "P02" });
    const results = [
      scoreRun(p1, observation({ totalMs: 9000, costUsd: 0.002 })),
      scoreRun(p2, observation({ problemId: "P02", mode: "partial", solutions: [{ id: "inn-z", fit: 50 }], cacheHit: true, totalMs: 900, costUsd: 0, stages: [stage("screen", { latencyMs: 900 })] })),
    ];
    const summary = summarise({ problems: [p1, p2], results, pairs: [], validationIssues: 0, level: "draft", exceptions: [] });
    const measure = (name: string) => summary.measures.find((item) => item.name.startsWith(name));
    expect(measure("hit@3")).toMatchObject({ result: "1 of 2", pass: false });
    expect(measure("Mode accuracy")).toMatchObject({ result: "1 of 2" });
    expect(summary.latency.measured[0]).toMatchObject({ name: "route complete", count: 1, p95: 9000 });
    expect(summary.latency.measured[1]).toMatchObject({ name: "gate (screen)", count: 2 });
    expect(summary.cost.perRouteUsd).toBeCloseTo(0.002);
    expect(summary.cacheHits).toBe(1);
    expect(summary.sets.find((set) => set.set === "P")).toMatchObject({ present: 2, passed: 1, failed: ["P02"] });
  });
});

describe("parseArgs", () => {
  it("reads the flags of pnpm eval", () => {
    const args = parseArgs(["--provider", "replay", "--problems=.local/eval-draft", "--no-cache", "--gate", "draft", "--except", "P03, P07", "--concurrency", "2", "--", "--no-run-id"], "eval");
    expect(args).toMatchObject({ provider: "replay", problemsDir: ".local/eval-draft", noCache: true, gate: "draft", exceptions: ["P03", "P07"], concurrency: 2, runTag: false });
  });

  it("refuses unknown flags, bad values and the flags of the other command", () => {
    expect(() => parseArgs(["--provider", "openai"], "eval")).toThrow(UsageError);
    expect(() => parseArgs(["--concurrency", "0"], "eval")).toThrow(UsageError);
    expect(() => parseArgs(["--problems"], "eval")).toThrow(UsageError);
    expect(() => parseArgs(["--refresh"], "eval")).toThrow(UsageError);
    expect(() => parseArgs(["--no-cache"], "cache:warm")).toThrow(UsageError);
    expect(parseArgs(["--refresh"], "cache:warm").refresh).toBe(true);
  });
});
