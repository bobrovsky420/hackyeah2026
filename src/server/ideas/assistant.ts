import { z } from "zod";
import { canvasSections, optionKey, stepTitleKey } from "@/lib/canvas";
import { catalogue as defaultCatalogue, type Catalogue } from "@/lib/catalogue";
import type { AssistantBlock, AssistantDiagram, AssistantRun, AssistantSuggestion, DiagramStep, Idea, IdeaAssistant, Innovation } from "@/lib/contracts";
import { t, type MessageKey } from "@/lib/i18n";
import { costLabel, ideaStageLabel, implementerLabels, targetGroupLabel, timeLabel } from "@/lib/labels";
import { getLlm } from "@/lib/llm";
import { loadPrompt } from "@/lib/llm/prompts";
import { LlmError, type Llm } from "@/lib/llm/types";
import { repository, type Repository } from "@/server/db";
import { clean, knownText, proseProblem, redactPatterns, type KnownText } from "@/server/needs/checks";
import { routeEngine } from "@/server/route-service";
import { bannedWords, type BannedWords } from "@/server/route/safety";
import { similarForIdea } from "./index";

/*
 * The idea assistant of module III ("Asystent kreatora"), task "Rozwiń
 * pomysł" with the prompt develop.md: questions, inspirations and ideas for
 * the blocks of the CANVAS application where the card says least. It reads
 * the card and its similar innovations (the matcher's, FR-5.3), so an
 * inspiration always quotes a catalogue record, which the server names by a
 * label (K01...) and maps back, as stage 1 does (M.9). Every text passes
 * the checks of the brief: no new names or numbers, no banned words. What
 * fails is dropped; when nothing is left, or there is no model, the
 * template stands: inspirations drawn from the records' own fields and the
 * questions of the canvas. The author's name and e-mail never enter the
 * prompt (FR-6.6). A run is stored with the card and shown as stored.
 */

export const ASSISTANT_BLOCKS = ["problem", "actors", "solution", "recipients", "value", "costs", "revenue", "channels", "partners", "impact"] as const satisfies readonly AssistantBlock[];

const MAX_SUGGESTIONS = 6;
const PER_BLOCK = 2;
const MAX_SOURCES = 5;
const LIMITS = { min: 20, max: 320 };
const TEMPERATURE = 0.7;
/** The capitalised forms of address of the singular "Ty" (rule 11), which the name check would read as new names. */
const ADDRESS = "Ty Ciebie Cię Tobie Tobą Twój Twoja Twoje Twojego Twojej Twoim Twoją Twoich Twoimi Twym Twą";
const MAX_TOKENS = 2_000;

export const developSchema = z.object({
  suggestions: z
    .array(
      z.object({
        block: z.string(),
        kind: z.string(),
        text_pl: z.string(),
        source: z.string().nullable(),
      }),
    )
    .max(12),
});
export type DevelopOutput = z.infer<typeof developSchema>;

export interface AssistantDeps {
  repo: Repository;
  llm: Llm;
  catalogue: Pick<Catalogue, "innovationById">;
  banned: BannedWords;
  engine: "live" | "canned";
  /** The similar innovations of a card, computed when missing; tests pass a stand-in. */
  similar: (id: string) => Promise<Idea | null>;
  now: () => Date;
}

function resolve(given: Partial<AssistantDeps> = {}): AssistantDeps {
  const repo = given.repo ?? repository();
  return {
    repo,
    llm: given.llm ?? getLlm(),
    catalogue: given.catalogue ?? defaultCatalogue(),
    banned: given.banned ?? bannedWords(),
    engine: given.engine ?? routeEngine(),
    similar: given.similar ?? ((id) => similarForIdea(id, { repo })),
    now: given.now ?? (() => new Date()),
  };
}

const isBlock = (value: string): value is AssistantBlock => (ASSISTANT_BLOCKS as readonly string[]).includes(value);
/** The title of a block, for the card's page and the panel. */
export const blockTitle = (block: AssistantBlock) => t(stepTitleKey(block));
const label = (index: number) => `K${String(index + 1).padStart(2, "0")}`;

/**
 * The blocks where the card says least, in the canvas's order: for a short
 * form, the ones it never asks about; for a CANVAS application, the empty
 * answers and the lowest levels of its scales.
 */
export function weakBlocks(idea: Pick<Idea, "canvas">): AssistantBlock[] {
  if (!idea.canvas) return ASSISTANT_BLOCKS.filter((block) => ["revenue", "channels", "partners", "impact"].includes(block));
  const { answers, partners } = idea.canvas;
  const text = (id: string) => (typeof answers[id] === "string" ? (answers[id] as string).trim() : "");
  const list = (id: string) => (Array.isArray(answers[id]) ? (answers[id] as string[]) : []);
  const weak: AssistantBlock[] = [];
  if (!text("supporters") && !text("blockers")) weak.push("actors");
  if (["niejasne", "czesciowo"].includes(text("clarity"))) weak.push("solution");
  if (["koszt-wiekszy", "podobne"].includes(text("value"))) weak.push("costs");
  if (list("fixed").length === 0 && list("variable").length === 0 && !weak.includes("costs")) weak.push("costs");
  if (text("income") === "nie-wiemy" || text("growth") === "brak") weak.push("revenue");
  if (list("direct").length === 0 && list("through").length === 0 && list("extra").length === 0) weak.push("channels");
  if (partners.length === 0) weak.push("partners");
  if (["impact_person", "impact_community", "impact_environment"].every((id) => text(id) === "maly" || text(id) === "")) weak.push("impact");
  return ASSISTANT_BLOCKS.filter((block) => weak.includes(block));
}

/** The innovations the assistant may quote: the card's similar ones, best first. */
export function assistantSources(idea: Pick<Idea, "similar">, data: Pick<Catalogue, "innovationById">): Innovation[] {
  return (idea.similar ?? []).flatMap((match) => data.innovationById.get(match.innovation_id) ?? []).slice(0, MAX_SOURCES);
}

export interface DevelopFacts {
  pomysl: { nazwa: string; istota: string; dla_kogo: string; etap: string; grupy: string[] };
  canvas: { blok: string; odpowiedzi: string[] }[] | null;
  slabe_bloki: { blok: AssistantBlock; nazwa: string }[];
  zrodla: { etykieta: string; tytul: string; streszczenie: string; mechanizm: string; wymaga: string[]; kto_wdraza: string | null; koszt: string; czas: string }[];
}

/** The facts of the call; never the author, the e-mail or the place (FR-6.6). */
export function developFacts(idea: Idea, sources: Innovation[]): DevelopFacts {
  return {
    pomysl: {
      nazwa: idea.title,
      istota: idea.essence,
      dla_kogo: idea.for_whom,
      etap: ideaStageLabel(idea.stage),
      grupy: idea.target_groups.map(targetGroupLabel),
    },
    canvas: idea.canvas
      ? canvasSections(idea.canvas).map((section) => ({ blok: section.title, odpowiedzi: section.rows.map((row) => `${row.label} ${row.value}`) }))
      : null,
    slabe_bloki: weakBlocks(idea).map((block) => ({ blok: block, nazwa: blockTitle(block) })),
    zrodla: sources.map((item, index) => ({
      etykieta: label(index),
      tytul: item.title,
      streszczenie: item.summary,
      mechanizm: item.mechanism,
      wymaga: item.requires,
      kto_wdraza: item.implementerTypes.length > 0 ? implementerLabels(item.implementerTypes) : null,
      koszt: costLabel(item.costBand),
      czas: timeLabel(item.timeToImplement),
    })),
  };
}

/** The user part: the facts as JSON, the card's description last inside <pomysl> tags (9.3). */
export function developUserPart(facts: DevelopFacts | ShowFacts, description: string): string {
  const text = redactPatterns(description).replace(/[<>]/g, " ").trim();
  return `${JSON.stringify(facts, null, 1)}\n<pomysl>\n${text}\n</pomysl>`;
}

/**
 * The model's suggestions that pass: a known block and kind, an inspiration
 * with a label of the sources (mapped to its id), an idea without one, the
 * text checks; at most two a block and six in all. The notes say what fell.
 */
export function finishSuggestions(
  output: DevelopOutput,
  sources: Innovation[],
  known: KnownText,
  banned?: BannedWords,
): { suggestions: AssistantSuggestion[]; notes: string[] } {
  const notes: string[] = [];
  const kept: AssistantSuggestion[] = [];
  const seen = new Set<string>();
  for (const item of output.suggestions) {
    if (kept.length >= MAX_SUGGESTIONS) break;
    if (!isBlock(item.block)) {
      notes.push(`unknown block ${item.block}`);
      continue;
    }
    if (item.kind !== "pytanie" && item.kind !== "inspiracja" && item.kind !== "pomysl") {
      notes.push(`unknown kind ${item.kind}`);
      continue;
    }
    const index = item.source ? /^K(\d{2})$/.exec(item.source.trim()) : null;
    const source = index ? sources[Number(index[1]) - 1] : undefined;
    if (item.kind === "inspiracja" && !source) {
      notes.push(`inspiration without a known source (${item.source ?? "none"})`);
      continue;
    }
    // A label in brackets after a title goes; a label left in the text becomes the innovation's title;
    // a label of no source drops the suggestion.
    let unknownLabel = false;
    const sourceOf = (digits: string) => {
      const named = sources[Number(digits) - 1];
      if (!named) unknownLabel = true;
      return named;
    };
    const text = clean(item.text_pl)
      .replace(/\s*[([]\s*K(\d{2})\s*[)\]]/g, (_match, digits: string) => {
        sourceOf(digits);
        return "";
      })
      .replace(/(?:[Ii]nnowacj[aięą]\s+)?\bK(\d{2})\b/g, (_match, digits: string) => {
        const named = sourceOf(digits);
        return named ? `„${named.title}”` : "";
      })
      .replace(/\s+/g, " ")
      .trim();
    if (unknownLabel) {
      notes.push(`${item.block}: a label of no source in the text`);
      continue;
    }
    const problem = proseProblem(text, LIMITS, known, banned);
    if (problem) {
      notes.push(`${item.block}: ${problem}`);
      continue;
    }
    if (kept.filter((other) => other.block === item.block).length >= PER_BLOCK || seen.has(text)) {
      notes.push(`${item.block}: over the limit`);
      continue;
    }
    seen.add(text);
    kept.push({ block: item.block, kind: item.kind, text_pl: text, innovation_id: item.kind === "inspiracja" ? source!.id : null });
  }
  return { suggestions: kept, notes };
}

/** The first sentence of a record's text, for a template line. */
const firstSentence = (text: string) => clean(text.split(/(?<=[.!?])\s/)[0] ?? text);

const QUESTION_KEYS: Record<AssistantBlock, MessageKey> = {
  problem: "assistant.question.problem",
  actors: "assistant.question.actors",
  solution: "assistant.question.solution",
  recipients: "assistant.question.recipients",
  value: "assistant.question.value",
  costs: "assistant.question.costs",
  revenue: "assistant.question.revenue",
  channels: "assistant.question.channels",
  partners: "assistant.question.partners",
  impact: "assistant.question.impact",
};

/**
 * The suggestions without a model: a question for each weak block, then
 * inspirations from the records' own fields (who runs it, what it needs,
 * how it works); nothing the data does not say.
 */
export function templateSuggestions(idea: Idea, sources: Innovation[]): AssistantSuggestion[] {
  const weak = weakBlocks(idea);
  const suggestions: AssistantSuggestion[] = weak.slice(0, 3).map((block) => ({ block, kind: "pytanie", text_pl: t(QUESTION_KEYS[block]), innovation_id: null }));
  for (const item of sources) {
    if (suggestions.length >= MAX_SUGGESTIONS) break;
    if (weak.includes("partners") && item.implementerTypes.length > 0 && !suggestions.some((one) => one.block === "partners" && one.kind === "inspiracja")) {
      suggestions.push({
        block: "partners",
        kind: "inspiracja",
        text_pl: t("assistant.template.implementers", { title: item.title, who: implementerLabels(item.implementerTypes) }),
        innovation_id: item.id,
      });
    } else if (item.requires.length > 0 && !suggestions.some((one) => one.block === "costs" && one.kind === "inspiracja")) {
      suggestions.push({
        block: "costs",
        kind: "inspiracja",
        text_pl: t("assistant.template.requires", { title: item.title, what: item.requires.slice(0, 3).join(", ") }),
        innovation_id: item.id,
      });
    } else if (item.mechanism) {
      suggestions.push({
        block: "solution",
        kind: "inspiracja",
        text_pl: t("assistant.template.mechanism", { title: item.title, how: firstSentence(item.mechanism) }),
        innovation_id: item.id,
      });
    }
  }
  return suggestions;
}

/** One "Rozwiń pomysł" run: the model's suggestions that pass, else the template. */
export async function developRun(idea: Idea, deps: Pick<AssistantDeps, "llm" | "catalogue" | "banned" | "engine" | "now">): Promise<AssistantRun> {
  const sources = assistantSources(idea, deps.catalogue);
  const at = deps.now().toISOString();
  const template: AssistantRun = { suggestions: templateSuggestions(idea, sources), source: "template", prompt_version: null, at };
  if (deps.engine === "canned") return template;
  const prompt = loadPrompt("develop");
  const facts = developFacts(idea, sources);
  try {
    const result = await deps.llm({
      task: "develop",
      system: prompt.body,
      promptVersion: prompt.version,
      user: developUserPart(facts, idea.description),
      schema: developSchema,
      effort: "medium",
      maxTokens: MAX_TOKENS,
      temperature: TEMPERATURE,
    });
    const known = knownText(JSON.stringify(facts), idea.description, idea.title, idea.essence, idea.for_whom, ADDRESS);
    const { suggestions, notes } = finishSuggestions(result.parsed, sources, known, deps.banned);
    if (notes.length > 0) console.info(JSON.stringify({ event: "assistant_dropped", task: "develop", notes }));
    return suggestions.length > 0 ? { suggestions, source: "model", prompt_version: prompt.version, at } : template;
  } catch (error) {
    if (!(error instanceof LlmError)) throw error;
    console.warn(JSON.stringify({ event: "assistant_model_failed", task: "develop", kind: error.kind }));
    return template;
  }
}

// ------------------------------------------------------- "Pokaż" (show)

export const DIAGRAM_STEPS = ["who", "what", "for_whom", "with_whom", "change"] as const satisfies readonly DiagramStep[];

const PHRASE = { min: 3, max: 60 };
const PER_STEP = 3;

export const showSchema = z.object({
  who: z.array(z.string()).max(6),
  what: z.array(z.string()).max(6),
  for_whom: z.array(z.string()).max(6),
  with_whom: z.array(z.string()).max(6),
  change: z.array(z.string()).max(6),
});
export type ShowOutput = z.infer<typeof showSchema>;

export interface ShowFacts {
  pomysl: DevelopFacts["pomysl"];
  canvas: DevelopFacts["canvas"];
}

const lower = (text: string) => text.charAt(0).toLocaleLowerCase("pl") + text.slice(1);
const codes = (idea: Idea, id: string) => {
  const value = idea.canvas?.answers[id];
  return Array.isArray(value) ? value : [];
};

/**
 * The diagram without a model, from the card and its canvas only: who (the
 * organisation that sent it, else its author in general), what (the
 * card's name), for whom (the canvas's users, else the card's own words),
 * with whom (the canvas's partners and deciders) and what changes (the
 * values it chose). A step the card says nothing about stays empty.
 */
export function templateDiagram(idea: Idea): Record<DiagramStep, string[]> {
  const users = codes(idea, "users").map((code) => lower(t(optionKey("users", code))));
  const values = [...codes(idea, "emotional").map((code) => t(optionKey("emotional", code))), ...codes(idea, "functional").map((code) => t(optionKey("functional", code)))];
  return {
    who: [idea.author.is_organisation ? idea.author.display_name : t("assistant.diagram.author")],
    what: [idea.title],
    for_whom: users.length > 0 ? users.slice(0, PER_STEP) : [firstSentence(idea.for_whom)],
    with_whom: [...(idea.canvas?.partners.map((partner) => partner.name) ?? []), ...codes(idea, "authorities").map((code) => lower(t(optionKey("authorities", code))))].slice(0, PER_STEP),
    change: values.map(lower).slice(0, PER_STEP),
  };
}

/** The model's phrases that pass the checks, step by step; a step left without one takes the template's. */
export function finishDiagram(
  output: ShowOutput,
  template: Record<DiagramStep, string[]>,
  known: KnownText,
  banned?: BannedWords,
): { steps: Record<DiagramStep, string[]>; fromModel: number; notes: string[] } {
  const notes: string[] = [];
  let fromModel = 0;
  const steps = Object.fromEntries(
    DIAGRAM_STEPS.map((step) => {
      const kept: string[] = [];
      for (const raw of output[step]) {
        const phrase = lower(clean(raw).replace(/[.;]+$/, ""));
        const problem = proseProblem(phrase, PHRASE, known, banned);
        if (problem) notes.push(`${step}: ${problem}`);
        else if (kept.length < PER_STEP && !kept.includes(phrase)) kept.push(phrase);
      }
      if (kept.length > 0) fromModel += 1;
      return [step, kept.length > 0 ? kept : template[step]];
    }),
  ) as Record<DiagramStep, string[]>;
  return { steps, fromModel, notes };
}

/** One "Pokaż" run: the model's phrases that pass, step by step, else the template. */
export async function showRun(idea: Idea, deps: Pick<AssistantDeps, "llm" | "banned" | "engine" | "now">): Promise<AssistantDiagram> {
  const at = deps.now().toISOString();
  const template = templateDiagram(idea);
  if (deps.engine === "canned") return { steps: template, source: "template", prompt_version: null, at };
  const prompt = loadPrompt("show");
  const { pomysl, canvas } = developFacts(idea, []);
  const facts: ShowFacts = { pomysl, canvas };
  try {
    const result = await deps.llm({
      task: "show",
      system: prompt.body,
      promptVersion: prompt.version,
      user: developUserPart(facts, idea.description),
      schema: showSchema,
      effort: "low",
      maxTokens: 1_000,
      temperature: 0.2,
    });
    const partners = idea.canvas?.partners.map((partner) => partner.name).join(" ");
    const known = knownText(JSON.stringify(facts), idea.description, idea.title, idea.essence, idea.for_whom, partners, ADDRESS);
    const { steps, fromModel, notes } = finishDiagram(result.parsed, template, known, deps.banned);
    if (notes.length > 0) console.info(JSON.stringify({ event: "assistant_dropped", task: "show", notes }));
    return fromModel > 0 ? { steps, source: "model", prompt_version: prompt.version, at } : { steps: template, source: "template", prompt_version: null, at };
  } catch (error) {
    if (!(error instanceof LlmError)) throw error;
    console.warn(JSON.stringify({ event: "assistant_model_failed", task: "show", kind: error.kind }));
    return { steps: template, source: "template", prompt_version: null, at };
  }
}

// ------------------------------------------------------------- the runs

const holder = globalThis as typeof globalThis & { __assistantInFlight?: Map<string, Promise<Idea | null>> };
const inFlight = (holder.__assistantInFlight ??= new Map());

export type AssistantTask = keyof IdeaAssistant;
export const ASSISTANT_TASKS = ["develop", "show"] as const satisfies readonly AssistantTask[];

/**
 * POST /api/ideas/{id}/assistant: the card with the run of one task,
 * computed and stored on the first call (for "Rozwiń pomysł" the similar
 * innovations first, when missing). Null when the card is unknown.
 * Parallel requests for one card and task share one run.
 */
export async function runAssistant(id: string, task: AssistantTask, given?: Partial<AssistantDeps>): Promise<Idea | null> {
  const deps = resolve(given);
  const stored = await deps.repo.getIdea(id);
  if (!stored) return null;
  if (stored.assistant?.[task]) return stored;
  const key = `${id}:${task}`;
  const running = inFlight.get(key);
  if (running) return running;
  const job = (async () => {
    if (task === "show") {
      const run = await showRun(stored, deps);
      return (await deps.repo.setIdeaAssistant(id, "show", run)) ?? { ...stored, assistant: { ...stored.assistant, show: run } };
    }
    const idea = stored.similar === null ? ((await deps.similar(id)) ?? stored) : stored;
    const run = await developRun(idea, deps);
    return (await deps.repo.setIdeaAssistant(id, "develop", run)) ?? { ...idea, assistant: { ...idea.assistant, develop: run } };
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

/** "Rozwiń pomysł" alone, as the tests and the first route call it. */
export const developIdea = (id: string, given?: Partial<AssistantDeps>) => runAssistant(id, "develop", given);
