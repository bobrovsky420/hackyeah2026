import { isAuthenticated } from "@/lib/server/auth";
import { briefForNeed } from "@/server/needs";

export const dynamic = "force-dynamic";

/**
 * POST /api/needs/{id}/brief (9.2, FR-5.5): the brief of a stored need,
 * generated and stored on the first call (8.5) and returned as stored on
 * every later one. `?refresh=1` generates it again, for the ROPS console
 * only: a new generation costs model calls.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  const { id } = await params;
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  if (refresh && !(await isAuthenticated())) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  const brief = await briefForNeed(id, { refresh });
  if (!brief) return Response.json({ error: "not_found" }, { status: 404, headers });
  return Response.json(brief, { headers });
}
