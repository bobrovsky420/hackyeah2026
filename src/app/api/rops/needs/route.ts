import { repository } from "@/server/db";
import { invalidField, json, withConsole } from "@/server/console/api";
import { needFilterFrom } from "@/server/console/queries";

/**
 * GET /api/rops/needs (9.2, FR-9.2): the needs bank with the filters of the
 * console's "Potrzeby" page: `?status=&gmina=&kategoria=`.
 */
export async function GET(request: Request) {
  return withConsole(request, async () => {
    const filter = needFilterFrom(new URL(request.url).searchParams);
    if (!filter.ok) return invalidField(filter.field);
    const items = await repository().listNeeds(filter.value);
    return json({ items, count: items.length });
  });
}
