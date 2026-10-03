import type { RoleCode, Readiness, Route, Embed, StageLog } from "@/lib/contracts";
import type { Dataset } from "@/lib/data/to-contracts";
import { LlmError, loadPrompt } from "@/lib/llm";
import { estimateCostUsd } from "@/lib/llm/observability";
import type { Llm } from "@/lib/llm/types";
import { emit, setTraceRoute } from "@/lib/telemetry";
import { screenText } from "@/server/gate";
import { matchNeed } from "@/server/match";
import { buildScreenedRoute, composeRoute } from "@/server/route";
import { reissue, type RouteCache, type RouteCacheKey } from "./route-cache";

/*
 * The route pipeline of 7.12, 7.3 and 7.4 in order: the gate screens and
 * redacts, the matcher retrieves, shortlists and assesses, the composer
 * assembles schema 8.4. The replay cache of FR-3.5 sits between the gate
 * and the matcher, because the key holds the redacted text. Everything the
 * pipeline needs comes in as dependencies, so the evaluation harness and
 * the unit tests run it without a server.
 */

export interface PipelineInput {
  problemText: string;
  placeTerc: string | null;
  role: RoleCode | null;
  /** Given by the reader, as the answer to the question of FR-2.3. */
  targetGroups: string[];
  /** The client address, for the gate's repeat check only (FR-12.14). */
  client: string | null;
  /** "Policz ponownie" (FR-3.5): skip the cache on the way in, refresh it on the way out. */
  bypassCache?: boolean;
}

export interface PipelineDeps {
  llm: Llm;
  dataset: Dataset;
  embed: Embed;
  cache: RouteCache;
  newId: () => string;
  now?: () => Date;
  /**
   * The readiness registry for the route's people (FR-6.5), read only when a
   * route is composed. Without it nobody is counted (the evaluation harness).
   */
  readiness?: () => Promise<Readiness[]>;
}

export interface PipelineResult {
  route: Route;
  stages: StageLog[];
  /** True when the route came from the replay cache. */
  cacheHit: boolean;
  /** False for `redirected`: the route holds no text, and none may be kept anywhere (FR-2.5). */
  keepsText: boolean;
}

/** The model failed at every provider and no cached route exists: 503 with `{fallback: "cache"}` (9.2). */
export class PipelineUnavailableError extends Error {
  constructor(readonly cause: LlmError) {
    super(`route pipeline unavailable: ${cause.kind} at ${cause.task}`);
    this.name = "PipelineUnavailableError";
  }
}

const MODEL_TASKS = ["screen", "shortlist", "assess", "compose"] as const;

function promptVersions(): string[] {
  return MODEL_TASKS.map((task) => loadPrompt(task).version);
}

export async function runPipeline(input: PipelineInput, deps: PipelineDeps): Promise<PipelineResult> {
  const started = Date.now();
  const now = deps.now?.() ?? new Date();
  const createdAt = now.toISOString();
  const today = createdAt.slice(0, 10);
  const id = deps.newId();
  setTraceRoute(id);
  const gmina = input.placeTerc ? deps.dataset.gminaByTerc.get(input.placeTerc) : undefined;
  const placeTerc = gmina?.terc ?? null;

  const gate = await screenText(
    {
      text: input.problemText,
      kind: "need",
      placeName: gmina?.name ?? null,
      client: input.client,
      ref: id,
      repeatScope: JSON.stringify([placeTerc, input.role, [...input.targetGroups].sort()]),
      countRepeats: !input.bypassCache,
    },
    { llm: deps.llm },
  );
  const stages: StageLog[] = gate.stage ? [gate.stage] : [];
  const routeInput: Route["input"] = {
    problem_text: gate.redactedText,
    place_terc: placeTerc,
    place_name: gmina?.name ?? null,
    role: input.role,
    target_groups: input.targetGroups,
  };
  const finish = (route: Route, cacheHit: boolean): PipelineResult => {
    route.engine = { ...route.engine, latency_ms: Date.now() - started, cached: cacheHit || route.engine.cached };
    try {
      logRequest(route, stages, cacheHit, input);
    } catch (error) {
      // A log line never fails the request.
      emit("route_log_failed", { error: error instanceof Error ? error.name : "Error" });
    }
    return { route, stages, cacheHit, keepsText: route.mode !== "redirected" };
  };

  if (gate.screening.outcome !== "need") {
    return finish(buildScreenedRoute(id, createdAt, routeInput, gate, deps.dataset), false);
  }

  const key: RouteCacheKey = {
    text: gate.redactedText,
    placeTerc,
    role: input.role,
    targetGroups: input.targetGroups,
    dataVersion: deps.dataset.version,
    promptVersions: promptVersions(),
  };
  if (!input.bypassCache) {
    const cached = deps.cache.get(key);
    if (cached) return finish(reissue(cached, id, createdAt), true);
  }

  try {
    const match = await matchNeed(
      {
        needText: gate.redactedText,
        needSummary: gate.screening.need_summary_pl,
        placeTerc,
        role: input.role,
        targetGroups: input.targetGroups,
      },
      { llm: deps.llm, dataset: deps.dataset, embed: deps.embed },
    );
    stages.push(...match.stages);
    const composed = await composeRoute(
      { routeId: id, createdAt, input: routeInput, gate, match },
      { llm: deps.llm, dataset: deps.dataset, today, readiness: (await deps.readiness?.()) ?? [] },
    );
    if (composed.stage) stages.push(composed.stage);
    deps.cache.set(key, composed.route);
    return finish(composed.route, false);
  } catch (error) {
    if (!(error instanceof LlmError)) throw error;
    // FR-12.12: a refusal that survived the provider's fallback is the mild declined, never an error.
    if (error.kind === "refusal") return finish(buildScreenedRoute(id, createdAt, routeInput, gate, deps.dataset), false);
    // 12.4: a cached route, even on "Policz ponownie", before an error screen.
    const cached = deps.cache.get(key);
    if (cached) return finish(reissue(cached, id, createdAt), true);
    throw new PipelineUnavailableError(error);
  }
}

/**
 * One `route_completed` line per route for the request log (FR-3.6, 12.8):
 * the input's codes, the stages with tokens, drops and cost, and what the
 * route shows. Never the reader's text.
 */
function logRequest(route: Route, stages: StageLog[], cacheHit: boolean, input: PipelineInput) {
  emit("route_completed", {
    engine: "live",
    mode: route.mode,
    cache_hit: cacheHit,
    bypass_cache: input.bypassCache ?? false,
    latency_ms: route.engine.latency_ms,
    place_terc: route.input.place_terc,
    powiat_terc: route.input.place_terc?.slice(0, 4) ?? null,
    role: route.input.role,
    target_groups_given: route.input.target_groups,
    text_length: input.problemText.length,
    screening_category: route.screening.category,
    sensitive_topics: route.screening.sensitive_topics,
    redactions: route.screening.redactions,
    crisis_banner: route.screening.crisis_banner,
    clarification_needed: route.clarification_needed,
    solution_ids: route.solutions.map((solution) => solution.innovation_id),
    fit_scores: route.solutions.map((solution) => solution.fit_score),
    path_ids: route.path.paths.map((entry) => entry.path_id),
    innovators: route.people.innovators.length,
    implementers_nearby: route.people.implementers_nearby.length,
    knowledge: route.knowledge.length,
    input_tokens: sum(stages, (stage) => stage.inputTokens),
    output_tokens: sum(stages, (stage) => stage.outputTokens),
    cost_usd: Math.round(sum(stages, (stage) => estimateCostUsd(stage.model, stage)) * 1e6) / 1e6,
    stages: stages.map((stage) => ({
      stage: stage.stage,
      provider: stage.provider,
      model: stage.model,
      prompt_version: stage.promptVersion,
      latency_ms: stage.latencyMs,
      input_tokens: stage.inputTokens,
      output_tokens: stage.outputTokens,
      cache_read_tokens: stage.cacheReadTokens,
      cached: stage.cached,
      dropped_ids: stage.droppedIds,
      dropped_reasons: stage.droppedReasons,
      notes: stage.notes,
    })),
  });
}

function sum<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}
