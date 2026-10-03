import type { Llm } from "@/lib/llm/types";
import { emit } from "@/lib/telemetry";
import type { GateInput, GateOutput, RedactionType, ScreenText, ScreeningResult, StageLog } from "@/lib/contracts";
import { decide, decidesWithoutModel } from "./decide";
import { matchLexicon } from "./lexicon";
import { isRepeat, rememberText, repeatKey, seenBefore, writeScreeningLog } from "./log";
import { screenWithModel, type ModelScreen } from "./model";
import { findPatternSpans, mergeSpans, mostlyLinks } from "./patterns";
import { applySpans, locateNames } from "./redaction";

/*
 * The screening gate of 7.12: deterministic checks first (patterns, the
 * crisis lexicon, repeats and links), then one fast model call unless those
 * already decided, then the decision rules of decide.ts, the redaction and
 * one screening-log entry. The original text is not kept anywhere by the
 * gate; callers store `redactedText` and only when the outcome is `need`.
 */

export { REDACTED, redact } from "./redaction";
export { HONEYPOT_FIELD } from "./honeypot-field";
export { allowSubmission, honeypotFilled, limitKeys, limitReached, publicWritesClosed, screenedResponse } from "./public-writes";
export type { ScreeningLogEntry } from "./log";

/** Personal data that makes a quoted name worth removing (FR-12.4). */
const COMBINING: readonly RedactionType[] = ["pesel", "phone", "address"];

export interface GateRequest extends GateInput {
  /**
   * The client address, for the repeat check of FR-12.14 ("identical texts
   * from one IP within an hour"); hashed with the text in memory, never
   * logged. Without it, repeats are counted across all clients.
   */
  client?: string | null;
  /**
   * The stored record the text belongs to, when the caller already knows it
   * (the route id of the pipeline): the screening log keeps it, so the
   * declined-texts review shows a kept text next to its route (FR-12.8).
   */
  ref?: string | null;
  /**
   * The rest of the request a repeat must share with the text (the route's
   * place, role and target groups), so a changed place is not a repeat.
   */
  repeatScope?: string;
  /** False for "Policz ponownie" (FR-3.5), which sends the same text again on purpose. */
  countRepeats?: boolean;
}

async function screen(input: GateRequest, deps: { llm: Llm }): Promise<GateOutput> {
  const { text, kind, placeName } = input;
  // A display name is screened for harm only: no patterns, no lexicon, no repeats (7.12).
  const nameOnly = kind === "readiness";
  // A contact message is often the form's prefilled text; its daily limit covers repeats (FR-6.4).
  // A message in a conversation may repeat ("Dziękuję") and may be links a mentor shares (module V).
  const inConversation = kind === "message" || kind === "partnership";
  const repeatsCount = !nameOnly && !inConversation && kind !== "contact" && input.countRepeats !== false;

  const patternSpans = nameOnly ? [] : findPatternSpans(text);
  const lexicon = nameOnly ? { crisis: [], community: [] } : matchLexicon(text);
  const key = repeatKey(kind, input.client, input.repeatScope ? `${text}
${input.repeatScope}` : text);
  const seen = repeatsCount ? seenBefore(key) : { count: 0, redirected: false };
  const spam = { repeat: isRepeat(seen.count), repeatOfRedirected: seen.redirected, links: !nameOnly && !inConversation && mostlyLinks(text) };

  let model: ModelScreen | null = null;
  let stage: StageLog | null = null;
  if (!decidesWithoutModel({ kind, lexicon, spam })) {
    // The model never sees the pattern spans (FR-6.6); it quotes the names itself.
    const answer = await screenWithModel(deps.llm, applySpans(text, patternSpans), kind, placeName);
    stage = answer.stage;
    if (answer.ok) model = answer.screen;
  }
  const decision = decide({ kind, lexicon, spam, model });

  // Names only together with other personal data or an individual situation (FR-12.4).
  const combined =
    patternSpans.some((span) => COMBINING.includes(span.type)) ||
    decision.individual_case ||
    decision.outcome === "redirected" ||
    model?.category === "individual_case" ||
    model?.category === "crisis";
  const nameSpans = model && combined && !nameOnly ? locateNames(text, model.personNames) : [];
  const spans = mergeSpans([...patternSpans, ...nameSpans]);
  const redactedText = applySpans(text, spans);

  const patternRules = [...new Set(spans.map((span) => (span.type === "person_name" ? "model:person_name" : `pattern:${span.type}`)))];
  const screening: ScreeningResult = {
    category: decision.category,
    confidence: decision.confidence,
    individual_case: decision.individual_case,
    sensitive_topics: decision.sensitive_topics,
    redactions: spans.map(({ type, start, end }) => ({ type, start, end })),
    need_summary_pl: decision.outcome === "need" ? (model?.summary ?? null) : null,
    outcome: decision.outcome,
    crisis_banner: decision.crisis_banner,
    rules_fired: [...patternRules, ...decision.rules_fired],
    prompt_version: model?.promptVersion ?? null,
  };

  if (repeatsCount) rememberText(key, decision.outcome === "redirected");
  await writeScreeningLog(
    {
      kind,
      category: screening.category,
      confidence: screening.confidence,
      outcome: screening.outcome,
      sensitive_topics: screening.sensitive_topics,
      redaction_count: spans.length,
      rules_fired: screening.rules_fired,
      prompt_version: screening.prompt_version,
      ref: input.ref ?? null,
    },
    text,
    redactedText,
  );

  emit("gate_screened", {
    kind,
    category: screening.category,
    confidence: screening.confidence,
    outcome: screening.outcome,
    individual_case: screening.individual_case,
    sensitive_topics: screening.sensitive_topics,
    crisis_banner: screening.crisis_banner,
    redaction_count: spans.length,
    rules_fired: screening.rules_fired,
    repeats_seen: seen.count,
    model_ms: stage?.latencyMs ?? null,
  });

  return { screening, redactedText, redactionCount: spans.length, stage };
}

/** ScreenText of src/lib/contracts.ts, with the optional client address of GateRequest. */
export const screenText = screen satisfies ScreenText;
