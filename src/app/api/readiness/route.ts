import type { Readiness } from "@/lib/contracts/records";
import { targetGroupCodes } from "@/lib/labels";
import { getGmina } from "@/lib/mock/data";
import { CONSENT_VERSION, countEvent, newId, nowIso, store } from "@/lib/server/store";
import { invalid, readJson, requiredText, stringList } from "@/lib/server/validate";

/** S9b: stores a readiness registration (8.6), kept for 12 months and verified by ROPS. */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const displayName = requiredText(body.display_name, 200);
  if (!displayName) return invalid("display_name");
  const contact = requiredText(body.contact, 200);
  if (!contact) return invalid("contact");
  if (body.consent_store !== true) return invalid("consent_store");

  const now = new Date();
  const retention = new Date(now);
  retention.setFullYear(retention.getFullYear() + 1);
  const entry: Readiness = {
    id: newId("gt"),
    created_at: nowIso(),
    display_name: displayName,
    is_organisation: body.is_organisation === true,
    place_terc: typeof body.place_terc === "string" && getGmina(body.place_terc) ? body.place_terc : null,
    topics: stringList(body.topics, targetGroupCodes),
    channel: { type: contact.includes("@") ? "email" : "phone", value: contact },
    consent_display_name: body.consent_display_name === true,
    consent: { text_version: CONSENT_VERSION, timestamp: nowIso() },
    verification: { status: "niezweryfikowane", reviewer: null, decided_at: null },
    retention_until: retention.toISOString().slice(0, 10),
    note_pl: null,
  };
  store.readiness.unshift(entry);
  countEvent("readiness_registered");
  return Response.json({ id: entry.id }, { status: 201 });
}
