import type { Idea } from "@/lib/contracts";
import { getGmina } from "@/lib/catalogue";
import { isIdeaKind, isIdeaStage, targetGroupCodes } from "@/lib/labels";
import { getLlm } from "@/lib/llm";
import { clientAddress } from "@/server/rate-limit";
import { CONSENT_VERSION, countEvent, newId, nowIso } from "@/server/ephemeral";
import { EMAIL, invalid, readJson, requiredText, stringList } from "@/server/validate";
import { repository } from "@/server/db";
import { allowSubmission, honeypotFilled, limitKeys, limitReached, publicWritesClosed, screenedResponse, screenText } from "@/server/gate";
import { traced } from "@/lib/telemetry";

/**
 * Module III ("Kreator pomysłów"): stores an idea card, kept for 12 months;
 * showing it to others waits for ROPS. The card's texts go through the gate
 * (7.12) as one text, so personal data is removed before storage and a
 * crisis or a harmful text is answered like a need; the author's name only
 * for harm, like a readiness registration.
 */
async function post(request: Request) {
  const closed = publicWritesClosed();
  if (closed) return closed;
  const body = await readJson(request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  // A bot filled the hidden field: answered like a success, nothing stored (FR-12.14).
  if (honeypotFilled(body)) return Response.json({ id: newId("pm"), redactions: 0 }, { status: 201 });

  if (!isIdeaKind(body.kind)) return invalid("kind");
  const title = requiredText(body.title, 120, 3);
  if (!title) return invalid("title");
  const description = requiredText(body.description, 1500, 20);
  if (!description) return invalid("description");
  const essence = requiredText(body.essence, 1000, 10);
  if (!essence) return invalid("essence");
  const forWhom = requiredText(body.for_whom, 500, 3);
  if (!forWhom) return invalid("for_whom");
  if (!isIdeaStage(body.stage)) return invalid("stage");
  const displayName = requiredText(body.display_name, 200);
  if (!displayName) return invalid("display_name");
  const email = requiredText(body.email, 200);
  if (!email || !EMAIL.test(email)) return invalid("email");
  if (body.consent_store !== true) return invalid("consent_store");

  // At most three cards per e-mail address a day (FR-12.14).
  if (!allowSubmission("idea", limitKeys("idea", { email }))) return limitReached();

  const placeTerc = typeof body.place_terc === "string" && getGmina(body.place_terc) ? body.place_terc : null;
  const placeName = getGmina(placeTerc)?.name ?? null;
  // The four texts are screened together, one per line, so they are redacted in one pass and split back.
  const parts = [title, description, essence, forWhom].map((part) => part.replace(/\s*\n\s*/g, " "));
  const gate = await screenText(
    { text: parts.join("\n"), kind: "idea", placeName, client: clientAddress(request.headers) },
    { llm: getLlm() },
  );
  if (gate.screening.outcome !== "need") return screenedResponse(gate.screening.outcome);
  const redacted = gate.redactedText.split("\n");
  const [cleanTitle, cleanDescription, cleanEssence, cleanForWhom] = redacted.length === parts.length ? redacted : parts.map(() => null);
  if (!cleanTitle || !cleanDescription || !cleanEssence || !cleanForWhom) return Response.json({ error: "screening_failed" }, { status: 500 });

  const nameGate = await screenText({ text: displayName, kind: "readiness", placeName: null }, { llm: getLlm() });
  if (nameGate.screening.outcome !== "need") return screenedResponse(nameGate.screening.outcome);

  const now = new Date();
  const retention = new Date(now);
  retention.setFullYear(retention.getFullYear() + 1);
  const idea: Idea = {
    id: newId("pm"),
    created_at: nowIso(),
    kind: body.kind,
    title: cleanTitle,
    description: cleanDescription,
    essence: cleanEssence,
    for_whom: cleanForWhom,
    target_groups: stringList(body.target_groups, targetGroupCodes),
    stage: body.stage,
    place_terc: placeTerc,
    author: { display_name: displayName, is_organisation: body.is_organisation === true, email },
    consents: { store: true, publish: body.consent_publish === true, text_version: CONSENT_VERSION, timestamp: nowIso() },
    moderation: { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null },
    similar: null,
    status: "nowy",
    reply: null,
    retention_until: retention.toISOString().slice(0, 10),
    note_pl: null,
  };
  await repository().addIdea(idea);
  await countEvent(`idea_submitted:${idea.kind}`);
  return Response.json({ id: idea.id, redactions: gate.redactionCount }, { status: 201 });
}

export const POST = traced("POST /api/ideas", post);
