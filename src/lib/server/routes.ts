import "server-only";
import { randomInt } from "node:crypto";
import type { RoleCode } from "@/lib/contracts/catalogue";
import type { Route } from "@/lib/contracts/route";
import { getGmina } from "@/lib/mock/data";
import { getExampleRoute, withRouteId } from "@/lib/mock/routes";
import { pickScenario } from "@/lib/mock/scenarios";
import { countEvent, newId, nowIso, store } from "./store";

/**
 * Stand-in for the pipeline of 7.12 and 7.3 to 7.4: screens the text by
 * keywords, takes the matching example as the result and stores it with the
 * reader's own input under a new id. A text that leads to human help is not
 * stored (FR-2.5).
 */
export function createRoute(input: { problemText: string; placeTerc: string | null; role: RoleCode | null }): Route {
  const template = getExampleRoute(pickScenario(input.problemText));
  if (!template) throw new Error("No example route for the scenario");

  let id = newId("rt");
  while (store.routes.has(id)) id = newId("rt");
  const route = withRouteId(template, id);
  const gmina = getGmina(input.placeTerc);

  route.created_at = nowIso();
  route.input = {
    problem_text: route.mode === "redirected" ? null : input.problemText,
    place_terc: gmina?.terc ?? null,
    place_name: gmina?.name ?? null,
    role: input.role,
    target_groups: template.input.target_groups,
  };
  if (route.mode === "declined") route.reference_code = `HM-${new Date().getFullYear()}-${randomInt(1000, 10000)}`;

  store.routes.set(id, route);
  countEvent(`route_created:${route.mode}`);
  return route;
}

/** A stored route, or one of the examples that exist in every run. */
export function getRoute(id: string): Route | undefined {
  return store.routes.get(id) ?? getExampleRoute(id);
}
