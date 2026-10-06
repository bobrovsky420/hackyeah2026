import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createLlm } from "@/lib/llm/chain";
import { healthOf, noteFailure, probe, PROBE_TTL_MS, resetLlmHealth } from "@/lib/llm/health";
import type { LlmProvider } from "@/lib/llm/provider";
import { LlmError, type LlmCall } from "@/lib/llm/types";
import { modelNotice } from "@/server/admin/model-notice";

/* Whether the language model answers (src/lib/llm/health.ts, decision A.14), and the panel's warning. */

type Behaviour = { fail?: LlmError; configured?: boolean };

function provider(id: string, behaviour: Behaviour = {}): LlmProvider & { calls: string[]; set(next: Behaviour): void } {
  let current = behaviour;
  const calls: string[] = [];
  return {
    id,
    name: "openai-compatible",
    model: `${id}-model`,
    configured: behaviour.configured ?? true,
    calls,
    set(next) {
      current = next;
    },
    async call<T>(request: LlmCall<T>) {
      calls.push(request.task);
      if (current.fail) throw current.fail;
      return { parsed: request.schema.parse({ ok: true, answer: "x" }), usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 }, model: `${id}-model` };
    },
  };
}

const rejected = new LlmError("unavailable", "screen", "bielik: unavailable 401", "openai-compatible", 401);

beforeEach(() => {
  resetLlmHealth();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("the health of the first configured provider", () => {
  it("is unknown before any note, then follows the probe", async () => {
    const bielik = provider("bielik");
    expect(healthOf([bielik], false).status).toBe("unknown");
    await probe([bielik], false);
    expect(bielik.calls).toEqual(["probe"]);
    expect(healthOf([bielik], false)).toMatchObject({ status: "ok", provider: "bielik", model: "bielik-model", since: null });
  });

  it("is degraded with the HTTP status while the key is rejected, since the first failure, and ok again after an answer", async () => {
    const bielik = provider("bielik", { fail: rejected });
    noteFailure(bielik, rejected, Date.parse("2026-10-05T08:00:00Z"));
    noteFailure(bielik, rejected, Date.parse("2026-10-05T09:00:00Z"));
    expect(healthOf([bielik], false)).toMatchObject({ status: "degraded", since: "2026-10-05T08:00:00.000Z", kind: "unavailable", httpStatus: 401, checkedAt: "2026-10-05T09:00:00.000Z" });
    bielik.set({});
    await probe([bielik], false, Date.parse("2026-10-05T09:10:00Z"));
    expect(healthOf([bielik], false).status).toBe("ok");
  });

  it("counts a refusal or a malformed answer as an answer", () => {
    const bielik = provider("bielik");
    noteFailure(bielik, new LlmError("refusal", "screen", "refused", "openai-compatible"));
    noteFailure(bielik, new LlmError("invalid_output", "screen", "bad json", "openai-compatible"));
    expect(healthOf([bielik], false).status).toBe("ok");
  });

  it("probes at most once in five minutes, and one probe at a time", async () => {
    const bielik = provider("bielik");
    const start = Date.now();
    await Promise.all([probe([bielik], false, start), probe([bielik], false, start)]);
    await probe([bielik], false, start + PROBE_TTL_MS - 1_000);
    expect(bielik.calls).toHaveLength(1);
    await probe([bielik], false, Date.now() + PROBE_TTL_MS + 1_000);
    expect(bielik.calls).toHaveLength(2);
  });

  it("is about the first configured provider, says when none is, and stays out of the recording's way", async () => {
    const off = provider("bielik", { configured: false });
    const anthropic = provider("anthropic");
    expect(healthOf([off, anthropic], false).provider).toBe("anthropic");
    expect(healthOf([off], false).status).toBe("unconfigured");
    expect(healthOf([], true).status).toBe("replay");
    await probe([], true);
    await probe([off], false);
    expect(off.calls).toEqual([]);
  });

  it("takes the notes of the chain's calls, so a failing head shows even when the fallback answers", async () => {
    const bielik = provider("bielik", { fail: rejected });
    const anthropic = provider("anthropic");
    const llm = createLlm({ providers: [bielik, anthropic], replay: null, timeouts: { screenMs: 1_000, defaultMs: 1_000, maxRetries: 0 }, log: () => {} });
    const schema = z.object({ answer: z.string() });
    await llm({ task: "screen", system: "S", promptVersion: "screen-v1", user: "U", schema, effort: "low", maxTokens: 10 });
    expect(healthOf([bielik, anthropic], false)).toMatchObject({ status: "degraded", provider: "bielik", httpStatus: 401 });
  });
});

describe("the panel's warning", () => {
  const base = { provider: "bielik", model: "speakleash/Bielik-11B-v3.0-Instruct", since: "2026-10-05T08:00:00.000Z", checkedAt: "2026-10-05T09:00:00.000Z" };

  it("says the key was rejected, since when and on which model", () => {
    const notice = modelNotice({ ...base, status: "degraded", kind: "unavailable", httpStatus: 401 });
    expect(notice?.title).toBe("Model językowy nie odpowiada");
    expect(notice?.text).toContain("Od 5.10.2026, 10:00 model speakleash/Bielik-11B-v3.0-Instruct odpowiada błędem: dostawca odrzucił klucz dostępu (kod 401).");
  });

  it("names a limit, another status and a timeout in words", () => {
    expect(modelNotice({ ...base, status: "degraded", kind: "unavailable", httpStatus: 429 })?.text).toContain("przekroczono limit zapytań");
    expect(modelNotice({ ...base, status: "degraded", kind: "unavailable", httpStatus: 503 })?.text).toContain("serwis odpowiada kodem 503");
    expect(modelNotice({ ...base, status: "degraded", kind: "timeout", httpStatus: null })?.text).toContain("nie odpowiedział na czas");
  });

  it("warns of a live server without a model, and is silent while it answers, before a note and on the recording", () => {
    expect(modelNotice({ ...base, status: "unconfigured", kind: null, httpStatus: null })?.title).toBe("Brak modelu językowego");
    for (const status of ["ok", "unknown", "replay"] as const) expect(modelNotice({ ...base, status, kind: null, httpStatus: null })).toBeNull();
  });
});
