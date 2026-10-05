import { canvasTexts, parseCanvas, stageFromReadiness, targetGroupsFromUsers, withCanvasTexts, type IdeaCanvas } from "@/lib/canvas";
import type { Idea, IdeaKind, IdeaStage } from "@/lib/contracts";
import { getGmina } from "@/lib/catalogue";
import { isIdeaKind, isIdeaStage, targetGroupCodes } from "@/lib/labels";
import { getLlm } from "@/lib/llm";
import { clientAddress } from "@/server/rate-limit";
import { CONSENT_VERSION, countEvent, newId, nowIso } from "@/server/ephemeral";
import { EMAIL, invalid, readJson, requiredText, stringList, type Body } from "@/server/validate";
import { repository } from "@/server/db";
import { allowSubmission, honeypotFilled, limitKeys, limitReached, publicWritesClosed, screenedResponse, screenText } from "@/server/gate";

/**
 * Module III ("Kreator pomysłów"): stores an idea card, kept for 12 months;
 * showing it to others waits for ROPS. The card's texts go through the gate
 * (7.12) as one text, so personal data is removed before storage and a
 * crisis or a harmful text is answered like a need; the author's name only
 * for harm, like a readiness registration. A CANVAS application (`canvas`
 * and `partners` instead of the card's fields) is checked against the steps
 * of src/lib/canvas.ts and stored as a card with its canvas.
 */
export async function POST(request: Request) {
  const closed = publicWritesClosed();
  if (closed) return closed;
  const body = await readJson(request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  // A bot filled the hidden field: answered like a success, nothing stored (FR-12.14).
  if (honeypotFilled(body)) return Response.json({ id: newId("pm"), redactions: 0 }, { status: 201 });

  const fields = cardFields(body);
  if ("invalid" in fields) return invalid(fields.invalid);
  const { title, description, essence, forWhom, stage, targetGroups, canvas } = fields;
  // A CANVAS application may grow from a short-form card; an unknown or demonstration card is ignored.
  const base = canvas && typeof body.extends === "string" ? await repository().getIdea(body.extends) : undefined;
  const extendsId = base && !base.demo && !base.canvas ? base.id : undefined;
  const displayName = requiredText(body.display_name, 200);
  if (!displayName) return invalid("display_name");
  const email = requiredText(body.email, 200);
  if (!email || !EMAIL.test(email)) return invalid("email");
  if (body.consent_store !== true) return invalid("consent_store");

  // At most three cards per e-mail address a day (FR-12.14).
  if (!allowSubmission("idea", limitKeys("idea", { email }))) return limitReached();

  const placeTerc = typeof body.place_terc === "string" && getGmina(body.place_terc) ? body.place_terc : null;
  const placeName = getGmina(placeTerc)?.name ?? null;
  // The texts are screened together, one per line, so they are redacted in one pass and split back;
  // the four card texts come first, then the canvas's non-empty texts.
  const canvasParts = canvas ? canvasTexts(canvas) : [];
  const parts = [title, description, essence, forWhom, ...canvasParts.filter(Boolean)].map((part) => part.replace(/\s*\n\s*/g, " "));
  const gate = await screenText(
    { text: parts.join("\n"), kind: "idea", placeName, client: clientAddress(request.headers) },
    { llm: getLlm() },
  );
  if (gate.screening.outcome !== "need") return screenedResponse(gate.screening.outcome);
  const redacted = gate.redactedText.split("\n");
  if (redacted.length !== parts.length) return Response.json({ error: "screening_failed" }, { status: 500 });
  const [cleanTitle, cleanDescription, cleanEssence, cleanForWhom, ...cleanCanvas] = redacted;
  if (!cleanTitle || !cleanDescription || !cleanEssence || !cleanForWhom) return Response.json({ error: "screening_failed" }, { status: 500 });
  const cleanCanvasTexts = canvasParts.map((part) => (part ? (cleanCanvas.shift() ?? "") : ""));

  const nameGate = await screenText({ text: displayName, kind: "readiness", placeName: null }, { llm: getLlm() });
  if (nameGate.screening.outcome !== "need") return screenedResponse(nameGate.screening.outcome);

  const now = new Date();
  const retention = new Date(now);
  retention.setFullYear(retention.getFullYear() + 1);
  const idea: Idea = {
    id: newId("pm"),
    created_at: nowIso(),
    kind: fields.kind,
    title: cleanTitle,
    description: cleanDescription,
    essence: cleanEssence,
    for_whom: cleanForWhom,
    target_groups: targetGroups,
    stage,
    place_terc: placeTerc,
    author: { display_name: displayName, is_organisation: body.is_organisation === true, email },
    consents: { store: true, publish: body.consent_publish === true, text_version: CONSENT_VERSION, timestamp: nowIso() },
    moderation: { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null },
    similar: null,
    status: "nowy",
    reply: null,
    retention_until: retention.toISOString().slice(0, 10),
    note_pl: null,
    ...(canvas && { canvas: withCanvasTexts(canvas, cleanCanvasTexts) }),
    ...(extendsId && { extends: extendsId }),
  };
  await repository().addIdea(idea);
  await countEvent(`idea_submitted:${idea.kind}`);
  if (canvas) await countEvent("idea_submitted:canvas");
  return Response.json({ id: idea.id, redactions: gate.redactionCount }, { status: 201 });
}

interface CardFields {
  kind: IdeaKind;
  title: string;
  description: string;
  essence: string;
  forWhom: string;
  stage: IdeaStage;
  targetGroups: string[];
  canvas: IdeaCanvas | null;
}

/** The card's fields of the short form, or of a CANVAS application with its stage and groups read from the canvas. */
function cardFields(body: Body): CardFields | { invalid: string } {
  if (body.canvas !== undefined) {
    const parsed = parseCanvas(body.canvas, body.partners);
    if (!parsed.ok) return { invalid: parsed.field };
    const { core, canvas } = parsed;
    const users = canvas.answers.users;
    return {
      kind: core.kind,
      title: core.title,
      description: core.description,
      essence: core.essence,
      forWhom: core.for_whom,
      stage: stageFromReadiness(String(canvas.answers.readiness)),
      targetGroups: targetGroupsFromUsers(Array.isArray(users) ? users : []),
      canvas,
    };
  }
  if (!isIdeaKind(body.kind)) return { invalid: "kind" };
  const title = requiredText(body.title, 120, 3);
  if (!title) return { invalid: "title" };
  const description = requiredText(body.description, 1500, 20);
  if (!description) return { invalid: "description" };
  const essence = requiredText(body.essence, 1000, 10);
  if (!essence) return { invalid: "essence" };
  const forWhom = requiredText(body.for_whom, 500, 3);
  if (!forWhom) return { invalid: "for_whom" };
  if (!isIdeaStage(body.stage)) return { invalid: "stage" };
  return {
    kind: body.kind,
    title,
    description,
    essence,
    forWhom,
    stage: body.stage,
    targetGroups: stringList(body.target_groups, targetGroupCodes),
    canvas: null,
  };
}
