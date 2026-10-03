import { repository } from "@/server/db";
import { invalidField, json, withConsole } from "@/server/console/api";
import { contactFilterFrom, listContactsFiltered } from "@/server/console/queries";

/**
 * GET /api/rops/contact-requests (9.2, FR-9.2): the contact requests with
 * the filters of the console's page: `?status=&gmina=` (the gmina of the
 * request's route).
 */
export async function GET(request: Request) {
  return withConsole(request, async () => {
    const filter = contactFilterFrom(new URL(request.url).searchParams);
    if (!filter.ok) return invalidField(filter.field);
    const items = await listContactsFiltered(repository(), filter.value);
    return json({ items, count: items.length });
  });
}
