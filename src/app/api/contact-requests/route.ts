import type { ContactRequest } from "@/lib/contracts";
import { getLlm } from "@/lib/llm";
import { clientAddress } from "@/server/rate-limit";
import { getRoute } from "@/server/route-service";
import { CONSENT_VERSION, countEvent, newId, nowIso } from "@/server/ephemeral";
import { EMAIL, invalid, optionalText, readJson, requiredText } from "@/server/validate";
import { repository } from "@/server/db";
import { allowSubmission, honeypotFilled, limitKeys, limitReached, publicWritesClosed, screenedResponse, screenText } from "@/server/gate";

const targetTypes = ["innovation", "organisation", "advisor", "gmina"] as const;

/** S9a: stores a contact request (8.6) for ROPS to relay; nothing is sent by the tool. */
export async function POST(request: Request) {
  const closed = publicWritesClosed();
  if (closed) return closed;
  const body = await readJson(request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  // A bot filled the hidden field: answered like a success, nothing stored (FR-12.14).
  if (honeypotFilled(body)) return Response.json({ id: newId("kt") }, { status: 201 });

  const name = requiredText(body.name, 200);
  if (!name) return invalid("name");
  const organisation = optionalText(body.organisation, 200);
  if (organisation === undefined) return invalid("organisation");
  const email = requiredText(body.email, 200);
  if (!email || !EMAIL.test(email)) return invalid("email");
  const message = requiredText(body.message, 2000);
  if (!message) return invalid("message");
  if (body.consent !== true) return invalid("consent");
  const target = body.target as { type?: unknown; id?: unknown } | undefined;
  const targetType = targetTypes.find((type) => type === target?.type);
  const targetId = requiredText(target?.id, 200);
  if (!targetType || !targetId) return invalid("target");
  const routeId = typeof body.route_id === "string" && (await getRoute(body.route_id)) ? body.route_id : null;

  // At most five requests per e-mail address and per client address a day (FR-6.4, FR-12.14).
  const client = clientAddress(request.headers);
  if (!allowSubmission("contact", limitKeys("contact", { email, client }))) return limitReached();
  // The gate (7.12) screens the message for abuse and solicitation and removes personal data (FR-12.4).
  const gate = await screenText({ text: message, kind: "contact", placeName: null, client }, { llm: getLlm() });
  if (gate.screening.outcome !== "need") return screenedResponse(gate.screening.outcome);

  const now = nowIso();
  const contact: ContactRequest = {
    id: newId("kt"),
    created_at: now,
    route_id: routeId,
    need_id: null,
    target: { type: targetType, id: targetId },
    requester: { name, organisation, email },
    message: gate.redactedText,
    screening: { outcome: "need" },
    consent: { text_version: CONSENT_VERSION, timestamp: now },
    moderation: { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null },
    status: "nowe",
    note_pl: null,
  };
  await repository().addContact(contact);
  await countEvent("contact_requested");
  return Response.json({ id: contact.id }, { status: 201 });
}
