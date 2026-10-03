import { getInnovation, implementations } from "@/lib/catalogue";
import { t } from "@/lib/i18n";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/map/implementations?innovation_id= (9.2, 8.6): the known
 * implementations with a gmina, each with the gmina's centroid, in all of
 * Poland (the map marks those with a TERC starting 12); only those of one
 * innovation with the parameter, 404 for an unknown id.
 */
export function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("innovation_id");
  if (id !== null && !getInnovation(id)) {
    return Response.json({ error: "not_found", message: t("api.innovation.notFound") }, { status: 404, headers: NO_STORE });
  }
  const rows = id === null ? implementations() : implementations().filter((item) => item.innovation_id === id);
  return Response.json(rows, { headers: NO_STORE });
}
