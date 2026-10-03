import { targetGroupCodes } from "@/lib/labels";
import { openNeedsView } from "@/server/needs";

export const dynamic = "force-dynamic";

/**
 * GET /api/needs/open (9.2, FR-5.6, J8): the anonymised needs a person at
 * ROPS approved and whose authors allowed publication: gmina, category,
 * summary and date, never a reporter field. `?category=` takes a target
 * group code, `?terc=` a seven-digit TERC; anything else is 422.
 */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const query = new URL(request.url).searchParams;
  const category = query.get("category") || null;
  const terc = query.get("terc") || null;
  if (category && !targetGroupCodes.includes(category)) return Response.json({ error: "invalid", field: "category" }, { status: 422, headers });
  if (terc && !/^\d{7}$/.test(terc)) return Response.json({ error: "invalid", field: "terc" }, { status: 422, headers });
  return Response.json(await openNeedsView({ category, terc }), { headers });
}
