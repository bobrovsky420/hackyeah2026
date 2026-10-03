import type { ContactRequest } from "@/lib/contracts/records";
import { getRoute } from "@/lib/server/routes";
import { CONSENT_VERSION, countEvent, newId, nowIso, store } from "@/lib/server/store";
import { EMAIL, invalid, optionalText, readJson, requiredText } from "@/lib/server/validate";

const targetTypes = ["innovation", "organisation", "advisor", "gmina"] as const;

/** S9a: stores a contact request for the ROPS console (8.6), to be relayed after moderation. */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

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
  const routeId = typeof body.route_id === "string" && getRoute(body.route_id) ? body.route_id : null;

  const now = nowIso();
  const contact: ContactRequest = {
    id: newId("kt"),
    created_at: now,
    route_id: routeId,
    need_id: null,
    target: { type: targetType, id: targetId },
    requester: { name, organisation, email },
    message,
    screening: { outcome: "need" },
    consent: { text_version: CONSENT_VERSION, timestamp: now },
    moderation: { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null },
    status: "nowe",
    note_pl: null,
  };
  store.contacts.unshift(contact);
  countEvent("contact_requested");
  return Response.json({ id: contact.id }, { status: 201 });
}
