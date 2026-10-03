import { t } from "@/lib/i18n";
import { repository } from "@/server/db";
import { apiError, consoleContext, invalidField, invalidJson, json, noteOf, readObject, withConsole } from "@/server/console/api";
import { changeRecord } from "@/server/console/decisions";

/**
 * PATCH /api/rops/needs/{id} (9.2, FR-9.2): `{status?, note?}`, the status
 * select and the note field of the "Potrzeby" page; a field left out keeps
 * its value, and `note: null` or "" clears the note. Logged like the page's
 * change. Answers `{item}`, the need.
 */
export async function PATCH(request: Request, { params }: RouteContext<"/api/rops/needs/[id]">) {
  return withConsole(request, async () => {
    const { id } = await params;
    const body = await readObject(request);
    if (!body) return invalidJson();
    const current = await repository().getNeed(id);
    if (!current) return apiError(404, "not_found", t("api.rops.notFound"));
    if (body.status !== undefined && typeof body.status !== "string") return invalidField("status");
    const note = "note" in body ? noteOf(body.note) : current.note_pl;
    if (note === undefined) return invalidField("note");

    const result = await changeRecord(
      { kind: "need", id, status: typeof body.status === "string" ? body.status : current.status, note },
      consoleContext(),
    );
    if (!result.ok) {
      return result.error === "invalid_status" ? invalidField("status") : apiError(404, "not_found", t("api.rops.notFound"));
    }
    return json({ item: result.item });
  });
}
