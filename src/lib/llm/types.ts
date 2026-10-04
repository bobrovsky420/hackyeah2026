import type { z } from "zod";

/*
 * The language-model adapter of specification 9.3: one interface, three
 * providers (openai-compatible for Bielik, anthropic, replay), chosen by
 * LLM_PROVIDER. Every module that calls a model receives an `Llm` function,
 * so unit tests pass a fake one and never reach the network.
 */

/** The request tasks of the app; extraction runs outside the app (FR-1.3). */
export type LlmTask = "screen" | "shortlist" | "assess" | "compose" | "brief" | "develop";

export type LlmEffort = "low" | "medium" | "high";

export interface LlmCall<T> {
  task: LlmTask;
  /** The body of prompts/<task>.md, Polish. */
  system: string;
  /** The `version` of the prompt's front matter, e.g. "shortlist-v1"; stamped into results and cache keys. */
  promptVersion: string;
  /** A stable prefix before the user part, e.g. the index cards; cached where the provider can. */
  cachedBlocks?: string[];
  /** The volatile part; user text inside it is wrapped in <potrzeba> tags by the caller. */
  user: string;
  /** Structured output: the parsed result must pass this schema. */
  schema: z.ZodType<T>;
  effort: LlmEffort;
  maxTokens: number;
  /** Sampling temperature of the openai-compatible provider, default 0.2; Anthropic's adaptive thinking takes none. */
  temperature?: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface LlmResult<T> {
  parsed: T;
  usage: LlmUsage;
  latencyMs: number;
  /** "openai-compatible", "anthropic" or "replay". */
  provider: string;
  model: string;
  promptVersion: string;
  /** True when the result came from the replay recording, not a live call. */
  cached: boolean;
}

/** What every caller receives: the configured provider chain behind one function. */
export type Llm = <T>(call: LlmCall<T>) => Promise<LlmResult<T>>;

/**
 * Why a call failed after the provider chain and the replay recording were
 * tried. `refusal` is a model declining a request that passed the gate
 * (FR-12.12): the pipeline turns it into the mild `declined` outcome.
 */
export type LlmErrorKind = "refusal" | "invalid_output" | "unavailable" | "timeout" | "not_configured";

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    readonly task: LlmTask,
    message: string,
    readonly provider: string | null = null,
  ) {
    super(message);
    this.name = "LlmError";
  }
}
