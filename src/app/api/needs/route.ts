import type { Need } from "@/lib/contracts/records";
import { isRoleCode, targetGroupCodes } from "@/lib/labels";
import { getGmina } from "@/lib/catalogue";
import { getLlm } from "@/lib/llm";
import { clientAddress } from "@/lib/server/rate-limit";
import { getRoute } from "@/lib/server/routes";
import { CONSENT_VERSION, countEvent, newId, nowIso } from "@/lib/server/store";
import { EMAIL, invalid, optionalText, readJson, requiredText, stringList } from "@/lib/server/validate";
import { repository } from "@/server/db";
import { honeypotFilled, publicWritesClosed, screenedResponse, screenText } from "@/server/gate";
import { nearestForNewNeed, savedNeedSummary } from "@/server/needs";

/**
 * S9c: stores a need in the needs bank (8.5); publication waits for
 * moderation. The summary is the gate's, never the body's; a need saved
 * from a route keeps that route's nearest matches (FR-5.3), and a need
 * typed straight into the bank gets them with its first brief.
 */
export async function POST(request: Request) {
  const closed = publicWritesClosed();
  if (closed) return closed;
  const body = await readJson(request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  // A bot filled the hidden field: answered like a success, nothing stored (FR-12.14).
  if (honeypotFilled(body)) return Response.json({ id: newId("nd"), redactions: 0 }, { status: 201 });

  const text = requiredText(body.problem_text, 2000, 20);
  if (!text) return invalid("problem_text");
  const email = optionalText(body.email, 200);
  if (email === undefined || (email && !EMAIL.test(email))) return invalid("email");
  if (body.consent_store !== true) return invalid("consent_store");
  const route = typeof body.route_id === "string" ? ((await getRoute(body.route_id)) ?? null) : null;

  // The gate (7.12): personal data never reaches storage (FR-12.4); the reader is told how much was removed.
  const placeName = typeof body.place_terc === "string" ? (getGmina(body.place_terc)?.name ?? null) : null;
  const gate = await screenText(
    { text, kind: "saved_need", placeName, client: clientAddress(request.headers) },
    { llm: getLlm() },
  );
  if (gate.screening.outcome !== "need") return screenedResponse(gate.screening.outcome);
  const problemText = gate.redactedText;
  const redactions = gate.redactionCount;

  const now = nowIso();
  const need: Need = {
    id: newId("nd"),
    created_at: now,
    route_id: route?.id ?? null,
    problem_text: problemText,
    summary_pl: savedNeedSummary(gate.screening.need_summary_pl, route, problemText),
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
    nearest_matches: nearestForNewNeed(route),
    brief_id: null,
    note_pl: null,
    example: false,
  };
  await repository().addNeed(need);
  await countEvent("need_saved");
  return Response.json({ id: need.id, redactions }, { status: 201 });
}
