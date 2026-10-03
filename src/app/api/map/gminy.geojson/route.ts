import { boundaries } from "@/lib/catalogue";

export const dynamic = "force-static";

/**
 * GET /api/map/gminy.geojson (9.2, FR-7.1): the 183 gminas of Małopolska
 * (PRG via the public-domain GeoJSON of 8.8), each keyed by `terc`, static
 * and cached (FR-7.6).
 */
export function GET() {
  return new Response(JSON.stringify(boundaries()), {
    headers: { "Content-Type": "application/geo+json", "Cache-Control": "public, max-age=86400" },
  });
}
