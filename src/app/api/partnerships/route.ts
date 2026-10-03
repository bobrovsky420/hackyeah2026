import type { PartnershipPost, Thread } from "@/lib/contracts";
import { getGmina } from "@/lib/catalogue";
import { getLlm } from "@/lib/llm";
import { isSector, sectorCodes, targetGroupCodes } from "@/lib/labels";
import { clientAddress } from "@/server/rate-limit";
import { CONSENT_VERSION, countEvent, newId, nowIso } from "@/server/ephemeral";
import { EMAIL, invalid, optionalText, readJson, requiredText, stringList } from "@/server/validate";
import { repository } from "@/server/db";
import { allowSubmission, honeypotFilled, limitKeys, limitReached, publicWritesClosed, screenedResponse, screenText } from "@/server/gate";
import { hashKey, message, newKey, nextRetention, screenMessage, threadPath } from "@/server/threads";
import { traced } from "@/lib/telemetry";

/**
 * POST /api/partnerships, module V: a post for the partnership board, shown
 * after ROPS approves it, with the author's private conversation with ROPS
 * where the answers to the post are relayed. No contact is ever public.
 */
async function post(request: Request) {
  const closed = publicWritesClosed();
  if (closed) return closed;
  const body = await readJson(request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  if (honeypotFilled(body)) return Response.json({ id: newId("pp"), path: "/partnerstwa" }, { status: 201 });

  const kind = body.kind === "oferuje" ? "oferuje" : body.kind === "szukam" ? "szukam" : null;
  if (!kind) return invalid("kind");
  const title = requiredText(body.title, 150, 5);
  if (!title) return invalid("title");
  const description = requiredText(body.description, 2000, 20);
  if (!description) return invalid("description");
  if (!isSector(body.sector)) return invalid("sector");
  const displayName = requiredText(body.display_name, 200);
  if (!displayName) return invalid("display_name");
  const organisation = optionalText(body.organisation, 200);
  if (organisation === undefined) return invalid("organisation");
  const email = optionalText(body.email, 200);
  if (email === undefined || (email && !EMAIL.test(email))) return invalid("email");
  if (body.consent_store !== true) return invalid("consent_store");

  const client = clientAddress(request.headers);
  if (!allowSubmission("post", limitKeys("post", { email, client }))) return limitReached();
  const placeTerc = typeof body.place_terc === "string" && getGmina(body.place_terc) ? body.place_terc : null;
  const screened = await screenMessage(`${title}\n${description.replace(/\s*\n\s*/g, " ")}`, placeTerc, client, "partnership");
  if (!screened.ok) return screenedResponse(screened.outcome);
  const [cleanTitle, cleanDescription] = screened.text.split("\n");
  const nameGate = await screenText({ text: displayName, kind: "readiness", placeName: null }, { llm: getLlm() });
  if (nameGate.screening.outcome !== "need") return screenedResponse(nameGate.screening.outcome);

  const repo = repository();
  const key = newKey();
  const now = nowIso();
  const retention = nextRetention();
  const groups = stringList(body.target_groups, targetGroupCodes);
  const postId = newId("pp");
  const thread: Thread = {
    id: newId("rz"),
    created_at: now,
    updated_at: now,
    topic: "partnerstwo",
    subject: cleanTitle,
    author: { display_name: displayName, organisation, email, sector: body.sector },
    place_terc: placeTerc,
    target_groups: groups,
    ref: { type: "partnership", id: postId },
    access_hash: hashKey(key),
    mentor: null,
    messages: [message("uzytkownik", null, cleanDescription ?? "")],
    status: "nowa",
    consent: { text_version: CONSENT_VERSION, timestamp: now },
    retention_until: retention,
    note_pl: null,
  };
  const post: PartnershipPost = {
    id: postId,
    created_at: now,
    kind,
    title: cleanTitle,
    description: cleanDescription ?? "",
    sector: body.sector,
    seeking: stringList(body.seeking, sectorCodes).filter(isSector),
    place_terc: placeTerc,
    target_groups: groups,
    author: { display_name: displayName, organisation, email },
    thread_id: thread.id,
    moderation: { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null },
    retention_until: retention,
  };
  await repo.addThread(thread);
  await repo.addPost(post);
  await countEvent("partnership_posted");
  return Response.json({ id: post.id, path: threadPath(thread.id, key), redactions: screened.redactions }, { status: 201 });
}

export const POST = traced("POST /api/partnerships", post);
