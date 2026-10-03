import { getInnovation } from "@/lib/catalogue";
import { t } from "@/lib/i18n";
import { needPlaces } from "@/lib/server/map";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/innovations/{id}/places (9.2, FR-7.4): the ten gminas where the
 * need indicator of the innovation's target group stands highest against
 * the Małopolska median and the innovation does not run yet, as
 * [{terc, name, indicator_value, rank}]. The value is that of the first
 * need indicator; the order is the one of "Gdzie jest najbardziej potrzebna".
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/innovations/[id]/places">) {
  const { id } = await params;
  const item = getInnovation(id);
  if (!item) return Response.json({ error: "not_found", message: t("api.innovation.notFound") }, { status: 404, headers: NO_STORE });
  return Response.json(needPlaces(item), { headers: NO_STORE });
}
