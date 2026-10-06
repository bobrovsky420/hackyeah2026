import Anthropic, { APIConnectionTimeoutError, APIError, APIUserAbortError } from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type {
  BetaTextBlockParam,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { AnthropicConfig } from "@/lib/env";
import type { LlmProvider, ProviderOptions, ProviderResult } from "./provider";
import { LlmError, type LlmCall, type LlmEffort, type LlmTask } from "./types";

/*
 * The anthropic provider of 9.3, the online fallback. Structured output
 * through messages.parse with the Zod schema; the system prompt and the
 * cached blocks (the index cards) carry a one-hour cache breakpoint, the
 * volatile user part comes last. Adaptive thinking is the model's default
 * and is not configured. The server-side refusal fallback is on, so a
 * legitimate sensitive need that passed the gate still gets an answer; a
 * refusal that survives it is LlmError("refusal"), which the pipeline turns
 * into the mild `declined` outcome of FR-12.12.
 */

/** Effort per task (9.3). */
const EFFORT: Partial<Record<LlmTask, LlmEffort>> = {
  screen: "low",
  shortlist: "medium",
  assess: "high",
  compose: "high",
  brief: "high",
};

/** max_tokens floors per task (9.3): thinking shares the budget with the answer. */
const MAX_TOKENS: Partial<Record<LlmTask, number>> = {
  screen: 1_000,
  shortlist: 4_000,
  assess: 4_000,
  brief: 8_000,
  develop: 4_000,
  show: 2_000,
  inspire: 3_000,
  adapt: 4_000,
};

const REFUSAL_FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** The fields of the parsed message this provider reads; tests pass a fake. */
export interface AnthropicParsed {
  stop_reason: string | null;
  model: string;
  parsed_output?: unknown;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number | null;
    cache_creation_input_tokens: number | null;
  };
}

export interface AnthropicClient {
  parse(body: MessageCreateParamsNonStreaming, options: { timeout: number; maxRetries: number }): Promise<AnthropicParsed>;
}

/** The request body for one call; exported for the tests. */
export function anthropicRequest<T>(call: LlmCall<T>, model: string): MessageCreateParamsNonStreaming {
  const cacheControl = { type: "ephemeral" as const, ttl: "1h" as const };
  const blocks = call.cachedBlocks ?? [];
  const content: BetaTextBlockParam[] = [
    ...blocks.map((text, index) => ({
      type: "text" as const,
      text,
      ...(index === blocks.length - 1 ? { cache_control: cacheControl } : {}),
    })),
    { type: "text", text: call.user },
  ];
  return {
    model,
    max_tokens: Math.max(call.maxTokens, MAX_TOKENS[call.task] ?? 0),
    betas: [REFUSAL_FALLBACK_BETA],
    fallbacks: "default",
    system: [{ type: "text", text: call.system, cache_control: cacheControl }],
    messages: [{ role: "user", content }],
    output_config: { effort: EFFORT[call.task] ?? call.effort, format: betaZodOutputFormat(call.schema) },
  };
}

export class AnthropicProvider implements LlmProvider {
  readonly id = "anthropic";
  readonly name = "anthropic";
  readonly model: string;
  readonly configured: boolean;
  private client: AnthropicClient | undefined;
  private readonly apiKey: string | null;

  constructor(options: { config: AnthropicConfig; client?: AnthropicClient }) {
    this.model = options.config.model;
    this.apiKey = options.config.apiKey;
    this.configured = Boolean(options.config.apiKey) || Boolean(options.client);
    this.client = options.client;
  }

  private messages(): AnthropicClient {
    if (!this.client) {
      const sdk = new Anthropic({ apiKey: this.apiKey ?? undefined });
      this.client = { parse: (body, options) => sdk.beta.messages.parse(body, options) };
    }
    return this.client;
  }

  async call<T>(call: LlmCall<T>, options: ProviderOptions): Promise<ProviderResult<T>> {
    let response: AnthropicParsed;
    try {
      response = await this.messages().parse(anthropicRequest(call, this.model), {
        timeout: options.timeoutMs,
        maxRetries: options.maxRetries,
      });
    } catch (error) {
      if (error instanceof APIConnectionTimeoutError || error instanceof APIUserAbortError) {
        throw new LlmError("timeout", call.task, "anthropic: timeout", this.name);
      }
      if (error instanceof APIError) {
        throw new LlmError("unavailable", call.task, `anthropic: unavailable${error.status ? ` ${error.status}` : ""}`, this.name, error.status ?? null);
      }
      // The parse helper throws when the text is not valid JSON for the schema.
      throw new LlmError("invalid_output", call.task, "anthropic: the answer failed the schema", this.name);
    }
    // The whole fallback chain declined; the content is empty or partial.
    if (response.stop_reason === "refusal") {
      throw new LlmError("refusal", call.task, "anthropic: refusal after the server-side fallback", this.name);
    }
    if (response.stop_reason === "max_tokens" || response.parsed_output == null) {
      throw new LlmError("invalid_output", call.task, `anthropic: no parsed output (stop ${response.stop_reason})`, this.name);
    }
    const usage = response.usage;
    return {
      parsed: response.parsed_output as T,
      usage: {
        inputTokens: usage.input_tokens + (usage.cache_creation_input_tokens ?? 0),
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      },
      model: response.model || this.model,
    };
  }
}
