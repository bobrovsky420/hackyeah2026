import { getGmina } from "@/lib/catalogue";
import { isRoleCode, targetGroupCodes } from "@/lib/labels";
import { allowRouteRequest, clientAddress } from "@/server/rate-limit";
import { createRoute } from "@/server/route-service";
import { invalid, readJson, requiredText, stringList } from "@/server/validate";
import { PipelineUnavailableError } from "@/server/pipeline";
import { traced } from "@/lib/telemetry";

/**
 * POST /api/routes (9.2): the rate limit of FR-2.4, the intake validation
 * of FR-2.1, then the route engine (gate, matching, composition); returns
 * the new route's id, or the id of the route an identical request of the
 * same client got within the hour, with `repeated: true` (FR-12.14). 503
 * with `{fallback: "cache"}` when the model failed at every provider and no
 * cached route exists.
 */
async function post(request: Request) {
  const client = clientAddress(request.headers);
  if (!allowRouteRequest(client)) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const body = await readJson(request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  const problemText = requiredText(body.problem_text, 2000, 20);
  if (!problemText) return invalid("problem_text");
  const placeTerc = typeof body.place_terc === "string" && getGmina(body.place_terc) ? body.place_terc : null;
  const role = isRoleCode(body.role) ? body.role : null;
  const targetGroups = stringList(body.target_groups, targetGroupCodes);

  try {
    const { route, repeated } = await createRoute({ problemText, placeTerc, role, targetGroups, client });
    return Response.json({ id: route.id, mode: route.mode, repeated });
  } catch (error) {
    if (error instanceof PipelineUnavailableError) {
      return Response.json({ error: "unavailable", fallback: "cache" }, { status: 503 });
    }
    throw error;
  }
}

export const POST = traced("POST /api/routes", post);
