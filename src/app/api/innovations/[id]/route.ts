import { getInnovation, implementationsOf } from "@/lib/catalogue";
import { t } from "@/lib/i18n";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/innovations/{id} (9.2): the innovation of S5 with the fields of
 * its attribution line (source, sourceUrl, licence, retrievedAt; FR-1.8)
 * and its known implementations (8.6).
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/innovations/[id]">) {
  const { id } = await params;
  const item = getInnovation(id);
  if (!item) return Response.json({ error: "not_found", message: t("api.innovation.notFound") }, { status: 404, headers: NO_STORE });
  return Response.json({ ...item, implementations: implementationsOf(id) }, { headers: NO_STORE });
}
