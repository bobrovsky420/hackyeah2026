import type { StageLog } from "@/server/contracts";
import type { BannedWords } from "@/server/route/safety";
import { checkPolish } from "./polish";
import type { Outcome, Problem } from "./problems";
import type { Check, Observation, ProblemResult } from "./types";

/*
 * One run against its problem's expectations (13.1, 13.2). Pure: the
 * runner hands in an Observation, the report reads the checks. A problem
 * passes when every required check passes; a check that is unknown for
 * this run (a cache hit without the harness's own record of stage 1) does
 * not fail it, and the report lists it. Derived runs (the role and place
 * variants of the fairness checks) are scored as diagnostics only.
 */

/** 13.2: dropped quotes at most 5 %. */
export const MAX_DROPPED_QUOTE_SHARE = 0.05;

const GROUNDED_STAGES: readonly StageLog["stage"][] = ["shortlist", "assess", "compose"];

export interface ScoreOptions {
  /** A role or place variant of the fairness checks: nothing in it is required. */
  derived?: boolean;
  banned?: BannedWords;
}

/** The submission number of a "repeat:<n>" variant, else 1. */
export function submissionOf(variant: string): number {
  const match = /^repeat:(\d+)$/.exec(variant);
  return match ? Number(match[1]) : 1;
}

/** The outcome a run must have, or null when it is not checked (the first of several identical submissions, R12). */
export function expectedOutcomeFor(problem: Problem, variant: string): Outcome | null {
  if (problem.repeat > 1 && submissionOf(variant) === 1) return null;
  return problem.expected.outcome;
}

function lower(text: string): string {
  return text.normalize("NFC").toLocaleLowerCase("pl");
}

/**
 * Identifiers the grounding validation dropped because the model made them
 * up (13.2: target 0), and dropped quotes. The assess stage also lists the
 * candidates it dropped for want of a grounded reason; those are stage 1
 * ids, not invented ones, so they count as `ungrounded` instead.
 */
export function groundingOf(observation: Observation): { droppedIds: number; droppedQuotes: number; ungrounded: number } {
  const stages = observation.cacheHit ? (observation.recordedStages ?? []) : observation.stages;
  const grounded = stages.filter((stage) => GROUNDED_STAGES.includes(stage.stage));
  const stage1 = new Set(observation.stage1Ids ?? []);
  let droppedIds = 0;
  let ungrounded = 0;
  for (const stage of grounded) {
    for (const id of stage.droppedIds) {
      if (stage.stage === "assess" && stage1.has(id)) ungrounded += 1;
      else droppedIds += 1;
    }
  }
  return { droppedIds, droppedQuotes: grounded.reduce((sum, stage) => sum + stage.droppedReasons, 0), ungrounded };
}

export function scoreRun(problem: Problem, observation: Observation, options: ScoreOptions = {}): ProblemResult {
  const expected = problem.expected;
  const checks: Check[] = [];
  const required = !options.derived;
  const add = (name: string, isRequired: boolean, pass: boolean | null, detail: string) =>
    checks.push({ name, required: required && isRequired, pass, detail });
  const list = (ids: readonly string[]) => (ids.length ? ids.join(", ") : "none");

  const retrievalRanks: Record<string, number | null> = {};
  for (const id of expected.anyOf) {
    const index = observation.retrievedIds?.indexOf(id) ?? -1;
    retrievalRanks[id] = index >= 0 ? index + 1 : null;
  }
  const { droppedIds, droppedQuotes, ungrounded } = groundingOf(observation);

  const outcome = expectedOutcomeFor(problem, observation.variant);
  if (observation.error) {
    add("gate outcome", true, false, `the pipeline failed: ${observation.error}`);
    return { problemId: problem.id, variant: observation.variant, pass: false, checks, retrievalRanks, droppedIds, droppedQuotes, observation };
  }
  if (outcome) {
    add("gate outcome", true, observation.outcome === outcome, `expected ${outcome}, got ${observation.outcome}`);
  } else {
    add("gate outcome", false, null, `first of ${problem.repeat} identical submissions: ${observation.outcome}, not checked`);
  }
  if (expected.crisisBanner !== null) {
    add("crisis banner", true, observation.crisisBanner === expected.crisisBanner, `expected ${expected.crisisBanner ? "shown" : "absent"}, got ${observation.crisisBanner ? "shown" : "absent"}`);
  }
  if (expected.redactions !== null) {
    add("redactions", true, observation.redactions === expected.redactions, `expected ${expected.redactions}, got ${observation.redactions}`);
  }

  const routed = observation.outcome === "need";
  const routeChecks = outcome === "need" || (outcome === null && routed);
  if (routeChecks && !routed) {
    add("route", true, null, "not checked: the gate stopped the text");
  } else if (routeChecks) {
    const solutionIds = observation.solutions.map((solution) => solution.id);
    if (expected.mode === "clarification") {
      add("mode", true, observation.clarificationNeeded, `expected the clarifying question (FR-2.3), got ${observation.clarificationNeeded ? "it" : `mode ${observation.mode} without it`}`);
    } else if (expected.mode) {
      add("mode", true, observation.mode === expected.mode, `expected ${expected.mode}, got ${observation.mode}`);
    }
    if (expected.anyOf.length > 0) {
      const hits = expected.anyOf.filter((id) => solutionIds.includes(id));
      add("hit@3", true, hits.length > 0, hits.length ? `found ${list(hits)}` : `none of ${list(expected.anyOf)} among ${list(solutionIds)}`);
    }
    if (expected.noneOf.length > 0) {
      const wrong = expected.noneOf.filter((id) => solutionIds.includes(id));
      add("none of", true, wrong.length === 0, wrong.length ? `shown although excluded: ${list(wrong)}` : "none shown");
    }
    if (expected.targetGroups.length > 0) {
      const detected = observation.detectedTargetGroups;
      if (detected === null) {
        add("target groups", true, null, "unknown: a cached route without the harness's record of stage 1 (rerun with --no-cache)");
      } else {
        const missing = expected.targetGroups.filter((group) => !detected.includes(group));
        add("target groups", true, missing.length === 0, missing.length ? `missing ${list(missing)}; detected ${list(detected)}` : `detected ${list(detected)}`);
      }
    }
    if (expected.pathsAnyOf.length > 0) {
      const hits = expected.pathsAnyOf.filter((id) => observation.pathIds.includes(id));
      add("paths", true, hits.length > 0, hits.length ? `found ${list(hits)}` : `none of ${list(expected.pathsAnyOf)} among ${list(observation.pathIds)}`);
    }
    if (expected.peopleRoles.length > 0) {
      const missing = expected.peopleRoles.filter((role) => !observation.peopleRoles.includes(role));
      add("people", true, missing.length === 0, missing.length ? `missing ${list(missing)}` : `present ${list(expected.peopleRoles)}`);
    }
    if (expected.summaryMustMention.length > 0) {
      const summary = lower(observation.summary ?? "");
      const missing = expected.summaryMustMention.filter((stem) => !summary.includes(lower(stem)));
      add("summary mentions", true, missing.length === 0, observation.summary === null ? "no summary (the compose call failed or was dropped)" : missing.length ? `missing ${list(missing)}` : "all present");
    }

    if (expected.anyOf.length > 0 && observation.retrievedIds) {
      const ranks = expected.anyOf.map((id) => `${id} ${retrievalRanks[id] ?? "absent"}`);
      add("retrieved (40)", false, expected.anyOf.some((id) => retrievalRanks[id] !== null), ranks.join("; "));
    }
    if (expected.anyOf.length > 0) {
      const stage1 = observation.stage1Ids;
      add(
        "stage 1",
        false,
        stage1 === null ? null : expected.anyOf.some((id) => stage1.includes(id)),
        stage1 === null ? "unknown (cached route)" : `${list(expected.anyOf.filter((id) => stage1.includes(id)))} of ${stage1.length} candidates`,
      );
    }
    add("dropped ids", false, droppedIds === 0, `${droppedIds} invented${ungrounded ? `; ${ungrounded} candidates without a grounded reason` : ""}`);
    const given = observation.reasonsGiven;
    const share = given ? droppedQuotes / given : 0;
    add(
      "dropped quotes",
      false,
      given === null ? null : share <= MAX_DROPPED_QUOTE_SHARE,
      given === null ? `${droppedQuotes} (reasons given unknown)` : `${droppedQuotes} of ${given} (${(share * 100).toFixed(1)} %)`,
    );
  }

  const polish = checkPolish(observation.generated, options.banned);
  if (observation.generated.length > 0) {
    add(
      "Polish",
      true,
      polish.length === 0,
      polish.length ? polish.map((issue) => `${issue.field}: ${issue.kind}`).join("; ") : `${observation.generated.length} strings`,
    );
  }

  const pass = checks.every((check) => !check.required || check.pass !== false);
  return { problemId: problem.id, variant: observation.variant, pass, checks, retrievalRanks, droppedIds, droppedQuotes, observation };
}
