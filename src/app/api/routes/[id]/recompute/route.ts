import { allowRouteRequest, clientAddress } from "@/lib/server/rate-limit";
import { createRoute, getRoute } from "@/lib/server/routes";
import { PipelineUnavailableError } from "@/server/pipeline";

/**
 * POST /api/routes/{id}/recompute (9.2, FR-3.5): "Policz ponownie" runs the
 * pipeline again on the stored input, bypassing the replay cache, and
 * returns the new route's id.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/routes/[id]/recompute">) {
  const client = clientAddress(request.headers);
  if (!allowRouteRequest(client)) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const { id } = await params;
  const route = await getRoute(id);
  if (!route?.input.problem_text) return Response.json({ error: "not_found" }, { status: 404 });

  try {
    const { route: next } = await createRoute({
      problemText: route.input.problem_text,
      placeTerc: route.input.place_terc,
      role: route.input.role,
      targetGroups: route.input.target_groups,
      client,
      bypassCache: true,
    });
    return Response.json({ id: next.id, mode: next.mode });
  } catch (error) {
    if (error instanceof PipelineUnavailableError) {
      return Response.json({ error: "unavailable", fallback: "cache" }, { status: 503 });
    }
    throw error;
  }
}
