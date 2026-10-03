import { repository } from "@/server/db";
import { json, withConsole } from "@/server/console/api";
import { loadStats } from "@/server/console/stats";

/** GET /api/rops/stats (9.2, FR-9.3, FR-10.2): the statistics of the "Miary" tab as JSON. */
export async function GET(request: Request) {
  return withConsole(request, async () => json(await loadStats(repository())));
}
