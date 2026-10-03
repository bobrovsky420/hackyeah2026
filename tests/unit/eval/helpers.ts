import type { StageLog } from "@/lib/contracts";
import type { Problem } from "@/server/eval/problems";
import type { Observation } from "@/server/eval/types";
import { parseBannedWords } from "@/server/route/safety";

/* Builders for the scoring and fairness tests: a problem and an observation with defaults that pass. */

export const BANNED = parseBannedWords('categories:\n  stigmatising:\n    - "upośledz*"\n');

export function problem(overrides: Partial<Omit<Problem, "expected">> & { expected?: Partial<Problem["expected"]> } = {}): Problem {
  const { expected, ...rest } = overrides;
  return {
    id: "P01",
    set: "P",
    file: "tests/problems/P01.yaml",
    sha256: "0".repeat(64),
    title: "Samotni seniorzy",
    author: "lawyer",
    writtenOn: "2026-09-30",
    role: "pracownik-instytucji",
    placeTerc: "1214062",
    text: "Tekst problemu.",
    notes: null,
    repeat: 1,
    sensitive: false,
    pair: null,
    pairWith: null,
    targetGroupsGiven: [],
    ...rest,
    expected: {
      mode: "route",
      outcome: "need",
      crisisBanner: null,
      redactions: null,
      anyOf: ["inn-a"],
      noneOf: ["inn-wrong"],
      targetGroups: ["seniorzy"],
      pathsAnyOf: ["cus-program-uslug"],
      peopleRoles: ["advisor"],
      summaryMustMention: ["świetlic"],
      ...expected,
    },
  };
}

export function stage(name: StageLog["stage"], overrides: Partial<StageLog> = {}): StageLog {
  return {
    stage: name,
    provider: "openai-compatible",
    model: "speakleash/Bielik-11B-v3.0-Instruct:publicai",
    promptVersion: `${name}-v1`,
    inputTokens: 1000,
    outputTokens: 200,
    cacheReadTokens: 0,
    latencyMs: 1000,
    cached: false,
    droppedIds: [],
    droppedReasons: 0,
    notes: [],
    ...overrides,
  };
}

export function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    problemId: "P01",
    variant: "base",
    input: { role: "pracownik-instytucji", placeTerc: "1214062", placeName: "Radziemice", placeKind: "gmina wiejska", targetGroups: [] },
    error: null,
    outcome: "need",
    mode: "route",
    clarificationNeeded: false,
    crisisBanner: false,
    redactions: 0,
    solutions: [
      { id: "inn-a", fit: 82 },
      { id: "inn-b", fit: 71 },
    ],
    pathIds: ["cus-program-uslug", "usluga-wrazliwa-b"],
    peopleRoles: ["advisor", "implementer_nearby"],
    summary: "Gmina może wykorzystać świetlicę wiejską na spotkania seniorów.",
    generated: [{ field: "summary_pl", text: "Gmina może wykorzystać świetlicę wiejską na spotkania seniorów." }],
    retrievedIds: ["inn-x", "inn-a", "inn-b"],
    retriever: { provider: "embedding-service", notes: [] },
    stage1Ids: ["inn-a", "inn-b"],
    detectedTargetGroups: ["seniorzy", "zdrowie"],
    reasonsGiven: 6,
    stages: [stage("screen", { latencyMs: 800 }), stage("retrieve", { provider: "embedding-service", model: "OPI-PIB/PolDense-400M", inputTokens: 0, outputTokens: 0, latencyMs: 90 }), stage("shortlist"), stage("assess"), stage("compose")],
    recordedStages: null,
    cacheHit: false,
    totalMs: 9000,
    costUsd: 0.0019,
    recordedCostUsd: null,
    ...overrides,
  };
}
