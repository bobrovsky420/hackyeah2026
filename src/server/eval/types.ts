import type { RoleCode, RouteMode, StageLog } from "@/lib/contracts";
import type { GeneratedString } from "./polish";
import type { Outcome, PeopleRole } from "./problems";

/*
 * What the harness observes of one run of the pipeline, and what it makes
 * of it. The runner (runner.ts) fills an Observation from the route, the
 * stage logs and its own wrappers around the model and the cache; the
 * scoring (score.ts) and the report never see the pipeline itself.
 */

/** "base", or a derived run: "role:<code>", "place:<terc>", "repeat:<n>". */
export type Variant = string;

export interface Observation {
  problemId: string;
  variant: Variant;
  input: { role: RoleCode | null; placeTerc: string | null; placeName: string | null; placeKind: string | null; targetGroups: string[] };
  /** Null when the pipeline threw (every provider failed and nothing was cached). */
  error: string | null;
  outcome: Outcome | null;
  mode: RouteMode | null;
  clarificationNeeded: boolean;
  crisisBanner: boolean;
  redactions: number;
  /** The route's solutions, best first (at most three). */
  solutions: { id: string; fit: number }[];
  pathIds: string[];
  peopleRoles: PeopleRole[];
  summary: string | null;
  generated: GeneratedString[];
  /** The forty cards the retriever handed to stage 1, nearest first; null when the gate stopped the text. */
  retrievedIds: string[] | null;
  retriever: { provider: string; notes: string[] } | null;
  /** Stage 1 after validation; null when unknown (a cache hit without an evaluation record). */
  stage1Ids: string[] | null;
  detectedTargetGroups: string[] | null;
  /** Reasons the model wrote in stage 2, before the grounding validation. */
  reasonsGiven: number | null;
  /** The stages of this run; a cache hit has only the gate. */
  stages: StageLog[];
  /** On a cache hit: the stages recorded when the route was computed, if the harness computed it. */
  recordedStages: StageLog[] | null;
  cacheHit: boolean;
  /** Route.engine.latency_ms: the server time of this run. */
  totalMs: number;
  costUsd: number;
  recordedCostUsd: number | null;
}

export interface Check {
  name: string;
  /** A required check decides whether the problem passes; the others are diagnostics. */
  required: boolean;
  /** Null: not applicable, or unknown for this run (the detail says which). */
  pass: boolean | null;
  detail: string;
}

export interface ProblemResult {
  problemId: string;
  variant: Variant;
  pass: boolean;
  checks: Check[];
  /** Rank (1-based) of each expected innovation among the retrieved forty, null when absent. */
  retrievalRanks: Record<string, number | null>;
  droppedIds: number;
  droppedQuotes: number;
  observation: Observation;
}
