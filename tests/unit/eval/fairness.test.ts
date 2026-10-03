import { describe, expect, it } from "vitest";
import { comparePair, counterpartTerc, perTargetGroup, planRuns, RURAL_TERC, URBAN_TERC, type PairPlan } from "@/server/eval/fairness";
import { scoreRun } from "@/server/eval/score";
import { observation, problem } from "./helpers";

/* The fairness checks of FR-12.11: the derived runs, the comparisons and the table per target group. */

const KINDS: Record<string, string> = { "1214062": "gmina wiejska", "1261011": "gmina miejska", "1216143": "gmina miejsko-wiejska" };
const placeKind = (terc: string) => KINDS[terc] ?? null;

describe("planRuns", () => {
  it("derives the other role for F01 and reuses the file's own run for its role", () => {
    const f01 = problem({ id: "F01", set: "F", role: "mieszkaniec" });
    const plan = planRuns([f01], { placeKind });
    expect(plan.runs.map((run) => run.variant)).toEqual(["base", "role:urzad-gminy"]);
    expect(plan.runs[1]).toMatchObject({ role: "urzad-gminy", derived: true, placeTerc: f01.placeTerc });
    expect(plan.pairs).toEqual([
      {
        id: "F01",
        kind: "role",
        official: true,
        a: { problemId: "F01", variant: "base", label: "mieszkaniec" },
        b: { problemId: "F01", variant: "role:urzad-gminy", label: "urzad-gminy" },
      },
    ]);
  });

  it("derives Kraków for a rural F02 and a rural gmina for an urban one", () => {
    expect(counterpartTerc("gmina wiejska")).toBe(URBAN_TERC);
    expect(counterpartTerc("gmina miejsko-wiejska")).toBe(URBAN_TERC);
    expect(counterpartTerc("gmina miejska")).toBe(RURAL_TERC);
    const plan = planRuns([problem({ id: "F02", set: "F", placeTerc: "1214062" })], { placeKind });
    expect(plan.runs[1]).toMatchObject({ variant: `place:${URBAN_TERC}`, placeTerc: URBAN_TERC, derived: true });
    expect(plan.pairs[0].b.label).toBe(`${URBAN_TERC} (gmina miejska)`);
  });

  it("pairs F03 with the file named in pair_with, and skips it without one", () => {
    const f03 = problem({ id: "F03", set: "F", pairWith: "F03b" });
    const f03b = problem({ id: "F03b", set: "F" });
    const plan = planRuns([f03, f03b], { placeKind });
    expect(plan.pairs).toHaveLength(1);
    expect(plan.pairs[0]).toMatchObject({ kind: "target_group", a: { problemId: "F03" }, b: { problemId: "F03b" } });
    expect(planRuns([problem({ id: "F03", set: "F" })], { placeKind }).skipped[0].reason).toMatch(/pair_with/);
  });

  it("adds the repeats of R12, and the pairs of every route case with --fairness-all", () => {
    const plan = planRuns([problem({ id: "R12", set: "R", repeat: 3, expected: { mode: null, outcome: "off_topic" } }), problem()], { placeKind, fairnessAll: true });
    expect(plan.runs.map((run) => `${run.problem.id} ${run.variant}`)).toEqual([
      "R12 base",
      "R12 repeat:2",
      "R12 repeat:3",
      "P01 base",
      "P01 role:mieszkaniec",
      "P01 role:urzad-gminy",
      `P01 place:${URBAN_TERC}`,
    ]);
    expect(plan.pairs.map((pair) => [pair.id, pair.official])).toEqual([
      ["P01/role", false],
      ["P01/place", false],
    ]);
  });
});

describe("comparePair", () => {
  const rolePlan: PairPlan = { id: "F01", kind: "role", official: true, a: { problemId: "F01", variant: "base", label: "mieszkaniec" }, b: { problemId: "F01", variant: "role:urzad-gminy", label: "urzad-gminy" } };
  const placePlan: PairPlan = { ...rolePlan, id: "F02", kind: "place" };

  it("role: the same set of solutions passes, in any order; another set fails", () => {
    const a = observation({ solutions: [{ id: "inn-a", fit: 80 }, { id: "inn-b", fit: 70 }] });
    expect(comparePair(rolePlan, a, observation({ solutions: [{ id: "inn-b", fit: 75 }, { id: "inn-a", fit: 72 }] })).pass).toBe(true);
    const other = comparePair(rolePlan, a, observation({ solutions: [{ id: "inn-a", fit: 80 }] }));
    expect(other).toMatchObject({ pass: false, sameSolutions: false });
  });

  it("place: best fits within ten points pass; more, or no solution on one side, fail", () => {
    expect(comparePair(placePlan, observation({ solutions: [{ id: "inn-a", fit: 80 }] }), observation({ solutions: [{ id: "inn-c", fit: 70 }] }))).toMatchObject({ pass: true, fitDifference: 10 });
    expect(comparePair(placePlan, observation({ solutions: [{ id: "inn-a", fit: 80 }] }), observation({ solutions: [{ id: "inn-a", fit: 69 }] })).pass).toBe(false);
    expect(comparePair(placePlan, observation({ solutions: [{ id: "inn-a", fit: 80 }] }), observation({ mode: "none", solutions: [] })).fitDifference).toBe(80);
  });

  it("fails when a side failed, was not routed or is missing", () => {
    expect(comparePair(placePlan, observation(), observation({ error: "unavailable" })).detail).toMatch(/failed/);
    expect(comparePair(placePlan, observation(), observation({ outcome: "declined" })).detail).toMatch(/not routed/);
    expect(comparePair(placePlan, observation(), undefined).detail).toMatch(/missing/);
  });
});

describe("perTargetGroup", () => {
  it("reports each base run under every group its problem expects, with the catalogue coverage", () => {
    const seniors = problem();
    const foreigners = problem({ id: "P02", expected: { targetGroups: ["cudzoziemcy", "dzieci-mlodziez-rodziny"], anyOf: ["inn-z"] } });
    const results = [
      scoreRun(seniors, observation()),
      scoreRun(foreigners, observation({ problemId: "P02", solutions: [{ id: "inn-y", fit: 50 }] })),
      scoreRun(seniors, observation({ variant: "role:mieszkaniec" }), { derived: true }),
    ];
    const rows = perTargetGroup(results, [seniors, foreigners], new Map([["seniorzy", 103], ["cudzoziemcy", 15]]));
    expect(rows.map((row) => row.group)).toEqual(["cudzoziemcy", "dzieci-mlodziez-rodziny", "seniorzy"]);
    expect(rows[0]).toMatchObject({ records: 15, problems: ["P02"], passed: 0, hits: 0, hitCases: 1, meanBestFit: 50 });
    expect(rows[2]).toMatchObject({ records: 103, problems: ["P01"], passed: 1, hits: 1, meanBestFit: 82 });
  });
});
