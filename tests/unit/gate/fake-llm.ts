import { LlmError, type Llm, type LlmCall, type LlmErrorKind } from "@/lib/llm/types";
import type { ScreenOutput } from "@/server/gate/model";

/*
 * A fake Llm for the gate's tests: answers every call with a fixed
 * screening output (or throws an LlmError) and records the calls, so a
 * test can check what the model was shown. It never reaches the network.
 */

export interface FakeLlm {
  llm: Llm;
  calls: LlmCall<unknown>[];
}

export function answer(overrides: Partial<ScreenOutput> = {}): ScreenOutput {
  return {
    category: "need",
    confidence: 0.9,
    individual_case: false,
    sensitive_topics: [],
    person_names: [],
    need_summary_pl: "Potrzeba społeczności.",
    ...overrides,
  };
}

export function fakeLlm(result: ScreenOutput | LlmErrorKind | unknown): FakeLlm {
  const calls: LlmCall<unknown>[] = [];
  const llm = (async <T>(call: LlmCall<T>) => {
    calls.push(call as LlmCall<unknown>);
    if (typeof result === "string") throw new LlmError(result as LlmErrorKind, call.task, "fake failure", "fake");
    return {
      parsed: result as T,
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0 },
      latencyMs: 12,
      provider: "fake",
      model: "fake-model",
      promptVersion: call.promptVersion,
      cached: false,
    };
  }) as Llm;
  return { llm, calls };
}
