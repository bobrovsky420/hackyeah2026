import type { LlmCall, LlmUsage } from "./types";

/*
 * One live provider of the chain (9.3). A provider makes one call, with its
 * own SDK retries, and either returns a parsed result or throws an LlmError
 * whose kind says why; the chain in llm.ts decides what happens next.
 */

export interface ProviderOptions {
  timeoutMs: number;
  maxRetries: number;
}

export interface ProviderResult<T> {
  parsed: T;
  usage: LlmUsage;
  /** The model that answered (Anthropic's server-side fallback may name another). */
  model: string;
}

export interface LlmProvider {
  /** Chain position name for logs and tests: "bielik" or "anthropic". */
  id: string;
  /** LlmResult.provider: "openai-compatible" or "anthropic". */
  name: string;
  model: string;
  /** False without a key: the chain skips it. */
  configured: boolean;
  call<T>(call: LlmCall<T>, options: ProviderOptions): Promise<ProviderResult<T>>;
}

export const ZERO_USAGE: LlmUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

export function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  };
}
