import { z } from "zod";
import type { BuiltInnovation, IndicatorKey } from "@/lib/data/types";
import type { Dataset } from "@/lib/data/to-contracts";
import { indicatorLabel } from "@/lib/labels";
import { loadPrompt, toStageLog, type Llm } from "@/lib/llm";
import type { Assessment, MatchMode, StageLog } from "@/lib/contracts";
import { placeDescription, readerContextLine, wrapNeed, type ReaderContext } from "./context";
import { checkQuote } from "./grounding";
import { clampScore, cleanId, clip } from "./shortlist";
import { MAX_GAPS, MAX_REASONS, MAX_TOP_IDS, PARTIAL_MIN, ROUTE_MIN, modeFor } from "./thresholds";

/*
 * Stage 2 of FR-3.2: the model reads the records of the shortlisted
 * candidates, the need and the place, and scores each candidate with
 * reasons that quote a named field (schema 8.3). The validation of FR-3.4
 * keeps a reason only when its field was given to the model and its quote
 * is found there; the mode comes from the best validated fit (FR-3.3).
 *
 * The quotable fields (docs/innovation-record.md sections 3, 4 and 8):
 * - our derived text (summary, problem, mechanism, requirements): written
 *   by the extraction, allowed for every licence;
 * - the source passages that describe the problem, the mechanism, the
 *   people served and the evidence: ROPS items may be shown in full (CC BY
 *   4.0, the MIIS items by decision D.4); national-base
 *   text is stored for quotes of at most 25 words (8.1), and a quote here
 *   has at most 15. Authors, contacts, places, funding and the free-text
 *   website field are never given: they name people or are not about fit.
 * Long passages are cut to MAX_FIELD_WORDS; the quote is checked against
 * the text the model saw.
 */

/** Our derived fields; requires_pl is a list and is given joined with "; ". */
export const DERIVED_QUOTE_FIELDS = ["summary_pl", "problem_pl", "mechanism_pl", "requires_pl"] as const;

/** Source passages per catalogue, as the catalogue names them. A partner hand-over gets the derived fields only. */
export const SOURCE_QUOTE_FIELDS: Record<string, readonly string[]> = {
  "baza-krajowa": ["problem", "jak_dziala", "komu_sluzy", "rezultaty_testowania"],
  "rops-biblioteka": ["jakich_problemow_dotyczy", "na_czym_polega", "grupa_docelowa", "kto_moze_skorzystac", "czy_to_dziala"],
};

/** Every field name a reason may name; each has a reader label in src/lib/labels.ts. */
export const QUOTE_FIELDS: readonly string[] = [...DERIVED_QUOTE_FIELDS, ...new Set(Object.values(SOURCE_QUOTE_FIELDS).flat())];

const MAX_FIELD_WORDS = 150;
const NEARBY_KM = 50;
const MAX_NEARBY = 3;
const MAX_WHY_CHARS = 300;
const MAX_GAP_CHARS = 200;
const MAX_NOTE_CHARS = 300;

export const assessSchema = z.object({
  mode: z.string(),
  mode_reason_pl: z.string().nullable(),
  top_ids: z.array(z.string()),
  assessments: z.array(
    z.object({
      id: z.string(),
      fit_score: z.number(),
      fit_reasons: z.array(z.object({ field: z.string(), quote: z.string(), why_pl: z.string() })),
      gaps_pl: z.array(z.string()),
      adaptation_note_pl: z.string().nullable(),
    }),
  ),
});

export type AssessOutput = z.infer<typeof assessSchema>;

// ---------------------------------------------------------------- the input

function clipWords(text: string, max: number): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  return words.length <= max ? words.join(" ") : `${words.slice(0, max).join(" ")} …`;
}

/** The quotable fields of one record, as given to the model: name to text. */
export function quotableFields(record: BuiltInnovation): Record<string, string> {
  const fields: Record<string, string> = {};
  const derived = record.derived;
  fields.summary_pl = derived.summary_pl;
  fields.problem_pl = derived.problem_pl;
  fields.mechanism_pl = derived.mechanism_pl;
  if (derived.requires_pl.length > 0) fields.requires_pl = derived.requires_pl.join("; ");
  const sourceFields = record.source_fields as Record<string, string | undefined>;
  for (const name of SOURCE_QUOTE_FIELDS[record.source] ?? []) {
    const text = sourceFields[name]?.trim();
    if (text) fields[name] = clipWords(text, MAX_FIELD_WORDS);
  }
  return fields;
}

function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}

function implementationsNear(dataset: Dataset, id: string, terc: string | null) {
  const all = dataset.locatedImplementations.filter((item) => item.innovation_id === id);
  const origin = terc ? dataset.gminaByTerc.get(terc)?.centroid : undefined;
  const nearest = origin
    ? all
        .map((item) => ({
          miejsce: item.place_name ?? dataset.gminaByTerc.get(item.place_terc)?.name ?? item.place_terc,
          km: distanceKm(origin, item.centroid),
          status: item.status,
        }))
        .filter((item) => item.km <= NEARBY_KM)
        .sort((a, b) => a.km - b.km)
        .slice(0, MAX_NEARBY)
    : [];
  return { znane: all.length, w_promieniu_50_km: nearest };
}

/** One candidate for the prompt: codes to read, fields to quote, implementations nearby. */
function recordBlock(dataset: Dataset, record: BuiltInnovation, fields: Record<string, string>, terc: string | null): string {
  const derived = record.derived;
  return JSON.stringify({
    id: record.id,
    tytul: record.title,
    zrodlo: record.source,
    kody: {
      grupy: derived.target_groups,
      dziedziny: derived.domains,
      wdrazajacy: derived.implementer_types,
      koszt: derived.cost_band,
      czas_wdrozenia: derived.time_to_implement,
      dowody: derived.evidence_level,
      teren: derived.setting,
      skala: derived.scale,
    },
    pola: fields,
    wdrozenia: implementationsNear(dataset, record.id, terc),
  });
}

/** The gmina and its indicators with source and year (8.8); null values are left out, not guessed. */
function placeBlock(dataset: Dataset, terc: string | null): string {
  const place = placeDescription(dataset, terc);
  if (!terc || !place) return JSON.stringify({ gmina: null });
  const file = dataset.raw.indicators;
  const values = file.gminas[terc]?.values ?? {};
  const indicators = file.indicators.flatMap((meta) => {
    const value = values[meta.key as IndicatorKey];
    if (!value) return [];
    const label = indicatorLabel(meta.key);
    return [{ wskaznik: label.name, wartosc: value.value, jednostka: label.unit, rok: value.year, mediana_malopolski: meta.median }];
  });
  return JSON.stringify({ gmina: place, teryt: terc, wskazniki: indicators, zrodlo_wskaznikow: file.source.name });
}

export function assessUser(dataset: Dataset, reader: ReaderContext, needText: string): string {
  return [
    `Kontekst: ${readerContextLine(dataset, reader)}`,
    `Miejsce: ${placeBlock(dataset, reader.placeTerc)}`,
    "",
    wrapNeed(needText),
  ].join("\n");
}

// ------------------------------------------------------------ validation

export interface ValidatedAssessment {
  mode: MatchMode;
  modeReason: string | null;
  assessments: Assessment[];
  topIds: string[];
  droppedIds: string[];
  droppedReasons: number;
  notes: string[];
}

/** FR-3.3 and FR-3.4 over the model's answer. `given` maps each id to the fields the model saw. Pure, for the tests. */
export function validateAssessment(output: AssessOutput, given: ReadonlyMap<string, Record<string, string>>): ValidatedAssessment {
  const droppedIds: string[] = [];
  const counts = { unknownField: 0, notFound: 0, empty: 0, cut: 0 };
  let ungrounded = 0;
  const seen = new Set<string>();
  const assessments: Assessment[] = [];

  for (const item of output.assessments) {
    const id = cleanId(item.id);
    const fields = given.get(id);
    if (!fields) {
      droppedIds.push(id);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);

    const reasons: Assessment["fit_reasons"] = [];
    for (const reason of item.fit_reasons) {
      if (reasons.length >= MAX_REASONS) break;
      const field = reason.field.trim();
      const text = fields[field];
      if (text === undefined) {
        counts.unknownField += 1;
        continue;
      }
      const verdict = checkQuote(reason.quote, text);
      if (!verdict.ok) {
        if (verdict.reason === "empty") counts.empty += 1;
        else counts.notFound += 1;
        continue;
      }
      if (verdict.cut) counts.cut += 1;
      reasons.push({ field, quote: verdict.quote, why_pl: clip(reason.why_pl, MAX_WHY_CHARS) });
    }
    if (reasons.length === 0) {
      droppedIds.push(id);
      ungrounded += 1;
      continue;
    }
    const note = item.adaptation_note_pl ? clip(item.adaptation_note_pl, MAX_NOTE_CHARS) : "";
    assessments.push({
      id,
      fit_score: clampScore(item.fit_score),
      fit_reasons: reasons,
      gaps_pl: item.gaps_pl
        .map((gap) => clip(gap, MAX_GAP_CHARS))
        .filter(Boolean)
        .slice(0, MAX_GAPS),
      adaptation_note_pl: note || null,
    });
  }
  assessments.sort((a, b) => b.fit_score - a.fit_score);

  const mode = modeFor(assessments[0]?.fit_score ?? null);
  const fit = new Map(assessments.map((a) => [a.id, a.fit_score]));
  // The model's picks that survived, best validated fit first; its full list when it picked none.
  let top = [...new Set(output.top_ids.map(cleanId))].filter((id) => fit.has(id));
  if (top.length === 0) top = assessments.map((a) => a.id);
  top.sort((a, b) => fit.get(b)! - fit.get(a)!);
  // A route or a partial route shows no candidate below the partial threshold; "none" shows the nearest (S3).
  if (mode !== "none") top = top.filter((id) => fit.get(id)! >= PARTIAL_MIN);

  const droppedReasons = counts.unknownField + counts.notFound + counts.empty;
  const notes: string[] = [];
  const unknownIds = droppedIds.length - ungrounded;
  if (unknownIds > 0) notes.push(`assessments: ${unknownIds} ids not among the candidates`);
  if (ungrounded > 0) notes.push(`assessments: ${ungrounded} candidates dropped, no grounded reason`);
  const missing = [...given.keys()].filter((id) => !seen.has(id)).length;
  if (missing > 0) notes.push(`assessments: ${missing} candidates not assessed by the model`);
  if (droppedReasons > 0) {
    notes.push(
      `reasons dropped: ${counts.notFound} quote not found, ${counts.unknownField} unknown field, ${counts.empty} under 2 words`,
    );
  }
  if (counts.cut > 0) notes.push(`quotes: ${counts.cut} over 15 words cut to 15`);
  const modelMode = output.mode.trim();
  if (modelMode !== mode) notes.push(`mode: model said ${modelMode.slice(0, 20)}, thresholds say ${mode}`);

  return {
    mode,
    modeReason: modelMode === mode && output.mode_reason_pl ? clip(output.mode_reason_pl, MAX_NOTE_CHARS) || null : null,
    assessments,
    topIds: top.slice(0, MAX_TOP_IDS),
    droppedIds,
    droppedReasons,
    notes,
  };
}

// ------------------------------------------------------------------ stage

export interface AssessStage extends Omit<ValidatedAssessment, "droppedIds" | "droppedReasons" | "notes"> {
  stage: StageLog;
}

/** The body of prompts/assess.md with the thresholds of thresholds.ts filled in. */
function assessSystem(body: string): string {
  return body
    .replaceAll("{{ROUTE_MIN}}", String(ROUTE_MIN))
    .replaceAll("{{PARTIAL_MIN}}", String(PARTIAL_MIN))
    .replaceAll("{{PARTIAL_MAX}}", String(ROUTE_MIN - 1));
}

export async function runAssess(
  llm: Llm,
  dataset: Dataset,
  reader: ReaderContext,
  needText: string,
  candidateIds: string[],
): Promise<AssessStage> {
  const records = new Map(dataset.raw.records.map((record) => [record.id, record]));
  const given = new Map<string, Record<string, string>>();
  const blocks: string[] = [];
  for (const id of candidateIds) {
    const record = records.get(id);
    if (!record) continue;
    const fields = quotableFields(record);
    given.set(id, fields);
    blocks.push(recordBlock(dataset, record, fields, reader.placeTerc));
  }
  const prompt = loadPrompt("assess");
  const result = await llm({
    task: "assess",
    system: assessSystem(prompt.body),
    promptVersion: prompt.version,
    cachedBlocks: [`Kandydaci: ${blocks.length}\n${blocks.join("\n")}`],
    user: assessUser(dataset, reader, needText),
    schema: assessSchema,
    effort: "high",
    maxTokens: 4_000,
  });
  const { droppedIds, droppedReasons, notes, ...validated } = validateAssessment(result.parsed, given);
  return { ...validated, stage: toStageLog("assess", result, { droppedIds, droppedReasons, notes }) };
}
