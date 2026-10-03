import { t } from "@/lib/i18n";
import { apiError, consoleContext, invalidField, invalidJson, json, noteOf, readObject, withConsole } from "@/server/console/api";
import { apiDecision, decide } from "@/server/console/decisions";

/**
 * PATCH /api/rops/moderation/{type}/{id} (9.2, FR-12.8): `{action, reason?,
 * note?}` with the rules of the moderation tab. `type` is need, contact,
 * readiness, report or declined; `action` approve (need, contact, report),
 * verify (readiness), reject (with `reason` from the fixed list: dane-osobowe,
 * obrazliwe, spam, poza-zakresem, inne) or review (declined). Answers
 * `{item, message}`; 409 when the entry no longer waits for a decision.
 */
export async function PATCH(request: Request, { params }: RouteContext<"/api/rops/moderation/[type]/[id]">) {
  return withConsole(request, async () => {
    const { type, id } = await params;
    const body = await readObject(request);
    if (!body) return invalidJson();
    const decision = apiDecision(type, body.action);
    if (!decision.ok) {
      return decision.error === "unknown_type"
        ? apiError(404, "unknown_type", t("api.rops.unknownType"))
        : apiError(422, "action_not_allowed", t("api.rops.actionNotAllowed"), { field: "action" });
    }
    if (body.reason !== undefined && body.reason !== null && typeof body.reason !== "string") return invalidField("reason");
    const note = noteOf(body.note);
    if (note === undefined) return invalidField("note");

    const result = await decide(
      { kind: decision.kind, id, approve: decision.approve, reason: typeof body.reason === "string" ? body.reason : null, note },
      consoleContext(),
    );
    if (!result.ok) {
      return result.error === "gone"
        ? apiError(409, "gone", result.message)
        : apiError(422, "reason_missing", result.message, { field: "reason" });
    }
    return json({ item: result.item, message: result.message });
  });
}
