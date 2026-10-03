import { z } from "zod";
import type { Need, SensitiveTopic, Brief, BriefMatch, BriefProsePart, StageLog } from "@/lib/contracts";
import type { Dataset } from "@/lib/data/to-contracts";
import { t } from "@/lib/i18n";
import { implementerLabels, indicatorLabel, targetGroupLabel } from "@/lib/labels";
import { toStageLog } from "@/lib/llm/observability";
import { loadPrompt } from "@/lib/llm/prompts";
import { LlmError, type Llm } from "@/lib/llm/types";
import type { BannedWords } from "@/server/route/safety";
import { clean, knownText, needSummary, proseProblem, redactPatterns, type KnownText, type ProseLimits } from "./checks";

/*
 * The incubator brief of FR-5.5 with the prompt brief.md (9.4). The model
 * writes only the prose: the working title, the problem, the gap and the
 * direction, which is always a hypothesis. Everything that states a fact
 * (who and how many, what exists, partners, paths, sources, the footer)
 * stays as the template of src/server/needs/brief-template.ts assembled it from data.
 * Each prose part passes the checks of checks.ts or its template stands;
 * a model error leaves the whole template, and the stage notes say which.
 */

export const briefSchema = z.object({
  title_pl: z.string(),
  problem_pl: z.string(),
  gap_pl: z.string(),
  direction_pl: z.string(),
});
export type BriefOutput = z.infer<typeof briefSchema>;

export type { BriefProsePart } from "@/lib/contracts";

/** The brief with the model's prose: the same type, the prose fields set where the checks passed. */
export type GeneratedBrief = Brief;

/**
 * What the brief reads of the data: the catalogue's facade (src/lib/catalogue.ts)
 * has these parts on the fixtures too, the full Dataset has them as well.
 */
export type BriefData = Pick<Dataset, "innovationById" | "gminaByTerc" | "helplines">;

const LIMITS: Record<BriefProsePart, ProseLimits> = {
  title: { min: 8, max: 90 },
  problem: { min: 40, max: 900 },
  gap: { min: 30, max: 700 },
  direction: { min: 30, max: 700 },
};

/** The direction is a hypothesis (FR-5.5): it has to say so or speak conditionally. */
const HYPOTHESIS = /hipotez|sprawdzi|sprawdzeni|przetestow|testow|może|mogł|można|warto|czy\s/iu;

/** Helplines per sensitive topic (FR-12.10), in the order of data/helplines.yaml; at most three on a brief. */
const HELPLINES_BY_TOPIC: Record<SensitiveTopic, string[]> = {
  suicide: ["hl-116123", "hl-800702222", "hl-116111"],
  self_harm: ["hl-116123", "hl-800702222", "hl-116111"],
  violence: ["hl-800120002"],
  sexual_violence: ["hl-800120002"],
  child_abuse: ["hl-800100100", "hl-116111"],
  addiction: ["hl-116123"],
};
const MAX_HELPLINES = 3;

export function helplinesLine(topics: SensitiveTopic[], dataset: Pick<Dataset, "helplines">): string | null {
  const ids = [...new Set(topics.flatMap((topic) => HELPLINES_BY_TOPIC[topic] ?? []))];
  const lines = dataset.helplines.support.filter((line) => ids.includes(line.id)).slice(0, MAX_HELPLINES);
  if (lines.length === 0) return null;
  return t("brief.helplines", { lines: lines.map((line) => `${line.number} ${line.short}`).join("; ") });
}

/**
 * The template with the need's nearest matches (FR-5.3) where the route gave
 * none: a need typed straight into the bank has no route, so its duplicate
 * check comes from the stored matches.
 */
export function withNearestMatches(template: Brief, need: Need, dataset: Pick<Dataset, "innovationById">): Brief {
  if (template.matches.length > 0 || need.nearest_matches.length === 0) return template;
  const matches: BriefMatch[] = need.nearest_matches.flatMap((match) => {
    const item = dataset.innovationById.get(match.innovation_id);
    if (!item) return [];
    return [{ id: item.id, title: item.title, sourceUrl: item.sourceUrl, fits: [match.what_fits_pl], lacks: [match.what_lacks_pl] }];
  });
  const lacks = matches.flatMap((match) => match.lacks).filter((lack) => lack !== t("brief.existing.lacksNone"));
  const known = new Set(template.sources.map((source) => source.url));
  const sources = matches.flatMap((match) => (match.sourceUrl && !known.has(match.sourceUrl) ? [{ title: match.title, url: match.sourceUrl }] : []));
  return {
    ...template,
    matches,
    gaps: template.gaps.length > 0 ? template.gaps : [...new Set(lacks)],
    sources: [...sources, ...template.sources],
  };
}

/** How an indicator compares with the region, in words: the model sees no numbers (9.4). */
function comparison(value: number, median: number): string {
  if (value > median * 1.05) return "wyższy niż mediana Małopolski";
  if (value < median * 0.95) return "niższy niż mediana Małopolski";
  return "zbliżony do mediany Małopolski";
}

export interface BriefFacts {
  place: string | null;
  role: string | null;
  target_groups: string[];
  need_summary: string | null;
  sensitive_topics: SensitiveTopic[];
  scale: { indicator: string; compared_to_region: string }[];
  existing: { title: string; what_fits: string[]; what_lacks: string[] }[];
  similar_needs: number;
  implementer_types: string | null;
  paths: string[];
}

/** The facts of the call: from the template and the need; never the reporter, amounts or deadlines (FR-6.6, 9.4). */
export function briefFacts(template: Brief, need: Need, dataset: Pick<Dataset, "gminaByTerc">, sensitiveTopics: SensitiveTopic[]): BriefFacts {
  const gmina = need.place_terc ? dataset.gminaByTerc.get(need.place_terc) : undefined;
  return {
    place: gmina?.name ?? null,
    role: need.role,
    target_groups: template.groups.map(targetGroupLabel),
    need_summary: need.summary_pl ? needSummary(need) : null,
    sensitive_topics: sensitiveTopics,
    scale: template.indicators.map((item) => ({
      indicator: indicatorLabel(item.key).name,
      compared_to_region: comparison(item.value, item.median),
    })),
    existing: template.matches.map((match) => ({ title: match.title, what_fits: match.fits, what_lacks: match.lacks })),
    similar_needs: template.similarNeeds.length,
    implementer_types: template.implementerTypes.length > 0 ? implementerLabels(template.implementerTypes) : null,
    paths: template.paths.map((path) => path.name_pl),
  };
}

/** The user part: the facts as JSON, the need text last inside <potrzeba> tags (9.3). */
export function briefUserPart(facts: BriefFacts, needText: string): string {
  const text = redactPatterns(needText).replace(/[<>]/g, " ").trim();
  return `${JSON.stringify(facts, null, 1)}\n<potrzeba>\n${text}\n</potrzeba>`;
}

export interface FinishedProse {
  title: string | null;
  problem: string | null;
  gap: string | null;
  direction: string | null;
  notes: string[];
}

/** Words in a row the problem may share with the need text: the model rewrites it (E1), it does not copy it. */
export const MAX_COPIED_WORDS = 12;

/** The longest run of consecutive words of `text` that also stands in `source`, compared in lower case. */
export function longestCopiedRun(text: string, source: string): number {
  const words = (value: string) => value.normalize("NFC").toLocaleLowerCase("pl").match(/[\p{L}\p{N}]+/gu) ?? [];
  const target = words(text);
  const haystack = ` ${words(source).join(" ")} `;
  let best = 0;
  for (let start = 0; start + best < target.length; start++) {
    let length = best + 1;
    while (start + length <= target.length && haystack.includes(` ${target.slice(start, start + length).join(" ")} `)) {
      best = length;
      length += 1;
    }
  }
  return best;
}

/** Applies the checks to each prose part; a part that fails is null and its template stands. */
export function finishProse(output: BriefOutput, known: KnownText, needText: string, banned?: BannedWords): FinishedProse {
  const notes: string[] = [];
  const check = (part: BriefProsePart, raw: string, extra?: (text: string) => string | null): string | null => {
    let text = clean(raw);
    // A working title, not a sentence: no full stop at the end.
    if (part === "title") text = text.replace(/[.!?;:]+$/, "").trim();
    const problem = text ? (proseProblem(text, LIMITS[part], known, banned) ?? extra?.(text) ?? null) : "empty";
    if (problem) {
      notes.push(`${part} templated: ${problem}`);
      return null;
    }
    return text;
  };
  return {
    title: check("title", output.title_pl),
    problem: check("problem", output.problem_pl, (text) => (longestCopiedRun(text, needText) > MAX_COPIED_WORDS ? "copied-need-text" : null)),
    gap: check("gap", output.gap_pl),
    direction: check("direction", output.direction_pl, (text) => (HYPOTHESIS.test(text) ? null : "not-hypothesis")),
    notes,
  };
}

export interface BriefDeps {
  llm: Llm;
  dataset: BriefData;
  /** The brief assembled from data (buildBrief of src/server/needs/brief-template.ts): it stands wherever the model's text does not. */
  template: Brief;
  /** The screening's topics of the route the need came from (FR-12.10); empty when unknown. */
  sensitiveTopics?: SensitiveTopic[];
  /** For tests; the repository's list otherwise. */
  banned?: BannedWords;
}

const EFFORT = "high";
const MAX_TOKENS = 8000;

export async function generateBrief(need: Need, deps: BriefDeps): Promise<{ brief: Brief; stage: StageLog | null }> {
  const topics = deps.sensitiveTopics ?? [];
  const template = withNearestMatches(deps.template, need, deps.dataset);
  const helplines = helplinesLine(topics, deps.dataset);
  const base: Brief = { ...template, gapText: null, direction: null, helplines, generation: null };

  const facts = briefFacts(template, need, deps.dataset, topics);
  const prompt = loadPrompt("brief");
  const started = Date.now();
  let output: BriefOutput;
  let stage: StageLog;
  try {
    const result = await deps.llm({
      task: "brief",
      system: prompt.body,
      promptVersion: prompt.version,
      user: briefUserPart(facts, need.problem_text),
      schema: briefSchema,
      effort: EFFORT,
      maxTokens: MAX_TOKENS,
    });
    output = result.parsed;
    stage = toStageLog("brief", result);
  } catch (error) {
    if (!(error instanceof LlmError)) throw error;
    return {
      brief: base,
      stage: {
        stage: "brief",
        provider: error.provider ?? "none",
        model: "",
        promptVersion: prompt.version,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        latencyMs: Date.now() - started,
        cached: false,
        droppedIds: [],
        droppedReasons: 0,
        notes: [`model failed (${error.kind}): template brief`],
      },
    };
  }

  const known = knownText(JSON.stringify(facts), need.problem_text, template.title);
  const prose = finishProse(output, known, need.problem_text, deps.banned);
  stage.notes.push(...prose.notes);
  const parts = (["title", "problem", "gap", "direction"] as const).filter((part) => prose[part] !== null);
  if (parts.length === 0) stage.notes.push("every part templated: template brief");
  return {
    brief: {
      ...base,
      title: prose.title ?? template.title,
      problem: prose.problem ?? template.problem,
      gapText: prose.gap,
      direction: prose.direction,
      generation: { promptVersion: stage.promptVersion ?? prompt.version, provider: stage.provider, model: stage.model, parts, notes: [...stage.notes] },
    },
    stage,
  };
}
