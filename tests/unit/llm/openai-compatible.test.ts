import { APIConnectionTimeoutError } from "openai";
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { extractJson, OpenAiCompatProvider, type ChatClient } from "@/lib/llm/openai-compatible";
import { LlmError, type LlmCall } from "@/lib/llm/types";

const schema = z.object({ category: z.enum(["need", "crisis"]), confidence: z.number() });

const call: LlmCall<z.infer<typeof schema>> = {
  task: "screen",
  system: "SYSTEM",
  promptVersion: "screen-v1",
  cachedBlocks: ["CARDS"],
  user: "<potrzeba>tekst</potrzeba>",
  schema,
  effort: "low",
  maxTokens: 300,
};

const OPTIONS = { timeoutMs: 5_000, maxRetries: 0 };

function completion(content: string, finish: string = "stop"): ChatCompletion {
  return {
    id: "x",
    object: "chat.completion",
    created: 0,
    model: "speakleash/Bielik-11B-v3.0-Instruct",
    choices: [{ index: 0, finish_reason: finish, logprobs: null, message: { role: "assistant", content, refusal: null } }],
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
  } as unknown as ChatCompletion;
}

function fakeClient(answers: (ChatCompletion | Error)[]) {
  const bodies: ChatCompletionCreateParamsNonStreaming[] = [];
  const client: ChatClient = {
    async create(body) {
      bodies.push(structuredClone(body));
      const next = answers.shift();
      if (!next) throw new Error("no more answers");
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { client, bodies };
}

function provider(client: ChatClient) {
  return new OpenAiCompatProvider({ id: "bielik", config: { baseUrl: "http://fake", model: "bielik-test", apiKey: null }, client });
}

describe("extractJson", () => {
  it("drops reasoning and code fences", () => {
    expect(extractJson('<think>hmm</think>\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it("repairs text around the object", () => {
    expect(extractJson('Oto wynik: {"a": 1} dziękuję')).toEqual({ a: 1 });
  });

  it("returns undefined without an object", () => {
    expect(extractJson("brak")).toBeUndefined();
  });
});

describe("OpenAiCompatProvider", () => {
  it("sends JSON mode with the cached blocks before the user part", async () => {
    const { client, bodies } = fakeClient([completion('{"category":"need","confidence":0.9}')]);
    const result = await provider(client).call(call, OPTIONS);
    expect(result.parsed).toEqual({ category: "need", confidence: 0.9 });
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 0 });
    expect(result.model).toBe("bielik-test");
    expect(bodies[0].response_format).toEqual({ type: "json_object" });
    expect(bodies[0].messages).toEqual([
      { role: "system", content: "SYSTEM" },
      { role: "user", content: "CARDS\n\n<potrzeba>tekst</potrzeba>" },
    ]);
  });

  it("repairs once by sending the validation error back", async () => {
    const { client, bodies } = fakeClient([
      completion('{"category":"maybe","confidence":0.9}'),
      completion('{"category":"crisis","confidence":0.8}'),
    ]);
    const result = await provider(client).call(call, OPTIONS);
    expect(result.parsed.category).toBe("crisis");
    expect(result.usage.inputTokens).toBe(200);
    const repair = bodies[1].messages;
    expect(repair).toHaveLength(4);
    expect(repair[2]).toEqual({ role: "assistant", content: '{"category":"maybe","confidence":0.9}' });
    expect(String(repair[3].content)).toMatch(/category/);
  });

  it("gives up after one repair round", async () => {
    const { client } = fakeClient([completion("nie wiem"), completion('{"category":1}')]);
    await expect(provider(client).call(call, OPTIONS)).rejects.toMatchObject({ kind: "invalid_output", task: "screen" });
  });

  it("maps the content filter to a refusal", async () => {
    const { client } = fakeClient([completion("", "content_filter")]);
    await expect(provider(client).call(call, OPTIONS)).rejects.toMatchObject({ kind: "refusal" });
  });

  it("maps a timeout", async () => {
    const { client } = fakeClient([new APIConnectionTimeoutError()]);
    const error = await provider(client).call(call, OPTIONS).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).kind).toBe("timeout");
  });

  it("is not configured without a key", () => {
    const bare = new OpenAiCompatProvider({ id: "bielik", config: { baseUrl: "http://fake", model: "m", apiKey: null } });
    expect(bare.configured).toBe(false);
  });
});
