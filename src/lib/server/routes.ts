import "server-only";
import { randomInt } from "node:crypto";
import type { RoleCode } from "@/lib/contracts/catalogue";
import type { Route } from "@/lib/contracts/route";
import { getGmina } from "@/lib/mock/data";
import { withPlaceFacts } from "@/lib/mock/implementations";
import { getExampleRoute, withRouteId } from "@/lib/mock/routes";
import { pickScenario } from "@/lib/mock/scenarios";
import { REDACTED, redact } from "./redact";
import { countEvent, newId, nowIso, store } from "./store";

/* The time the real pipeline takes (12.3: a route within 15 s), shortened for the prototype. */
const SIMULATED_WORK_MS = 3500;

export function simulateWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, SIMULATED_WORK_MS));
}

export interface RouteInput {
  problemText: string;
  placeTerc: string | null;
  role: RoleCode | null;
  /** Given by the reader, as the answer to the question of FR-2.3. */
  targetGroups: string[];
}

/**
 * Stand-in for the pipeline of 7.12 and 7.3 to 7.4: removes personal data
 * (FR-12.4), screens the text by keywords, takes the matching example as
 * the result, fills the facts that depend on the reader's gmina and stores
 * it under a new id. A text that leads to human help is not stored (FR-2.5).
 */
export function createRoute(input: RouteInput): Route {
  const text = redact(input.problemText).text;
  const scenario = pickScenario(text, input.targetGroups);
  const template = getExampleRoute(scenario.routeId);
  if (!template) throw new Error("No example route for the scenario");

  let id = newId("rt");
  while (store.routes.has(id)) id = newId("rt");
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
  store.routes.set(id, stored);
  countEvent(`route_created:${stored.mode}`);
  return stored;
}

/** A stored route, or one of the examples that exist in every run. */
export function getRoute(id: string): Route | undefined {
  return store.routes.get(id) ?? getExampleRoute(id);
}
