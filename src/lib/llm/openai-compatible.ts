import "server-only";
import OpenAI, { APIConnectionTimeoutError, APIError, APIUserAbortError } from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { z } from "zod";
import type { OpenAiCompatConfig } from "@/lib/env";
import { addUsage, ZERO_USAGE, type LlmProvider, type ProviderOptions, type ProviderResult } from "./provider";
import { LlmError, type LlmCall, type LlmTask, type LlmUsage } from "./types";

/*
 * The openai-compatible provider of 9.3: Bielik-11B v3.0 on the Hugging
 * Face router (the primary), and with a second configuration Llama 3.3 70B
 * on OVHcloud through the same router (the third provider). JSON mode plus
 * Zod validation with one repair round that sends the validation error
 * back. The router has no prompt caching, so the cached blocks travel in
 * full at the head of the user message; it does cache identical requests.
 */

/** The part of the OpenAI client this provider uses; tests pass a fake. */
export interface ChatClient {
  create(body: ChatCompletionCreateParamsNonStreaming, options: { timeout: number; maxRetries: number }): Promise<ChatCompletion>;
}

/** Sent back to the model when its answer fails the schema; model-facing, not shown to readers. */
const REPAIR_PROMPT =
  "Twoja odpowiedź nie jest poprawnym obiektem JSON w wymaganym formacie. Błędy:\n{errors}\n" +
  "Zwróć wyłącznie poprawiony obiekt JSON, bez komentarzy i bez bloków kodu.";

/** The JSON object in a model answer: drops inline reasoning and code fences, then the outermost braces. */
export function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    return undefined;
  }
}

function usageOf(response: ChatCompletion): LlmUsage {
  return {
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    cacheReadTokens: 0,
  };
}

function errorKind(error: unknown): "timeout" | "unavailable" {
  return error instanceof APIConnectionTimeoutError || error instanceof APIUserAbortError ? "timeout" : "unavailable";
}

export interface OpenAiCompatProviderOptions {
  /** "bielik" or "llama". */
  id: string;
  config: OpenAiCompatConfig;
  excludedTasks?: readonly LlmTask[];
  /** Default: the OpenAI SDK against config.baseUrl. */
  client?: ChatClient;
}

export class OpenAiCompatProvider implements LlmProvider {
  readonly name = "openai-compatible";
  readonly id: string;
  readonly model: string;
  readonly configured: boolean;
  readonly excludedTasks?: readonly LlmTask[];
  private client: ChatClient | undefined;
  private readonly config: OpenAiCompatConfig;
  /** Turned off for a host that rejects response_format, as scripts/llm-probe.py does. */
  private jsonMode = true;

  constructor(options: OpenAiCompatProviderOptions) {
    this.id = options.id;
    this.config = options.config;
    this.model = options.config.model;
    this.configured = Boolean(options.config.apiKey) || Boolean(options.client);
    this.excludedTasks = options.excludedTasks;
    this.client = options.client;
  }

  private chat(): ChatClient {
    if (!this.client) {
      const sdk = new OpenAI({ baseURL: this.config.baseUrl, apiKey: this.config.apiKey ?? "" });
      this.client = { create: (body, options) => sdk.chat.completions.create(body, options) };
    }
    return this.client;
  }

  private async complete(call: LlmCall<unknown>, messages: ChatCompletionMessageParam[], options: ProviderOptions): Promise<ChatCompletion> {
    const body: ChatCompletionCreateParamsNonStreaming = {
      model: this.model,
      messages,
      max_tokens: call.maxTokens,
      temperature: 0.2,
      ...(this.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    };
    try {
      return await this.chat().create(body, { timeout: options.timeoutMs, maxRetries: options.maxRetries });
    } catch (error) {
      if (this.jsonMode && error instanceof APIError && (error.status === 400 || error.status === 422) && /response_format|json/i.test(error.message)) {
        this.jsonMode = false;
        return this.complete(call, messages, options);
      }
      const kind = errorKind(error);
      const status = error instanceof APIError && error.status ? ` ${error.status}` : "";
      throw new LlmError(kind, call.task, `${this.id}: ${kind}${status}`, this.name);
    }
  }

  async call<T>(call: LlmCall<T>, options: ProviderOptions): Promise<ProviderResult<T>> {
    const userContent = [...(call.cachedBlocks ?? []), call.user].join("\n\n");
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: call.system },
      { role: "user", content: userContent },
    ];
    let usage = ZERO_USAGE;
    for (let round = 0; round < 2; round++) {
      const response = await this.complete(call, messages, options);
      usage = addUsage(usage, usageOf(response));
      const choice = response.choices[0];
      if (choice?.finish_reason === "content_filter") {
        throw new LlmError("refusal", call.task, `${this.id}: content filter`, this.name);
      }
      const text = choice?.message?.content ?? "";
      const candidate = extractJson(text);
      const result = call.schema.safeParse(candidate);
      // The configured id, not response.model: the router drops the ":provider" suffix.
      if (result.success) return { parsed: result.data, usage, model: this.model };
      const errors = candidate === undefined ? "brak obiektu JSON w odpowiedzi" : z.prettifyError(result.error).slice(0, 1500);
      messages.push({ role: "assistant", content: text }, { role: "user", content: REPAIR_PROMPT.replace("{errors}", errors) });
    }
    throw new LlmError("invalid_output", call.task, `${this.id}: the answer failed the schema after one repair round`, this.name);
  }
}
