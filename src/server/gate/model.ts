import { z } from "zod";
import type { SensitiveTopic, GateTextKind, ScreeningCategory, StageLog } from "@/lib/contracts";
import { toStageLog } from "@/lib/llm/observability";
import { loadPrompt } from "@/lib/llm/prompts";
import { LlmError, type Llm } from "@/lib/llm/types";
import { findBanned } from "@/server/route/safety";
import { TOPICS } from "./lexicon";
import { SCREEN_MAX_TOKENS } from "./thresholds";

/*
 * The model part of the gate (FR-12.2): one call of the task `screen` with
 * prompts/screen.md. The model sees the text with the pattern spans already
 * removed, the kind of text and the place name, never an identity. The
 * schema is loose on purpose (an unknown topic is dropped here, not a
 * reason to reject the answer); person names come back as quoted strings,
 * which the gate locates in the text itself, because models count offsets
 * badly. Any failure means the model part is unavailable.
 */

export const screenSchema = z.object({
  category: z.enum(["need", "crisis", "individual_case", "harm", "off_topic", "spam"]),
  confidence: z.number(),
  individual_case: z.boolean(),
  sensitive_topics: z.array(z.string()),
  person_names: z.array(z.string()),
  need_summary_pl: z.string().nullable(),
});

export type ScreenOutput = z.infer<typeof screenSchema>;

/** The model's answer after the checks below. */
export interface ModelScreen {
  category: ScreeningCategory;
  confidence: number;
  individualCase: boolean;
  topics: SensitiveTopic[];
  personNames: string[];
  summary: string | null;
  promptVersion: string;
}

const KIND_LABELS: Record<GateTextKind, string> = {
  need: "opis potrzeby",
  saved_need: "opis potrzeby",
  contact: "wiadomość do organizacji",
  readiness: "nazwa zgłaszającego",
  offer: 'odpowiedź "Chcemy pomóc"',
  idea: "opis pomysłu na innowację społeczną",
  evaluation: "opinia o rozwiązaniu dla jego autorów",
  message: "wiadomość w trwającej rozmowie z ROPS",
  partnership: "ogłoszenie o partnerstwie lub odpowiedź na nie, do sprawdzenia przez ROPS",
};

const MAX_NAMES = 20;
const MAX_SUMMARY_CHARS = 400;

/** The user part: the kind, the place and the text as data in <potrzeba> tags (9.3). */
export function screenUserMessage(text: string, kind: GateTextKind, placeName: string | null): string {
  // A text cannot close the tags it is wrapped in.
  const safe = text.replace(/<\/?\s*potrzeba\s*>/gi, " ");
  return [`Rodzaj tekstu: ${KIND_LABELS[kind]}`, `Miejsce: ${placeName?.trim() || "nie podano"}`, "<potrzeba>", safe, "</potrzeba>"].join("\n");
}

/** Clamps and filters the parsed answer; a summary is kept only for `need`. */
export function normaliseScreen(output: ScreenOutput, promptVersion: string): ModelScreen {
  const confidence = Number.isFinite(output.confidence) ? Math.max(0, Math.min(1, output.confidence)) : 0;
  const topics = [...new Set(output.sensitive_topics.filter((topic): topic is SensitiveTopic => TOPICS.includes(topic as SensitiveTopic)))];
  const personNames = [...new Set(output.person_names.map((name) => name.trim()).filter((name) => name.length >= 3))].slice(0, MAX_NAMES);
  const text = output.category === "need" && output.need_summary_pl?.trim() ? output.need_summary_pl.trim().slice(0, MAX_SUMMARY_CHARS) : null;
  // The user's own words never decide the outcome; a label echoed into our summary only costs the summary (E1).
  const summary = text && !findBanned(text) ? text : null;
  return { category: output.category, confidence, individualCase: output.individual_case, topics, personNames, summary, promptVersion };
}

export type ModelAnswer = { ok: true; screen: ModelScreen; stage: StageLog } | { ok: false; reason: string; stage: StageLog };

/** Calls the model; never throws for a model failure, returns why it was unavailable. */
export async function screenWithModel(llm: Llm, text: string, kind: GateTextKind, placeName: string | null): Promise<ModelAnswer> {
  const started = Date.now();
  let promptVersion: string | null = null;
  try {
    const prompt = loadPrompt("screen");
    promptVersion = prompt.version;
    const result = await llm({
      task: "screen",
      system: prompt.body,
      promptVersion: prompt.version,
      user: screenUserMessage(text, kind, placeName),
      schema: screenSchema,
      effort: "low",
      maxTokens: SCREEN_MAX_TOKENS,
    });
    // The adapter validates too; a fake or a replayed answer is checked here again.
    const parsed = screenSchema.safeParse(result.parsed);
    if (!parsed.success) throw new LlmError("invalid_output", "screen", "the screening answer does not match the schema", result.provider);
    const screen = normaliseScreen(parsed.data, result.promptVersion);
    return { ok: true, screen, stage: toStageLog("screen", result) };
  } catch (error) {
    // LlmError of any kind, a missing prompt, or no provider at all: the gate goes on without the model.
    const reason = error instanceof LlmError ? `model unavailable: ${error.kind}` : "model unavailable: error";
    const stage: StageLog = {
      stage: "screen",
      provider: error instanceof LlmError && error.provider ? error.provider : "none",
      model: "",
      promptVersion,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      latencyMs: Date.now() - started,
      cached: false,
      droppedIds: [],
      droppedReasons: 0,
      notes: [reason],
    };
    return { ok: false, reason, stage };
  }
}
