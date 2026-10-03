import { briefForNeed } from "@/server/needs";
import { traced } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

/**
 * POST /api/needs/{id}/brief (9.2, FR-5.5): the brief of a stored need,
 * generated and stored on the first call (8.5) and returned as stored on
 * every later one: a new generation costs model calls.
 */
async function post(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  const { id } = await params;
  const brief = await briefForNeed(id);
  if (!brief) return Response.json({ error: "not_found" }, { status: 404, headers });
  return Response.json(brief, { headers });
}

export const POST = traced("POST /api/needs/[id]/brief", post);
