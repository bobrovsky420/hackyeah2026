import { describe, expect, it } from "vitest";
import type { ContactRequest, Need } from "@/lib/contracts/records";
import type { LlmCounter } from "@/lib/llm/observability";
import { computeStats, median, percentile } from "@/server/console/stats";
import type { RouteFacts } from "@/server/db/repository";

/* The statistics of FR-9.3 and FR-10.2 (the "Miary" tab and GET /api/rops/stats). */

const route = (id: string, over: Partial<RouteFacts> = {}): RouteFacts => ({
  id,
  created_at: "2026-10-03T10:00:00.000Z",
  mode: "route",
  place_terc: null,
  latency_ms: 1000,
  cached: false,
  solution_ids: [],
  ...over,
});

const need = (id: string, placeTerc: string | null, groups: string[], example = false) =>
  ({ id, place_terc: placeTerc, target_groups: groups, example }) as unknown as Need;

const contact = (status: ContactRequest["status"]) => ({ status }) as unknown as ContactRequest;

const counter = (provider: string, model: string, over: Partial<LlmCounter> = {}): LlmCounter => ({
  provider,
  model,
  calls: 1,
  failures: 0,
  replayed: 0,
  inputTokens: 100,
  outputTokens: 10,
  cacheReadTokens: 0,
  costUsd: 0.001,
  ...over,
});

describe("median and the 95th percentile", () => {
  it("take the middle, or the mean of the two middle values", () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([9, 1, 5])).toBe(5);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("uses the nearest rank", () => {
    const values = Array.from({ length: 20 }, (_, index) => index + 1);
    expect(percentile(values, 95)).toBe(19);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([3, 1, 2], 95)).toBe(3);
    expect(percentile([], 95)).toBeNull();
  });
});

describe("computeStats", () => {
  const stats = computeStats({
    now: "2026-10-04T12:00:00.000Z",
    counters: {
      since: "2026-10-03T08:00:00.000Z",
      counts: { "route_created:route": 3, "route_created:declined": 1, need_saved: 2, "feedback_given:tak": 4, brief_generated: 1 },
    },
    routes: [
      route("rt-1", { solution_ids: ["inn-a", "inn-b"], latency_ms: 8000 }),
      route("rt-2", { solution_ids: ["inn-b", "inn-c", "inn-b"], latency_ms: 12000 }),
      route("rt-3", { solution_ids: ["inn-b"], latency_ms: 50, cached: true }),
      route("rt-4", { mode: "declined", latency_ms: 400 }),
    ],
    needs: [
      need("nd-1", "1207062", ["seniorzy"]),
      need("nd-2", "1207062", ["seniorzy", "cudzoziemcy"]),
      need("nd-3", null, []),
      need("nd-x", "1261011", ["seniorzy"], true),
    ],
    contacts: [contact("nowe"), contact("nowe"), contact("przekazane")],
    llm: [counter("hf", "bielik", { calls: 3, failures: 1, costUsd: 0.5 }), counter("anthropic", "claude-opus-5", { inputTokens: 50 })],
    titleOf: (id) => `Tytuł ${id}`,
    placeOf: (terc) => (terc ? `Gmina ${terc}` : "cała Małopolska"),
  });

  it("takes the routes by mode and the events from the counters", () => {
    expect(stats.since).toBe("2026-10-03T08:00:00.000Z");
    expect(stats.routes_by_mode).toEqual({ route: 3, partial: 0, none: 0, redirected: 0, declined: 1, off_topic: 0 });
    expect(stats.events).toMatchObject({ need_saved: 2, brief_generated: 1, contact_requested: 0, feedback_given: { tak: 4, czesciowo: 0, nie: 0 } });
  });

  it("counts the stored needs per category and gmina without the examples", () => {
    expect(stats.needs.total).toBe(3);
    expect(stats.needs.by_category).toEqual([
      { code: "seniorzy", count: 2 },
      { code: "", count: 1 },
      { code: "cudzoziemcy", count: 1 },
    ]);
    expect(stats.needs.by_gmina).toEqual([
      { terc: "1207062", name: "Gmina 1207062", count: 2 },
      { terc: null, name: "cała Małopolska", count: 1 },
    ]);
  });

  it("counts the contact requests per status", () => {
    expect(stats.contact_requests).toEqual({ total: 3, by_status: { nowe: 2, przekazane: 1, zamkniete: 0 } });
  });

  it("ranks the innovations by the routes that recommend them, once per route", () => {
    expect(stats.top_innovations).toEqual([
      { innovation_id: "inn-b", title: "Tytuł inn-b", routes: 3 },
      { innovation_id: "inn-a", title: "Tytuł inn-a", routes: 1 },
      { innovation_id: "inn-c", title: "Tytuł inn-c", routes: 1 },
    ]);
  });

  it("measures the latency over the computed routes, not the cache replays", () => {
    expect(stats.latency).toEqual({ routes: 3, median_ms: 8000, p95_ms: 12000 });
  });

  it("reports the model calls per provider and model with a total", () => {
    expect(stats.llm.scope).toBe("memory");
    expect(stats.llm.providers.map((row) => row.provider)).toEqual(["anthropic", "hf"]);
    expect(stats.llm.total).toEqual({
      calls: 4,
      failures: 1,
      replayed: 0,
      input_tokens: 150,
      output_tokens: 20,
      cache_read_tokens: 0,
      cost_usd: 0.501,
    });
  });

  it("keeps at most ten innovations", () => {
    const many = computeStats({
      now: "2026-10-04T12:00:00.000Z",
      counters: { since: "2026-10-03T08:00:00.000Z", counts: {} },
      routes: [route("rt-1", { solution_ids: Array.from({ length: 12 }, (_, index) => `inn-${index}`) })],
      needs: [],
      contacts: [],
      llm: [],
      titleOf: (id) => id,
    });
    expect(many.top_innovations).toHaveLength(10);
    expect(many.llm.total.calls).toBe(0);
    expect(many.latency).toEqual({ routes: 1, median_ms: 1000, p95_ms: 1000 });
  });
});
