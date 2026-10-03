import type { RoleCode } from "@/lib/contracts/catalogue";
import type { Readiness } from "@/lib/contracts/records";
import type { Route, SensitiveTopic } from "@/lib/contracts/route";
import type { Dataset } from "@/lib/data/to-contracts";
import type { Llm } from "@/lib/llm/types";

/*
 * The boundaries between the modules of the route pipeline (specification
 * 7.12, 7.3, 7.4): the gate screens and redacts, the matcher retrieves,
 * shortlists and assesses, the composer assembles the route of 8.4, and
 * src/server/pipeline.ts runs them in that order with the replay cache.
 * Each module depends on these types only, never on another module's
 * internals, so they can be built and tested apart.
 */

/** Per stage, for the request log and the counters (FR-3.6). */
export interface StageLog {
  stage: "screen" | "retrieve" | "shortlist" | "assess" | "compose" | "brief" | "cluster";
  provider: string;
  model: string;
  promptVersion: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  latencyMs: number;
  cached: boolean;
  /** Ids the grounding validation dropped (FR-3.4), unknown ids included. */
  droppedIds: string[];
  /** Reasons dropped because their quote was not found in the record. */
  droppedReasons: number;
  /** Free notes, e.g. "retriever: lexical fallback". Never user text. */
  notes: string[];
}

// ---------------------------------------------------------------- gate (7.12)

export type ScreeningCategory = "need" | "crisis" | "individual_case" | "harm" | "off_topic" | "spam";
export type ScreeningOutcome = "need" | "redirected" | "declined" | "off_topic";
export type RedactionType = "pesel" | "phone" | "email" | "address" | "person_name";

/** Schema 8.10. Offsets refer to the text as submitted. */
export interface ScreeningResult {
  category: ScreeningCategory;
  confidence: number;
  individual_case: boolean;
  sensitive_topics: SensitiveTopic[];
  redactions: { type: RedactionType; start: number; end: number }[];
  need_summary_pl: string | null;
  outcome: ScreeningOutcome;
  crisis_banner: boolean;
  /** e.g. "pattern:phone", "lexicon:samobój", "model:crisis>=0.6". */
  rules_fired: string[];
  prompt_version: string | null;
}

/** Which submitted text the gate screens (7.12, first paragraph). */
export type GateTextKind = "need" | "saved_need" | "contact" | "readiness" | "offer";

export interface GateInput {
  text: string;
  kind: GateTextKind;
  /** The gmina's name, the only context the model sees (FR-12.2). */
  placeName: string | null;
}

export interface GateOutput {
  screening: ScreeningResult;
  /** The text with every redaction replaced by "[usunięto]"; the original is discarded (FR-12.4). */
  redactedText: string;
  redactionCount: number;
  /** Null when the deterministic checks decided without a model call. */
  stage: StageLog | null;
}

export type ScreenText = (input: GateInput, deps: { llm: Llm }) => Promise<GateOutput>;

// ------------------------------------------------------------ matcher (7.3)

export interface MatchInput {
  /** Redacted by the gate; wrapped in <potrzeba> tags inside prompts. */
  needText: string;
  /** The gate's neutral summary, if it wrote one. */
  needSummary: string | null;
  placeTerc: string | null;
  role: RoleCode | null;
  /** Given by the reader (FR-2.3); empty when not asked or not answered. */
  targetGroups: string[];
}

/** Stage 1 (8.3), after validation: only known ids, at most 8. */
export interface ShortlistCandidate {
  id: string;
  prelim_fit: number;
  reason_pl: string;
}

/** Stage 2 (8.3), after the grounding validation of FR-3.4. */
export interface Assessment {
  id: string;
  fit_score: number;
  /** `field` names a field of the record; `quote` was found in it (fuzzy ratio at least 0.8). */
  fit_reasons: { field: string; quote: string; why_pl: string }[];
  gaps_pl: string[];
  adaptation_note_pl: string | null;
}

export type MatchMode = "route" | "partial" | "none";

export interface MatchResult {
  /** From the thresholds of FR-3.3 applied to the best validated fit, not taken from the model. */
  mode: MatchMode;
  mode_reason_pl: string | null;
  need_summary_pl: string | null;
  detected_target_groups: string[];
  detected_domains: string[];
  /** The ids the retriever handed to stage 1, nearest first (FR-3.7). */
  retrieved_ids: string[];
  candidates: ShortlistCandidate[];
  /** Every validated assessment, best first. */
  assessments: Assessment[];
  /** At most 3, a subset of the assessed ids, best first. */
  top_ids: string[];
  /** FR-2.3: stage 1 found neither a target group nor a place, and the reader gave none. */
  clarification_needed: boolean;
  stages: StageLog[];
}

/** Embeds texts with the model of FR-3.7; unit-length vectors. */
export type Embed = (texts: string[], kind: "query" | "passage") => Promise<number[][]>;

export type MatchNeed = (input: MatchInput, deps: { llm: Llm; dataset: Dataset; embed: Embed }) => Promise<MatchResult>;

// ----------------------------------------------------------- composer (7.4)

export interface ComposeInput {
  routeId: string;
  createdAt: string;
  /** As stored: the redacted text, the place, the role, the target groups. */
  input: Route["input"];
  gate: GateOutput;
  match: MatchResult;
}

/**
 * Assembles schema 8.4 from data; the model writes only the summary
 * paragraph and the three next steps (FR-4.1). A compose failure leaves
 * those blank and the route still renders. `readiness` is the readiness
 * registry as the repository holds it (FR-6.5); the composer only counts
 * and names from it and never reads the store itself.
 */
export type ComposeRoute = (
  input: ComposeInput,
  deps: { llm: Llm; dataset: Dataset; today: string; readiness: Readiness[] },
) => Promise<{ route: Route; stage: StageLog | null }>;
