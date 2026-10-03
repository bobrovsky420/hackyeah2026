import { dataSource, indicators } from "@/lib/catalogue";

export const dynamic = "force-static";

/**
 * GET /api/map/indicators (9.2, FR-7.2): the GUS indicators of every gmina
 * with the Małopolska medians and the need indicators per target group,
 * static and cached (FR-7.6). A gmina without data (Szczawa, 1207132) has
 * no values: "brak danych".
 */
export function GET() {
  return Response.json(
    { data_version: dataSource().version, ...indicators() },
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
