import type { Evaluation } from "@/lib/contracts";
import { getGmina, getInnovation } from "@/lib/catalogue";
import { isExperience, isTesterRole } from "@/lib/labels";
import { getLlm } from "@/lib/llm";
import { clientAddress } from "@/server/rate-limit";
import { CONSENT_VERSION, countEvent, newId, nowIso } from "@/server/ephemeral";
import { EMAIL, invalid, optionalText, readJson } from "@/server/validate";
import { repository } from "@/server/db";
import { isRating } from "@/server/evaluations";
import { allowSubmission, honeypotFilled, limitKeys, limitReached, publicWritesClosed, screenedResponse, screenText } from "@/server/gate";

/**
 * POST /api/innovations/{id}/evaluations, module IV ("Tester innowacji"):
 * a rating, feedback, an improvement proposal and a sign-up for tests,
 * any of them and at least one, kept for 12 months. The texts go through
 * the gate (7.12) together, so personal data is removed before storage;
 * a name only for harm. A sign-up needs a name and an e-mail address,
 * because ROPS has to reach the tester.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/innovations/[id]/evaluations">) {
  const closed = publicWritesClosed();
  if (closed) return closed;
  const { id } = await params;
  const innovation = getInnovation(id);
  if (!innovation) return Response.json({ error: "not_found" }, { status: 404 });
  const body = await readJson(request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  // A bot filled the hidden field: answered like a success, nothing stored (FR-12.14).
  if (honeypotFilled(body)) return Response.json({ id: newId("oc"), redactions: 0 }, { status: 201 });

  const rating = body.rating === null || body.rating === undefined ? null : body.rating;
  if (rating !== null && !isRating(rating)) return invalid("rating");
  const experience = body.experience === null || body.experience === undefined || body.experience === "" ? null : body.experience;
  if (experience !== null && !isExperience(experience)) return invalid("experience");
  const feedback = optionalText(body.feedback, 1500);
  if (feedback === undefined) return invalid("feedback");
  const improvement = optionalText(body.improvement, 1500);
  if (improvement === undefined) return invalid("improvement");
  const signup = body.test_signup === true;
  if (signup && !isTesterRole(body.tester_role)) return invalid("tester_role");
  if (rating === null && !feedback && !improvement && !signup) return invalid("rating");

  const displayName = optionalText(body.display_name, 200);
  if (displayName === undefined || (signup && !displayName)) return invalid("display_name");
  const email = optionalText(body.email, 200);
  if (email === undefined || (email && !EMAIL.test(email)) || (signup && !email)) return invalid("email");
  if (body.consent_store !== true) return invalid("consent_store");

  // At most five evaluations of one innovation a day, per e-mail address and per client address (FR-12.14).
  const client = clientAddress(request.headers);
  const keys = limitKeys("evaluation", { email, client }).map((key) => `${key}:${innovation.id}`);
  if (!allowSubmission("evaluation", keys)) return limitReached();

  const placeTerc = signup && typeof body.place_terc === "string" && getGmina(body.place_terc) ? body.place_terc : null;
  let cleanFeedback = feedback;
  let cleanImprovement = improvement;
  let redactions = 0;
  if (feedback || improvement) {
    // Both texts are screened together, one per line, so they are redacted in one pass and split back.
    const parts = [feedback ?? "", improvement ?? ""].map((part) => part.replace(/\s*\n\s*/g, " "));
    const gate = await screenText(
      { text: parts.join("\n"), kind: "evaluation", placeName: getGmina(placeTerc)?.name ?? null, client },
      { llm: getLlm() },
    );
    if (gate.screening.outcome !== "need") return screenedResponse(gate.screening.outcome);
    const redacted = gate.redactedText.split("\n");
    if (redacted.length !== parts.length) return Response.json({ error: "screening_failed" }, { status: 500 });
    cleanFeedback = redacted[0].trim() || null;
    cleanImprovement = redacted[1].trim() || null;
    redactions = gate.redactionCount;
  }
  if (displayName) {
    const nameGate = await screenText({ text: displayName, kind: "readiness", placeName: null }, { llm: getLlm() });
    if (nameGate.screening.outcome !== "need") return screenedResponse(nameGate.screening.outcome);
  }

  const now = new Date();
  const retention = new Date(now);
  retention.setFullYear(retention.getFullYear() + 1);
  const evaluation: Evaluation = {
    id: newId("oc"),
    created_at: nowIso(),
    innovation_id: innovation.id,
    rating,
    experience,
    feedback: cleanFeedback,
    improvement: cleanImprovement,
    test_signup: signup && isTesterRole(body.tester_role) ? { as: body.tester_role, place_terc: placeTerc } : null,
    author: { display_name: displayName, email },
    consents: { store: true, contact: Boolean(email), text_version: CONSENT_VERSION, timestamp: nowIso() },
    moderation: { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null },
    forwarded_at: null,
    retention_until: retention.toISOString().slice(0, 10),
    note_pl: null,
  };
  await repository().addEvaluation(evaluation);
  await countEvent("evaluation_submitted");
  if (evaluation.test_signup) await countEvent(`test_signup:${evaluation.test_signup.as}`);
  return Response.json({ id: evaluation.id, redactions }, { status: 201 });
}
