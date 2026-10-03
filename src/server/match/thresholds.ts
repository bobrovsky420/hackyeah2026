import type { MatchMode } from "@/lib/contracts";

/*
 * The mode thresholds of FR-3.3, in one place. Calibrated on the ten test
 * problems; prompts/assess.md gets the same numbers
 * through its placeholders ROUTE_MIN, PARTIAL_MIN and PARTIAL_MAX.
 */

/** The best validated fit at or above this is a route. */
export const ROUTE_MIN = 70;
/** The best validated fit from this up to ROUTE_MIN - 1 is partial; below it, none. */
export const PARTIAL_MIN = 45;

/** Stage 1 reads this many index cards (FR-3.1, FR-3.7). */
export const RETRIEVE_K = 40;
/** Stage 1 returns at most this many candidates (8.3). */
export const MAX_CANDIDATES = 8;
/** The nearest retrieved cards always reach stage 2, picked by the model or not (M.9). */
export const RETRIEVAL_FLOOR = 3;
/** Per assessment (8.3). */
export const MAX_REASONS = 3;
export const MAX_GAPS = 3;
export const MAX_TOP_IDS = 3;
/** A quote names at most this many words of its field (FR-3.2). */
export const MAX_QUOTE_WORDS = 15;
/** A quote is found when the fuzzy ratio against the best window of its field reaches this (FR-3.4). */
export const QUOTE_MIN_RATIO = 0.8;
/** Stage 1 reasons are one sentence (8.3). */
export const MAX_REASON_CHARS = 200;

/** The mode from the best validated fit, never from the model (FR-3.3). */
export function modeFor(bestFit: number | null): MatchMode {
  if (bestFit === null) return "none";
  if (bestFit >= ROUTE_MIN) return "route";
  if (bestFit >= PARTIAL_MIN) return "partial";
  return "none";
}
