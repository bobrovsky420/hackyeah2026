import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AnthropicProvider, anthropicRequest, type AnthropicClient, type AnthropicParsed } from "@/lib/llm/anthropic";
import type { LlmCall } from "@/lib/llm/types";

const schema = z.object({ summary: z.string() });

function call(task: LlmCall<unknown>["task"], cachedBlocks?: string[]): LlmCall<z.infer<typeof schema>> {
  return { task, system: "SYSTEM", promptVersion: `${task}-v1`, cachedBlocks, user: "USER", schema, effort: "low", maxTokens: 500 };
}

const OPTIONS = { timeoutMs: 40_000, maxRetries: 2 };
const CONFIG = { apiKey: null, model: "claude-opus-5" };

function answer(overrides: Partial<AnthropicParsed>): AnthropicParsed {
  return {
    stop_reason: "end_turn",
    model: "claude-opus-5",
    parsed_output: { summary: "ok" },
    usage: { input_tokens: 50, output_tokens: 30, cache_read_input_tokens: 1000, cache_creation_input_tokens: 10 },
    ...overrides,
  };
}

function client(response: AnthropicParsed): AnthropicClient {
  return { parse: async () => response };
}

describe("anthropicRequest", () => {
  it("caches the system prompt and the last cached block, the user part last", () => {
    const body = anthropicRequest(call("shortlist", ["A", "B"]), "claude-opus-5");
    expect(body.system).toEqual([{ type: "text", text: "SYSTEM", cache_control: { type: "ephemeral", ttl: "1h" } }]);
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "A" },
      { type: "text", text: "B", cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: "USER" },
    ]);
    expect(body.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(body.fallbacks).toBe("default");
  });

  it("sets effort and the max_tokens floor per task", () => {
    expect(anthropicRequest(call("screen"), "m").output_config?.effort).toBe("low");
    expect(anthropicRequest(call("shortlist"), "m").output_config?.effort).toBe("medium");
    expect(anthropicRequest(call("assess"), "m").output_config?.effort).toBe("high");
    expect(anthropicRequest(call("screen"), "m").max_tokens).toBe(1000);
    expect(anthropicRequest(call("brief"), "m").max_tokens).toBe(8000);
    expect(anthropicRequest(call("compose"), "m").max_tokens).toBe(500);
  });
});

describe("AnthropicProvider", () => {
  it("maps usage, cache writes counted as input", async () => {
    const provider = new AnthropicProvider({ config: CONFIG, client: client(answer({})) });
    const result = await provider.call(call("assess"), OPTIONS);
    expect(result.parsed).toEqual({ summary: "ok" });
    expect(result.usage).toEqual({ inputTokens: 60, outputTokens: 30, cacheReadTokens: 1000 });
  });

  it("turns a surviving refusal into LlmError refusal", async () => {
    const provider = new AnthropicProvider({ config: CONFIG, client: client(answer({ stop_reason: "refusal", parsed_output: null })) });
    await expect(provider.call(call("compose"), OPTIONS)).rejects.toMatchObject({ name: "LlmError", kind: "refusal", provider: "anthropic" });
  });

  it("treats a truncated answer as invalid output", async () => {
    const provider = new AnthropicProvider({ config: CONFIG, client: client(answer({ stop_reason: "max_tokens", parsed_output: null })) });
    await expect(provider.call(call("compose"), OPTIONS)).rejects.toMatchObject({ kind: "invalid_output" });
  });

  it("is not configured without a key", () => {
    expect(new AnthropicProvider({ config: CONFIG }).configured).toBe(false);
  });
});
