import { beforeAll, describe, expect, it } from "vitest";
import type { Readiness, Route } from "@/lib/contracts";
import { loadDataset } from "@/lib/data/load";
import type { Dataset } from "@/lib/data/to-contracts";
import { LlmError, type Llm, type LlmCall, type LlmErrorKind, type LlmTask } from "@/lib/llm/types";
import { PipelineUnavailableError, runPipeline, type PipelineDeps } from "@/server/pipeline";
import { createMemoryRouteCache, reissue, type RouteCache } from "@/server/route-cache";

/*
 * The pipeline's own decisions (7.12, FR-3.5, FR-12.12, 12.4), with a fake
 * model per task. The modules it runs have their own tests; these check
 * the order, the cache and the error handling between them.
 */

let dataset: Dataset;
beforeAll(() => {
  dataset = loadDataset();
});

const NEED = "W naszej gminie wiejskiej samotni seniorzy nie mają gdzie spędzać dnia, brakuje dziennego wsparcia.";

/** The gate answers "need"; every later task throws the given error kind, except the ones answered. */
function llmFailingAfterGate(kind: LlmErrorKind, calls: LlmTask[] = [], answers: Partial<Record<LlmTask, unknown>> = {}): Llm {
  return (async <T>(call: LlmCall<T>) => {
    calls.push(call.task);
    if (call.task !== "screen" && !(call.task in answers)) throw new LlmError(kind, call.task, "fake failure", "fake");
    const parsed = answers[call.task] ?? {
      category: "need",
      confidence: 0.9,
      individual_case: false,
      sensitive_topics: [],
      person_names: [],
      need_summary_pl: "Samotni seniorzy bez dziennego wsparcia.",
    };
    return {
      parsed: parsed as T,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0 },
      latencyMs: 1,
      provider: "fake",
      model: "fake-model",
      promptVersion: call.promptVersion,
      cached: false,
    };
  }) as Llm;
}

function deps(llm: Llm, cache: RouteCache = createMemoryRouteCache(), readiness?: PipelineDeps["readiness"]): PipelineDeps {
  let n = 0;
  return {
    readiness,
    llm,
    dataset,
    // The retriever falls back to its lexical scorer.
    embed: async () => {
      throw new Error("no embedding service in unit tests");
    },
    cache,
    newId: () => `rt-test-${++n}`,
    now: () => new Date("2026-10-03T12:00:00Z"),
  };
}

// Each run from its own client: the gate counts identical texts per client as spam (FR-12.14).
let clients = 0;
const input = {
  problemText: NEED,
  placeTerc: "1207062",
  role: null,
  targetGroups: [],
  get client() {
    return `test-${++clients}`;
  },
};

describe("runPipeline", () => {
  it("redirects a first-person crisis before any model call and keeps no text", async () => {
    const calls: LlmTask[] = [];
    const result = await runPipeline(
      { ...input, problemText: "Nie chcę już żyć, nie widzę sensu, nikt mi nie pomoże w tej sytuacji." },
      deps(llmFailingAfterGate("unavailable", calls)),
    );
    expect(result.route.mode).toBe("redirected");
    expect(result.route.input.problem_text).toBeNull();
    expect(result.keepsText).toBe(false);
    expect(calls).toEqual([]);
  });

  it("turns a model refusal after the gate into the mild declined (FR-12.12)", async () => {
    const result = await runPipeline(input, deps(llmFailingAfterGate("refusal")));
    expect(result.route.mode).toBe("declined");
    expect(result.route.reference_code).toMatch(/^HM-2026-\d{4}$/);
    expect(result.route.mode_reason_pl).toBeTruthy();
    expect(result.keepsText).toBe(true);
  });

  it("fails with PipelineUnavailableError when every provider fails and nothing is cached", async () => {
    await expect(runPipeline(input, deps(llmFailingAfterGate("unavailable")))).rejects.toBeInstanceOf(PipelineUnavailableError);
  });

  it("serves a cached route, reissued, when the providers fail (12.4), even on Policz ponownie", async () => {
    const cache = createMemoryRouteCache();
    // Seed the cache under the key the pipeline computes, by running it once with a cache that records the key.
    const keys: Parameters<RouteCache["get"]>[0][] = [];
    const spy: RouteCache = { get: (key) => (keys.push(key), null), set: cache.set };
    await expect(runPipeline(input, deps(llmFailingAfterGate("unavailable"), spy))).rejects.toBeInstanceOf(
      PipelineUnavailableError,
    );
    const template = { id: "rt-old", links: "/kontakt?droga=rt-old" } as unknown as Route;
    cache.set(keys[0], { ...template, engine: { cached: false } } as unknown as Route);

    const result = await runPipeline({ ...input, bypassCache: true }, deps(llmFailingAfterGate("unavailable"), cache));
    expect(result.cacheHit).toBe(true);
    expect(result.route.id).toBe("rt-test-1");
    expect(JSON.stringify(result.route)).not.toContain("rt-old");
    expect(result.route.engine.cached).toBe(true);
  });

  it("answers from the cache without a model call after the gate", async () => {
    const cache = createMemoryRouteCache();
    const keys: Parameters<RouteCache["get"]>[0][] = [];
    const spy: RouteCache = { get: (key) => (keys.push(key), cache.get(key)), set: cache.set };
    await runPipeline(input, deps(llmFailingAfterGate("unavailable"), spy)).catch(() => undefined);
    cache.set(keys[0], { id: "rt-old", engine: { cached: false } } as unknown as Route);

    const calls: LlmTask[] = [];
    const result = await runPipeline(input, deps(llmFailingAfterGate("unavailable", calls), spy));
    expect(result.cacheHit).toBe(true);
    expect(calls).toEqual(["screen"]);
  });
});

describe("the readiness registry (FR-6.5)", () => {
  const entry: Readiness = {
    id: "gt-1",
    created_at: "2026-10-01T10:00:00.000Z",
    display_name: "Stowarzyszenie Seniorzy Razem",
    is_organisation: true,
    place_terc: "1207062",
    topics: ["seniorzy"],
    channel: { type: "email", value: "kontakt@example.org" },
    consent_display_name: true,
    consent: { text_version: "v1", timestamp: "2026-10-01T10:00:00.000Z" },
    verification: { status: "zweryfikowane", reviewer: "rops", decided_at: "2026-10-01T11:00:00.000Z" },
    retention_until: "2027-10-01",
    note_pl: null,
  };

  it("is read through the loader when a route is composed, and reaches the route only as a count and a name", async () => {
    let loads = 0;
    const loader = async () => (loads++, [entry]);
    // No candidate: the matcher answers "none" without an assessment, and the composer writes no model text for it.
    const llm = llmFailingAfterGate("unavailable", [], {
      shortlist: { need_summary_pl: "Samotni seniorzy.", detected_target_groups: ["seniorzy"], detected_domains: [], candidates: [] },
    });
    const result = await runPipeline(input, deps(llm, createMemoryRouteCache(), loader));
    expect(result.route.mode).toBe("none");
    expect(loads).toBe(1);
    expect(result.route.people.readiness).toEqual({ count: 1, names_with_consent: ["Stowarzyszenie Seniorzy Razem"] });
    expect(JSON.stringify(result.route)).not.toContain("kontakt@example.org");
  });

  it("is not read for a route the gate redirected", async () => {
    let loads = 0;
    const result = await runPipeline(
      { ...input, problemText: "Nie chcę już żyć, nie widzę sensu, nikt mi nie pomoże w tej sytuacji." },
      deps(llmFailingAfterGate("unavailable"), createMemoryRouteCache(), async () => (loads++, [entry])),
    );
    expect(result.route.mode).toBe("redirected");
    expect(loads).toBe(0);
  });
});

describe("reissue", () => {
  it("moves every occurrence of the old id and marks the route cached", () => {
    const route = { id: "rt-a", created_at: "x", next_steps: [{ link: "/kontakt?droga=rt-a" }], engine: { cached: false } };
    const copy = reissue(route as unknown as Route, "rt-b", "2026-10-03T12:00:00.000Z");
    expect(JSON.stringify(copy)).not.toContain("rt-a");
    expect(copy.created_at).toBe("2026-10-03T12:00:00.000Z");
    expect(copy.engine.cached).toBe(true);
  });
});
