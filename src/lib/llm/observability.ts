import type { StageLog } from "@/lib/contracts";
import type { LlmResult, LlmTask, LlmUsage } from "./types";

/*
 * Observability of the model calls (12.8, 12.10): one structured log line
 * per call, in-memory counters per provider and model for the statistics
 * of the roadmap's ROPS console, the cost line from the token counts, and
 * the StageLog of the route pipeline. Nothing here ever carries user text
 * or a key.
 */

export type LlmOutcome = "ok" | "replay" | "refusal" | "invalid_output" | "unavailable" | "timeout" | "not_configured";

export interface LlmLogLine {
  event: "llm_call";
  task: LlmTask;
  provider: string | null;
  model: string | null;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  latencyMs: number;
  cached: boolean;
  outcome: LlmOutcome;
  /** The live providers that failed before the answer, as "id:kind". */
  failed: string[];
}

export function logLlmCall(line: LlmLogLine): void {
  console.info(JSON.stringify(line));
}

/** USD per million tokens (9.3, 12.10); an unknown model costs nothing in the estimate. */
const PRICES: { match: RegExp; input: number; output: number; cacheRead: number }[] = [
  { match: /bielik/i, input: 0.4, output: 0.4, cacheRead: 0.4 },
  { match: /^claude-opus-5/, input: 5, output: 25, cacheRead: 0.5 },
];

export function estimateCostUsd(model: string, usage: LlmUsage): number {
  const price = PRICES.find((entry) => entry.match.test(model));
  if (!price) return 0;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output + usage.cacheReadTokens * price.cacheRead) / 1_000_000;
}

export interface LlmCounter {
  provider: string;
  model: string;
  calls: number;
  failures: number;
  /** Served from the replay recording (provider "replay"). */
  replayed: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

const counters = new Map<string, LlmCounter>();

function counter(provider: string, model: string): LlmCounter {
  const key = `${provider}|${model}`;
  let entry = counters.get(key);
  if (!entry) {
    entry = { provider, model, calls: 0, failures: 0, replayed: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0 };
    counters.set(key, entry);
  }
  return entry;
}

export function countSuccess(result: LlmResult<unknown>): void {
  const entry = counter(result.provider, result.model);
  entry.calls += 1;
  if (result.cached) entry.replayed += 1;
  entry.inputTokens += result.usage.inputTokens;
  entry.outputTokens += result.usage.outputTokens;
  entry.cacheReadTokens += result.usage.cacheReadTokens;
  entry.costUsd += estimateCostUsd(result.model, result.usage);
}

export function countFailure(provider: string, model: string): void {
  const entry = counter(provider, model);
  entry.calls += 1;
  entry.failures += 1;
}

/** A copy of the counters since the process started (FR-10.2, 12.10); read by the tests until the console of the roadmap shows them. */
export function getLlmCounters(): LlmCounter[] {
  return [...counters.values()].map((entry) => ({ ...entry }));
}

/** For tests. */
export function resetLlmCounters(): void {
  counters.clear();
}

/** The StageLog of src/lib/contracts.ts from one model result. */
export function toStageLog(
  stage: StageLog["stage"],
  result: LlmResult<unknown>,
  extra: Partial<Pick<StageLog, "droppedIds" | "droppedReasons" | "notes">> = {},
): StageLog {
  return {
    stage,
    provider: result.provider,
    model: result.model,
    promptVersion: result.promptVersion,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    cacheReadTokens: result.usage.cacheReadTokens,
    latencyMs: result.latencyMs,
    cached: result.cached,
    droppedIds: extra.droppedIds ?? [],
    droppedReasons: extra.droppedReasons ?? 0,
    notes: extra.notes ?? [],
  };
}
