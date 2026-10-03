import "server-only";
import {
  anthropicConfig,
  llamaFallbackConfig,
  llmProvider,
  llmReplayDir,
  llmTimeouts,
  openAiCompatConfig,
  type LlmProviderName,
} from "@/lib/env";
import { AnthropicProvider } from "./anthropic";
import { createLlm } from "./chain";
import { OpenAiCompatProvider } from "./openai-compatible";
import type { LlmProvider } from "./provider";
import { createReplayStore } from "./replay";
import type { Llm } from "./types";

/*
 * The app's entry to the language models (9.3): getLlm() builds the chain
 * from the environment once per process. The online order is Bielik,
 * Anthropic, Llama 3.3 70B, then the replay recording; LLM_PROVIDER picks
 * the head (anthropic moves Anthropic first) or replay (recording only).
 * Modules receive the Llm function as a dependency, so tests build their
 * own with createLlm() and fake providers.
 */

export { createLlm, type LlmChainOptions } from "./chain";
export { loadPrompt, PromptError, type Prompt } from "./prompts";
export { createReplayStore, replayKey, type ReplayStore } from "./replay";
export { getLlmCounters, toStageLog, estimateCostUsd, type LlmCounter } from "./observability";
export type { LlmProvider } from "./provider";
export { LlmError } from "./types";
export type { Llm, LlmCall, LlmResult, LlmTask, LlmErrorKind } from "./types";

function providersFor(head: LlmProviderName): LlmProvider[] {
  if (head === "replay") return [];
  const bielik = new OpenAiCompatProvider({ id: "bielik", config: openAiCompatConfig() });
  const anthropic = new AnthropicProvider({ config: anthropicConfig() });
  const llamaConfig = llamaFallbackConfig();
  const llama = llamaConfig ? [new OpenAiCompatProvider({ id: "llama", config: llamaConfig, excludedTasks: ["screen"] })] : [];
  return head === "anthropic" ? [anthropic, bielik, ...llama] : [bielik, anthropic, ...llama];
}

let chain: { llm: Llm; providers: LlmProvider[]; head: LlmProviderName } | undefined;

function build() {
  if (!chain) {
    const head = llmProvider();
    const providers = providersFor(head);
    chain = {
      head,
      providers,
      llm: createLlm({
        providers,
        replay: createReplayStore(llmReplayDir()),
        timeouts: llmTimeouts(),
        mode: head === "replay" ? "replay" : "live",
      }),
    };
  }
  return chain;
}

/** The configured chain, built once per server process. */
export function getLlm(): Llm {
  return build().llm;
}

/** The provider that answers first, for /api/health: the first configured one, else the recording. */
export function describeLlm(): { provider: string; model: string | null; configured: string[] } {
  const { providers } = build();
  const configured = providers.filter((provider) => provider.configured);
  const head = configured[0];
  return {
    provider: head ? head.name : "replay",
    model: head ? head.model : null,
    configured: configured.map((provider) => provider.id),
  };
}
