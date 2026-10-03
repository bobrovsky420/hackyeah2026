import { allowRouteRequest, clientAddress } from "@/lib/server/rate-limit";
import { createRoute, getRoute, simulateWork } from "@/lib/server/routes";

/**
 * POST /api/routes/{id}/recompute (9.2, FR-3.5): "Policz ponownie" runs the
 * pipeline again on the stored input, bypassing the replay cache, and
 * returns the new route's id.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/routes/[id]/recompute">) {
  if (!allowRouteRequest(clientAddress(request.headers))) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const { id } = await params;
  const route = getRoute(id);
  if (!route?.input.problem_text) return Response.json({ error: "not_found" }, { status: 404 });

  await simulateWork();
  const next = createRoute({
    problemText: route.input.problem_text,
    placeTerc: route.input.place_terc,
    role: route.input.role,
    targetGroups: route.input.target_groups,
  });
  return Response.json({ id: next.id, mode: next.mode });
}
