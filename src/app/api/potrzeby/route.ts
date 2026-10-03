import type { Need } from "@/lib/contracts/records";
import { isRoleCode, targetGroupCodes } from "@/lib/labels";
import { getGmina } from "@/lib/mock/data";
import { getRoute } from "@/lib/server/routes";
import { CONSENT_VERSION, countEvent, newId, nowIso, store } from "@/lib/server/store";
import { EMAIL, invalid, optionalText, readJson, requiredText, stringList } from "@/lib/server/validate";

/** S9c: stores a need in the needs bank (8.5); publication waits for moderation. */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const problemText = requiredText(body.problem_text, 2000, 20);
  if (!problemText) return invalid("problem_text");
  const summary = optionalText(body.summary_pl, 300);
  if (summary === undefined) return invalid("summary_pl");
  const email = optionalText(body.email, 200);
  if (email === undefined || (email && !EMAIL.test(email))) return invalid("email");
  if (body.consent_store !== true) return invalid("consent_store");
  const routeId = typeof body.route_id === "string" && getRoute(body.route_id) ? body.route_id : null;

  const now = nowIso();
  const need: Need = {
    id: newId("nd"),
    created_at: now,
    route_id: routeId,
    problem_text: problemText,
    summary_pl: summary,
    place_terc: typeof body.place_terc === "string" && getGmina(body.place_terc) ? body.place_terc : null,
    role: isRoleCode(body.role) ? body.role : null,
    target_groups: stringList(body.target_groups, targetGroupCodes),
    domains: [],
    reporter: { name: null, organisation: null, email },
    consents: {
      store: true,
      publish_anonymised: body.consent_publish === true,
      contact: Boolean(email),
      text_version: CONSENT_VERSION,
      timestamp: now,
    },
    status: "nowa",
    moderation: { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null },
    cluster_id: null,
    nearest_matches: [],
    brief_id: null,
    note_pl: null,
    example: false,
  };
  store.needs.unshift(need);
  countEvent("need_saved");
  return Response.json({ id: need.id }, { status: 201 });
}
