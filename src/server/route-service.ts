import { createHash, randomInt } from "node:crypto";
import { catalogue, getGmina, withPlaceFacts } from "@/lib/catalogue";
import type { RoleCode, Route, Embed } from "@/lib/contracts";
import { envValue, llmProvider } from "@/lib/env";
import { describeLlm, getLlm } from "@/lib/llm";
import { getExampleRoute, withRouteId } from "@/lib/mock/routes";
import { pickScenario } from "@/lib/mock/scenarios";
import { createEmbedClient } from "@/server/match";
import { runPipeline } from "@/server/pipeline";
import { createFileRouteCache, type RouteCache } from "@/server/route-cache";
import { repository } from "@/server/db";
import { isReal } from "@/server/db/repository";
import { REPEAT_WINDOW_MS } from "@/server/gate/thresholds";
import { REDACTED, redact } from "@/server/gate";
import { countEvent, memory, newId, nowIso } from "@/server/ephemeral";
import { loadOverlay, overlayRoute } from "@/server/knowledge/overlay";

/*
 * Creates and reads routes. Two engines: "live" runs the pipeline of
 * src/server/pipeline.ts on the real data and the configured models;
 * "canned" is the prototype's stand-in, which answers with an example
 * route picked by keywords, for the Playwright journeys and for a fresh
 * clone without data/ or a model key. ROUTE_ENGINE=live|canned forces one;
 * by default the app runs live when the real data loaded and a model (or
 * the replay recording) is there.
 */

export type RouteEngine = "live" | "canned";

export function routeEngine(): RouteEngine {
  const forced = envValue("ROUTE_ENGINE");
  if (forced === "live" || forced === "canned") return forced;
  const hasModel = llmProvider() === "replay" || describeLlm().configured.length > 0;
  return catalogue().dataset && hasModel ? "live" : "canned";
}

export interface RouteInput {
  problemText: string;
  placeTerc: string | null;
  role: RoleCode | null;
  /** Given by the reader, as the answer to the question of FR-2.3. */
  targetGroups: string[];
  /** The client address, for the gate's repeat check (FR-12.14). */
  client?: string | null;
  /** "Policz ponownie" (FR-3.5). */
  bypassCache?: boolean;
}

let live: { embed: Embed; cache: RouteCache } | undefined;

/** A route id no stored route has. */
async function newRouteId(): Promise<string> {
  let id = newId("rt");
  while (await repository().getRoute(id)) id = newId("rt");
  return id;
}

/**
 * The key of an identical request (FR-12.14): the client, the text with
 * case and spacing evened out, the place, the role and the target groups.
 */
function requestKey(input: RouteInput): string {
  const text = input.problemText.toLocaleLowerCase("pl-PL").replace(/\s+/g, " ").trim();
  const parts = [input.client ?? "", text, input.placeTerc ?? "", input.role ?? "", [...input.targetGroups].sort().join(",")];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/** The memory of identical requests; created here too, for a server whose memory predates it (next dev). */
function routeRepeats() {
  return (memory.routeRepeats ??= new Map());
}

/** The stored route of the same request from the same client within the hour, if there is one. */
async function previousRoute(key: string, now = Date.now()): Promise<Route | undefined> {
  const repeats = routeRepeats();
  for (const [other, seen] of repeats) {
    if (now - seen.at >= REPEAT_WINDOW_MS) repeats.delete(other);
  }
  const seen = repeats.get(key);
  return seen ? repository().getRoute(seen.routeId) : undefined;
}

/**
 * Answers an identical request of the same client within the hour with
 * the route it already got, without the gate or a model call (FR-12.14:
 * identical texts merged); otherwise runs the engine. "Policz ponownie"
 * always runs it. `repeated` tells the form to open the route at once.
 */
export async function createRoute(input: RouteInput): Promise<{ route: Route; repeated: boolean }> {
  const key = requestKey(input);
  if (!input.bypassCache) {
    const previous = await previousRoute(key);
    if (previous) {
      await countEvent("route_repeated");
      return { route: previous, repeated: true };
    }
  }
  const route = await runEngine(input);
  routeRepeats().set(key, { routeId: route.id, at: Date.now() });
  return { route, repeated: false };
}

/**
 * Runs the engine and stores the route under a new id. A text that leads
 * to human help is not stored (FR-2.5). Throws PipelineUnavailableError
 * when every provider failed and no cached route exists.
 */
async function runEngine(input: RouteInput): Promise<Route> {
  if (routeEngine() === "canned") return createCannedRoute(input);

  const dataset = catalogue().dataset;
  if (!dataset) throw new Error("ROUTE_ENGINE=live needs the real data in data/");
  live ??= { embed: createEmbedClient(), cache: createFileRouteCache() };
  const id = await newRouteId();
  const result = await runPipeline(
    { ...input, client: input.client ?? null },
    {
      llm: getLlm(),
      dataset,
      embed: live.embed,
      cache: live.cache,
      newId: () => id,
      // The route counts real registrations only; the panel's demonstration data stays in the panel.
      readiness: async () => (await repository().listReadiness()).filter(isReal),
    },
  );
  const route = withPlaceFacts(result.route);
  // A redirected route holds no text of the reader (FR-2.5), so it is stored for its page like any other.
  await repository().saveRoute(route);
  await countEvent(`route_created:${route.mode}`);
  return route;
}

/* The time the real pipeline takes (12.3: a route within 15 s), shortened for the canned engine. */
const SIMULATED_WORK_MS = 3500;

/**
 * The prototype's stand-in for the pipeline: removes personal data
 * (FR-12.4), screens the text by keywords, takes the matching example as
 * the result and fills the facts that depend on the reader's gmina.
 */
async function createCannedRoute(input: RouteInput): Promise<Route> {
  await new Promise((resolve) => setTimeout(resolve, SIMULATED_WORK_MS));
  const text = redact(input.problemText).text;
  const scenario = pickScenario(text, input.targetGroups);
  const template = getExampleRoute(scenario.routeId);
  if (!template) throw new Error("No example route for the scenario");

  const id = await newRouteId();
  const route = withRouteId(template, id);
  const gmina = getGmina(input.placeTerc);
  const redirected = route.mode === "redirected";
  const answered = input.targetGroups.length > 0;

  route.created_at = nowIso();
  route.input = {
    problem_text: redirected ? null : text,
    place_terc: gmina?.terc ?? null,
    place_name: gmina?.name ?? null,
    role: input.role,
    target_groups: answered ? input.targetGroups : template.input.target_groups,
  };
  route.screening = {
    ...route.screening,
    // Counted in the stored text, so a recomputed route still says what was removed.
    redactions: redirected ? 0 : text.split(REDACTED).length - 1,
    sensitive_topics: scenario.sensitiveTopics,
    crisis_banner: scenario.sensitiveTopics.length > 0,
  };
  route.clarification_needed = scenario.unrecognised && !gmina;
  if (answered && !redirected) route.people.advisor = { ...route.people.advisor, category: input.targetGroups[0] };
  route.engine = { ...route.engine, cached: false };
  if (route.mode === "declined") route.reference_code = `HM-${new Date().getFullYear()}-${randomInt(1000, 10000)}`;

  const stored = withPlaceFacts(route);
  await repository().saveRoute(stored);
  await countEvent(`route_created:${stored.mode}`);
  return stored;
}

/** A stored route, or one of the examples that exist in every run. */
/** A stored or example route, with the panel's knowledge applied (module VI). */
export async function getRoute(id: string): Promise<Route | undefined> {
  const route = (await repository().getRoute(id)) ?? getExampleRoute(id);
  return route && overlayRoute(route, await loadOverlay());
}
