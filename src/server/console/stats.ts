import { getInnovation } from "@/lib/catalogue";
import type { ContactRequest, ContactStatus, Need, RouteMode } from "@/lib/contracts";
import { getLlmCounters, type LlmCounter } from "@/lib/llm/observability";
import { placeText } from "@/lib/places";
import type { Counters, Repository, RouteFacts } from "@/server/db";

/*
 * The statistics of FR-9.3 and FR-10.2 for the "Miary" tab (FR-10.3) and
 * GET /api/rops/stats: the event counters (no cookies, nothing personal),
 * what the stored entries say now (needs and contact requests without the
 * examples, the recommended innovations and the latency of the stored
 * routes), and the model calls of 12.8, which are counted in the server's
 * memory since its start.
 */

export const routeModes: RouteMode[] = ["route", "partial", "none", "redirected", "declined", "off_topic"];
const contactStatusCodes: ContactStatus[] = ["nowe", "przekazane", "zamkniete"];
const TOP_INNOVATIONS = 10;

export interface LlmStatsRow {
  provider: string;
  model: string;
  calls: number;
  failures: number;
  replayed: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
}

export interface ConsoleStats {
  generated_at: string;
  /** Since when the event counters count. */
  since: string;
  /** route_created per mode (FR-10.2). */
  routes_by_mode: Record<RouteMode, number>;
  events: {
    contact_requested: number;
    need_saved: number;
    brief_generated: number;
    readiness_registered: number;
    content_reported: number;
    feedback_given: { tak: number; czesciowo: number; nie: number };
  };
  /** The stored requests now, per status. */
  contact_requests: { total: number; by_status: Record<ContactStatus, number> };
  /** The stored needs now, without the examples. */
  needs: {
    total: number;
    /** Per target group; a need counts once for each of its groups, "" for none. */
    by_category: { code: string; count: number }[];
    by_gmina: { terc: string | null; name: string; count: number }[];
  };
  /** The innovations recommended in the most stored routes. */
  top_innovations: { innovation_id: string; title: string; routes: number }[];
  /** Over the stored routes that were computed, not replayed from the cache. */
  latency: { routes: number; median_ms: number | null; p95_ms: number | null };
  /** The model calls since the server started, in its memory only. */
  llm: { scope: "memory"; providers: LlmStatsRow[]; total: Omit<LlmStatsRow, "provider" | "model"> };
}

/** The median; the mean of the two middle values for an even count. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The nearest-rank percentile: the smallest value with at least p per cent of the values at or below it. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

/** Count per key, largest first, ties by key. */
function tally<K extends string | null>(keys: K[]): { key: K; count: number }[] {
  const counts = new Map<K, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || String(a.key ?? "").localeCompare(String(b.key ?? ""), "pl"));
}

export interface StatsInput {
  counters: Counters;
  routes: RouteFacts[];
  needs: Need[];
  contacts: ContactRequest[];
  llm: LlmCounter[];
  now: string;
  titleOf?: (innovationId: string) => string;
  placeOf?: (terc: string | null) => string;
}

export function computeStats(input: StatsInput): ConsoleStats {
  const { counts } = input.counters;
  const count = (name: string) => counts[name] ?? 0;
  const titleOf = input.titleOf ?? ((id: string) => getInnovation(id)?.title ?? id);
  const placeOf = input.placeOf ?? placeText;

  const needs = input.needs.filter((need) => !need.example);
  const recommended = input.routes.flatMap((route) => [...new Set(route.solution_ids)]);
  const latencies = input.routes.filter((route) => !route.cached).map((route) => route.latency_ms);

  const providers: LlmStatsRow[] = input.llm
    .map((row) => ({
      provider: row.provider,
      model: row.model,
      calls: row.calls,
      failures: row.failures,
      replayed: row.replayed,
      input_tokens: row.inputTokens,
      output_tokens: row.outputTokens,
      cache_read_tokens: row.cacheReadTokens,
      cost_usd: row.costUsd,
    }))
    .sort((a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model));
  const sum = (field: keyof Omit<LlmStatsRow, "provider" | "model">) => providers.reduce((total, row) => total + row[field], 0);

  return {
    generated_at: input.now,
    since: input.counters.since,
    routes_by_mode: Object.fromEntries(routeModes.map((mode) => [mode, count(`route_created:${mode}`)])) as Record<RouteMode, number>,
    events: {
      contact_requested: count("contact_requested"),
      need_saved: count("need_saved"),
      brief_generated: count("brief_generated"),
      readiness_registered: count("readiness_registered"),
      content_reported: count("content_reported"),
      feedback_given: {
        tak: count("feedback_given:tak"),
        czesciowo: count("feedback_given:czesciowo"),
        nie: count("feedback_given:nie"),
      },
    },
    contact_requests: {
      total: input.contacts.length,
      by_status: Object.fromEntries(
        contactStatusCodes.map((status) => [status, input.contacts.filter((contact) => contact.status === status).length]),
      ) as Record<ContactStatus, number>,
    },
    needs: {
      total: needs.length,
      by_category: tally(needs.flatMap((need) => (need.target_groups.length > 0 ? need.target_groups : [""]))).map(
        ({ key, count }) => ({ code: key, count }),
      ),
      by_gmina: tally(needs.map((need) => need.place_terc)).map(({ key, count }) => ({ terc: key, name: placeOf(key), count })),
    },
    top_innovations: tally(recommended)
      .slice(0, TOP_INNOVATIONS)
      .map(({ key, count }) => ({ innovation_id: key, title: titleOf(key), routes: count })),
    latency: { routes: latencies.length, median_ms: median(latencies), p95_ms: percentile(latencies, 95) },
    llm: {
      scope: "memory",
      providers,
      total: {
        calls: sum("calls"),
        failures: sum("failures"),
        replayed: sum("replayed"),
        input_tokens: sum("input_tokens"),
        output_tokens: sum("output_tokens"),
        cache_read_tokens: sum("cache_read_tokens"),
        cost_usd: sum("cost_usd"),
      },
    },
  };
}

export async function loadStats(repo: Repository, now = new Date().toISOString()): Promise<ConsoleStats> {
  const [counters, routes, needs, contacts] = await Promise.all([
    repo.counters(),
    repo.listRouteFacts(),
    repo.listNeeds(),
    repo.listContacts(),
  ]);
  return computeStats({ counters, routes, needs, contacts, llm: getLlmCounters(), now });
}
