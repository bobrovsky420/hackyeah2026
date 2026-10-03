import { isRoleCode, targetGroupCodes } from "@/lib/labels";
import { getGmina } from "@/lib/mock/data";
import { allowRouteRequest, clientAddress } from "@/lib/server/rate-limit";
import { createRoute, simulateWork } from "@/lib/server/routes";
import { invalid, readJson, requiredText, stringList } from "@/lib/server/validate";

/**
 * Mock of POST /api/routes (9.2): the rate limit of FR-2.4, the intake
 * validation of FR-2.1, then a route in the shape of 8.4; returns its id.
 */
export async function POST(request: Request) {
  if (!allowRouteRequest(clientAddress(request.headers))) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const body = await readJson(request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  const problemText = requiredText(body.problem_text, 2000, 20);
  if (!problemText) return invalid("problem_text");
  const placeTerc = typeof body.place_terc === "string" && getGmina(body.place_terc) ? body.place_terc : null;
  const role = isRoleCode(body.role) ? body.role : null;
  const targetGroups = stringList(body.target_groups, targetGroupCodes);

  await simulateWork();
  const route = createRoute({ problemText, placeTerc, role, targetGroups });
  return Response.json({ id: route.id, mode: route.mode });
}
