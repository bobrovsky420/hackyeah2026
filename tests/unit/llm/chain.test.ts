import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createLlm } from "@/lib/llm/chain";
import { getLlmCounters, resetLlmCounters, toStageLog, type LlmLogLine } from "@/lib/llm/observability";
import type { LlmProvider, ProviderOptions } from "@/lib/llm/provider";
import { createReplayStore, replayKey } from "@/lib/llm/replay";
import { LlmError, type LlmCall, type LlmErrorKind, type LlmTask } from "@/lib/llm/types";

const schema = z.object({ answer: z.string() });
const TIMEOUTS = { screenMs: 5_000, defaultMs: 40_000, maxRetries: 2 };

function call(task: LlmTask = "shortlist", user = "<potrzeba>seniorzy</potrzeba>"): LlmCall<z.infer<typeof schema>> {
  return { task, system: "SYSTEM", promptVersion: `${task}-v1`, cachedBlocks: ["CARDS"], user, schema, effort: "medium", maxTokens: 1000 };
}

interface Fake extends LlmProvider {
  calls: { task: LlmTask; options: ProviderOptions }[];
}

function fake(id: string, behaviour: { answer?: string; fail?: LlmErrorKind; configured?: boolean }): Fake {
  const calls: Fake["calls"] = [];
  return {
    id,
    name: id === "anthropic" ? "anthropic" : "openai-compatible",
    model: `${id}-model`,
    configured: behaviour.configured ?? true,
    calls,
    async call<T>(request: LlmCall<T>, options: ProviderOptions) {
      calls.push({ task: request.task, options });
      if (behaviour.fail) throw new LlmError(behaviour.fail, request.task, `${id} failed`, this.name);
      return { parsed: request.schema.parse({ answer: behaviour.answer ?? id }), usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0 }, model: this.model };
    },
  };
}

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "llm-replay-"));
}

let lines: LlmLogLine[];
const log = (line: LlmLogLine) => lines.push(line);

beforeEach(() => {
  lines = [];
  resetLlmCounters();
});

describe("the provider chain", () => {
  it("answers from the head and logs one line without user text", async () => {
    const bielik = fake("bielik", {});
    const anthropic = fake("anthropic", {});
    const llm = createLlm({ providers: [bielik, anthropic], replay: null, timeouts: TIMEOUTS, log });
    const result = await llm(call());
    expect(result).toMatchObject({ parsed: { answer: "bielik" }, provider: "openai-compatible", model: "bielik-model", promptVersion: "shortlist-v1", cached: false });
    expect(anthropic.calls).toHaveLength(0);
    expect(bielik.calls[0].options).toEqual({ timeoutMs: 40_000, maxRetries: 2 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ event: "llm_call", task: "shortlist", outcome: "ok", inputTokens: 10, outputTokens: 5, failed: [] });
    expect(JSON.stringify(lines)).not.toContain("seniorzy");
  });

  it("uses the short timeout for the gate", async () => {
    const bielik = fake("bielik", {});
    await createLlm({ providers: [bielik], replay: null, timeouts: TIMEOUTS, log })(call("screen"));
    expect(bielik.calls[0].options.timeoutMs).toBe(5_000);
  });

  it("falls through to Anthropic when Bielik fails", async () => {
    const bielik = fake("bielik", { fail: "timeout" });
    const anthropic = fake("anthropic", {});
    const llm = createLlm({ providers: [bielik, anthropic], replay: null, timeouts: TIMEOUTS, log });
    const result = await llm(call("assess"));
    expect(result.parsed.answer).toBe("anthropic");
    expect(lines[0].failed).toEqual(["bielik:timeout"]);
    expect(getLlmCounters().find((entry) => entry.model === "bielik-model")).toMatchObject({ calls: 1, failures: 1 });
  });

  it("skips a provider without a key", async () => {
    const bielik = fake("bielik", { configured: false });
    const anthropic = fake("anthropic", {});
    const result = await createLlm({ providers: [bielik, anthropic], replay: null, timeouts: TIMEOUTS, log })(call("assess"));
    expect(result.parsed.answer).toBe("anthropic");
    expect(bielik.calls).toHaveLength(0);
    expect(lines[0].failed).toEqual([]);
  });

  it("reports a refusal that survived Anthropic's own fallback as a refusal", async () => {
    const bielik = fake("bielik", { fail: "timeout" });
    const anthropic = fake("anthropic", { fail: "refusal" });
    const llm = createLlm({ providers: [bielik, anthropic], replay: null, timeouts: TIMEOUTS, log });
    const error = await llm(call("compose")).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).kind).toBe("refusal");
    expect(lines[0].outcome).toBe("refusal");
  });

  it("moves on after a content-filter refusal from Bielik", async () => {
    const bielik = fake("bielik", { fail: "refusal" });
    const anthropic = fake("anthropic", {});
    const result = await createLlm({ providers: [bielik, anthropic], replay: null, timeouts: TIMEOUTS, log })(call());
    expect(result.provider).toBe("anthropic");
  });

  it("reports not_configured when no provider has a key", async () => {
    const llm = createLlm({ providers: [fake("bielik", { configured: false }), fake("anthropic", { configured: false })], replay: null, timeouts: TIMEOUTS, log });
    await expect(llm(call())).rejects.toMatchObject({ kind: "not_configured" });
  });

  it("reports the last failure's kind", async () => {
    const llm = createLlm({ providers: [fake("bielik", { fail: "timeout" }), fake("anthropic", { fail: "invalid_output" })], replay: null, timeouts: TIMEOUTS, log });
    await expect(llm(call())).rejects.toMatchObject({ kind: "invalid_output" });
  });
});

describe("the replay recording", () => {
  it("records a live result and serves it when the chain fails", async () => {
    const dir = tempDir();
    const replay = createReplayStore(dir);
    const live = createLlm({ providers: [fake("bielik", { answer: "recorded" })], replay, timeouts: TIMEOUTS, log });
    await live(call());

    const file = path.join(dir, `${replayKey(call())}.json`);
    const record = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(record).toMatchObject({ task: "shortlist", promptVersion: "shortlist-v1", provider: "openai-compatible", model: "bielik-model", parsed: { answer: "recorded" } });
    expect(fs.readFileSync(file, "utf8")).not.toContain("seniorzy");

    const broken = createLlm({ providers: [fake("bielik", { fail: "unavailable" })], replay, timeouts: TIMEOUTS, log });
    const result = await broken(call());
    expect(result).toMatchObject({ parsed: { answer: "recorded" }, provider: "replay", model: "bielik-model", cached: true });
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 });
    expect(lines.at(-1)).toMatchObject({ outcome: "replay", cached: true, failed: ["bielik:unavailable"] });
  });

  it("keys on the prompt version and the user part", async () => {
    const replay = createReplayStore(tempDir());
    await createLlm({ providers: [fake("bielik", {})], replay, timeouts: TIMEOUTS, log })(call());
    const offline = createLlm({ providers: [], replay, timeouts: TIMEOUTS, mode: "replay", log });
    await expect(offline(call())).resolves.toMatchObject({ cached: true });
    await expect(offline(call("shortlist", "<potrzeba>inna</potrzeba>"))).rejects.toMatchObject({ kind: "unavailable" });
    await expect(offline({ ...call(), promptVersion: "shortlist-v2" })).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("ignores a recording that no longer passes the schema", async () => {
    const replay = createReplayStore(tempDir());
    await createLlm({ providers: [fake("bielik", {})], replay, timeouts: TIMEOUTS, log })(call());
    const stricter = { ...call(), schema: z.object({ answer: z.string(), extra: z.number() }) };
    const offline = createLlm({ providers: [], replay, timeouts: TIMEOUTS, mode: "replay", log });
    await expect(offline(stricter)).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("serves the recording when no provider is configured", async () => {
    const replay = createReplayStore(tempDir());
    await createLlm({ providers: [fake("bielik", {})], replay, timeouts: TIMEOUTS, log })(call());
    const unconfigured = createLlm({ providers: [fake("bielik", { configured: false })], replay, timeouts: TIMEOUTS, log });
    await expect(unconfigured(call())).resolves.toMatchObject({ cached: true });
  });
});

describe("toStageLog", () => {
  it("fills the stage log from a result", async () => {
    const result = await createLlm({ providers: [fake("bielik", {})], replay: null, timeouts: TIMEOUTS, log })(call());
    expect(toStageLog("shortlist", result, { droppedIds: ["inn-x"] })).toEqual({
      stage: "shortlist",
      provider: "openai-compatible",
      model: "bielik-model",
      promptVersion: "shortlist-v1",
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      latencyMs: result.latencyMs,
      cached: false,
      droppedIds: ["inn-x"],
      droppedReasons: 0,
      notes: [],
    });
  });
});
