import type { Thread } from "@/lib/contracts";
import { getGmina, getInnovation } from "@/lib/catalogue";
import { isSector, isTopic, targetGroupCodes } from "@/lib/labels";
import { clientAddress } from "@/server/rate-limit";
import { CONSENT_VERSION, countEvent, newId, nowIso } from "@/server/ephemeral";
import { EMAIL, invalid, optionalText, readJson, requiredText, stringList } from "@/server/validate";
import { repository } from "@/server/db";
import { allowSubmission, honeypotFilled, limitKeys, limitReached, publicWritesClosed, screenedResponse, screenText } from "@/server/gate";
import { getLlm } from "@/lib/llm";
import { hashKey, message, newKey, nextRetention, screenMessage, threadPath } from "@/server/threads";

/**
 * POST /api/threads, module V: starts a conversation with ROPS, about a
 * question, a mentor's support or a partnership, and answers with its
 * private link. The text goes through the gate (7.12); the name for harm
 * only. Nothing is sent: ROPS sees the conversation in its panel.
 */
export async function POST(request: Request) {
  const closed = publicWritesClosed();
  if (closed) return closed;
  const body = await readJson(request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  if (honeypotFilled(body)) return Response.json({ id: newId("rz"), path: "/rozmowy" }, { status: 201 });

  if (!isTopic(body.topic)) return invalid("topic");
  const subject = requiredText(body.subject, 150, 3);
  if (!subject) return invalid("subject");
  const text = requiredText(body.message, 3000, 10);
  if (!text) return invalid("message");
  const displayName = requiredText(body.display_name, 200);
  if (!displayName) return invalid("display_name");
  const organisation = optionalText(body.organisation, 200);
  if (organisation === undefined) return invalid("organisation");
  const email = optionalText(body.email, 200);
  if (email === undefined || (email && !EMAIL.test(email))) return invalid("email");
  if (body.consent_store !== true) return invalid("consent_store");

  const repo = repository();
  const refType = body.ref_type;
  const refId = typeof body.ref_id === "string" ? body.ref_id : "";
  let ref: Thread["ref"] = null;
  if (refType === "innovation" && getInnovation(refId)) ref = { type: "innovation", id: refId };
  if (refType === "idea" && (await repo.getIdea(refId))) ref = { type: "idea", id: refId };
  if (refType === "partnership" && (await repo.getPost(refId))?.moderation.status === "zatwierdzone") ref = { type: "partnership", id: refId };

  const client = clientAddress(request.headers);
  if (!allowSubmission("thread", limitKeys("thread", { email, client }))) return limitReached();
  const placeTerc = typeof body.place_terc === "string" && getGmina(body.place_terc) ? body.place_terc : null;

  const screened = await screenMessage(`${subject}\n${text}`, placeTerc, client, body.topic === "partnerstwo" ? "partnership" : "contact");
  if (!screened.ok) return screenedResponse(screened.outcome);
  const [cleanSubject, ...rest] = screened.text.split("\n");
  const nameGate = await screenText({ text: displayName, kind: "readiness", placeName: null }, { llm: getLlm() });
  if (nameGate.screening.outcome !== "need") return screenedResponse(nameGate.screening.outcome);

  const key = newKey();
  const now = nowIso();
  const thread: Thread = {
    id: newId("rz"),
    created_at: now,
    updated_at: now,
    topic: body.topic,
    subject: cleanSubject.trim() || subject,
    author: { display_name: displayName, organisation, email, sector: isSector(body.sector) ? body.sector : null },
    place_terc: placeTerc,
    target_groups: stringList(body.target_groups, targetGroupCodes),
    ref,
    access_hash: hashKey(key),
    mentor: null,
    messages: [message("uzytkownik", null, rest.join("\n").trim())],
    status: "nowa",
    consent: { text_version: CONSENT_VERSION, timestamp: now },
    retention_until: nextRetention(),
    note_pl: null,
  };
  await repo.addThread(thread);
  await countEvent(`thread_started:${thread.topic}`);
  return Response.json({ id: thread.id, key, path: threadPath(thread.id, key), redactions: screened.redactions }, { status: 201 });
}
