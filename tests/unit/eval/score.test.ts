import { describe, expect, it } from "vitest";
import { polishIssues } from "@/server/eval/polish";
import { expectedOutcomeFor, scoreRun } from "@/server/eval/score";
import { BANNED, observation, problem, stage } from "./helpers";

/* The scoring of one run against its problem's expectations (13.1, 13.2). */

const byName = (result: ReturnType<typeof scoreRun>, name: string) => result.checks.find((check) => check.name === name);

describe("scoreRun", () => {
  it("passes a route that meets every expectation, with the retrieval rank and stage 1 as diagnostics", () => {
    const result = scoreRun(problem(), observation(), { banned: BANNED });
    expect(result.pass).toBe(true);
    expect(result.checks.filter((check) => check.required).every((check) => check.pass)).toBe(true);
    expect(result.retrievalRanks).toEqual({ "inn-a": 2 });
    expect(byName(result, "retrieved (40)")).toMatchObject({ required: false, pass: true });
    expect(byName(result, "stage 1")).toMatchObject({ required: false, pass: true });
  });

  it("fails on the mode, hit@3, an excluded solution, a missing group, path, person or stem", () => {
    const result = scoreRun(
      problem(),
      observation({
        mode: "partial",
        solutions: [{ id: "inn-wrong", fit: 60 }],
        detectedTargetGroups: ["zdrowie"],
        pathIds: ["proo"],
        peopleRoles: [],
        summary: "Inne podsumowanie.",
      }),
      { banned: BANNED },
    );
    expect(result.pass).toBe(false);
    const failed = result.checks.filter((check) => check.pass === false).map((check) => check.name);
    expect(failed).toEqual(expect.arrayContaining(["mode", "hit@3", "none of", "target groups", "paths", "people", "summary mentions"]));
  });

  it("treats the clarification case as the question of FR-2.3, whatever the mode", () => {
    const clarification = problem({ placeTerc: null, expected: { mode: "clarification", anyOf: [], noneOf: [], targetGroups: [], pathsAnyOf: [], peopleRoles: [], summaryMustMention: [] } });
    expect(scoreRun(clarification, observation({ mode: "none", clarificationNeeded: true, solutions: [] })).pass).toBe(true);
    expect(scoreRun(clarification, observation({ mode: "none", clarificationNeeded: false, solutions: [] })).pass).toBe(false);
  });

  it("counts grounding drops from the shortlist, assess and compose stages only", () => {
    const result = scoreRun(
      problem(),
      observation({
        stages: [
          stage("retrieve", { droppedIds: ["guard-1", "guard-2"] }),
          stage("shortlist", { droppedIds: ["inn-unknown"] }),
          stage("assess", { droppedReasons: 1, droppedIds: ["inn-b"] }),
          stage("compose", { droppedIds: ["path-unknown"] }),
        ],
        reasonsGiven: 10,
      }),
    );
    // inn-b was a stage 1 candidate: dropped for want of a grounded reason, not invented.
    expect(result.droppedIds).toBe(2);
    expect(byName(result, "dropped ids")?.detail).toBe("2 invented; 1 candidates without a grounded reason");
    expect(result.droppedQuotes).toBe(1);
    expect(byName(result, "dropped ids")).toMatchObject({ required: false, pass: false });
    expect(byName(result, "dropped quotes")).toMatchObject({ pass: false, detail: "1 of 10 (10.0 %)" });
    // Diagnostics never fail a problem.
    expect(result.pass).toBe(true);
  });

  it("leaves stage 1 unknown on a cache hit without an evaluation record, without failing", () => {
    const result = scoreRun(problem(), observation({ cacheHit: true, stage1Ids: null, detectedTargetGroups: null, reasonsGiven: null, stages: [stage("screen")] }));
    expect(byName(result, "target groups")).toMatchObject({ pass: null });
    expect(result.pass).toBe(true);
  });

  it("checks the gate outcome of a robustness case and skips the route checks", () => {
    const crisis = problem({ id: "R01", set: "R", expected: { mode: null, outcome: "redirected" } });
    const redirected = observation({ outcome: "redirected", mode: "redirected", solutions: [], generated: [], pathIds: [] });
    const result = scoreRun(crisis, redirected);
    expect(result.pass).toBe(true);
    expect(result.checks.map((check) => check.name)).toEqual(["gate outcome"]);
    expect(scoreRun(crisis, observation()).pass).toBe(false);
  });

  it("checks the banner of the sensitive set and the redactions of R11", () => {
    const sensitive = problem({ id: "S01", set: "S", expected: { crisisBanner: true } });
    expect(byName(scoreRun(sensitive, observation({ crisisBanner: false })), "crisis banner")?.pass).toBe(false);
    const r11 = problem({ id: "R11", set: "R", expected: { redactions: 3, anyOf: [], noneOf: [], targetGroups: [], pathsAnyOf: [], peopleRoles: [], summaryMustMention: [], mode: null } });
    expect(scoreRun(r11, observation({ redactions: 3 })).pass).toBe(true);
    expect(scoreRun(r11, observation({ redactions: 2 })).pass).toBe(false);
  });

  it("checks R12's outcome from the second submission on", () => {
    const r12 = problem({ id: "R12", set: "R", repeat: 20, expected: { mode: null, outcome: "off_topic" } });
    expect(expectedOutcomeFor(r12, "base")).toBeNull();
    expect(expectedOutcomeFor(r12, "repeat:2")).toBe("off_topic");
    expect(scoreRun(r12, observation({ variant: "repeat:2", outcome: "off_topic", mode: "off_topic", generated: [] })).pass).toBe(true);
    expect(scoreRun(r12, observation({ variant: "repeat:3" })).pass).toBe(false);
  });

  it("fails a run whose pipeline failed", () => {
    const result = scoreRun(problem(), observation({ error: "route pipeline unavailable: timeout at assess" }));
    expect(result.pass).toBe(false);
    expect(result.checks[0].detail).toMatch(/timeout at assess/);
  });

  it("scores a derived fairness run as diagnostics only", () => {
    const result = scoreRun(problem(), observation({ variant: "role:mieszkaniec", mode: "none", solutions: [] }), { derived: true });
    expect(result.checks.every((check) => !check.required)).toBe(true);
    expect(result.pass).toBe(true);
  });

  it("fails the Polish check on a generated string", () => {
    const result = scoreRun(problem(), observation({ generated: [{ field: "summary_pl", text: "This is the summary for the need of the seniors in this gmina." }] }), { banned: BANNED });
    expect(byName(result, "Polish")).toMatchObject({ pass: false });
    expect(result.pass).toBe(false);
  });
});

describe("polishIssues", () => {
  it("passes ordinary Polish and flags banned words, English, leaked names and non-Polish text", () => {
    expect(polishIssues("Zacznij od rozmowy z ośrodkiem pomocy społecznej o świetlicy.", BANNED)).toEqual([]);
    expect(polishIssues("Osoby upośledzone potrzebują wsparcia w gminie.", BANNED)).toEqual(["banned:stigmatising"]);
    expect(polishIssues("Warto sprawdzić this solution and the costs.", BANNED)).toContain("english");
    expect(polishIssues("Zobacz pole summary_pl w rekordzie.", BANNED)).toContain("identifier");
    expect(polishIssues("Lorem ipsum dolor sit amet consectetur adipiscing elit.", BANNED)).toContain("not-polish");
    // Polish words that are English-looking stay Polish: "to", "on", "no", "we", "do", "by", "but", "was".
    expect(polishIssues("To on by was do nas we wsi zabrał, no to but kupił.", BANNED)).toEqual([]);
  });
});
