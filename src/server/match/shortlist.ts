import { z } from "zod";
import type { Dataset } from "@/lib/data/to-contracts";
import { loadPrompt, toStageLog, type Llm } from "@/lib/llm";
import type { ShortlistCandidate, StageLog } from "@/lib/contracts";
import { findBanned } from "@/server/route/safety";
import { readerContextLine, wrapNeed, type ReaderContext } from "./context";
import { byWeightedFit } from "./rank";
import { MAX_CANDIDATES, MAX_REASON_CHARS, RETRIEVAL_FLOOR } from "./thresholds";

/*
 * Stage 1 of FR-3.1: the model reads the retrieved index cards and the need
 * and returns up to eight candidates (schema 8.3). The schema is loose on
 * purpose (a longer list or a long reason is trimmed here, not rejected by
 * the provider); the validation below keeps only ids among the cards the
 * model was given and codes of data/curated/taxonomies.json.
 *
 * M.9: the cards carry short labels (K01 to K40) instead of their ids, which
 * the validation maps back, because Bielik rebuilt long ids from the titles;
 * and the nearest RETRIEVAL_FLOOR cards join the candidates whether the model
 * picked them or not, because it left out cards the retriever ranked first.
 */

export const shortlistSchema = z.object({
  need_summary_pl: z.string(),
  detected_target_groups: z.array(z.string()),
  detected_domains: z.array(z.string()),
  candidates: z.array(
    z.object({
      id: z.string(),
      prelim_fit: z.number(),
      reason_pl: z.string(),
    }),
  ),
});

export type ShortlistOutput = z.infer<typeof shortlistSchema>;

export interface Shortlist {
  needSummary: string | null;
  targetGroups: string[];
  domains: string[];
  candidates: ShortlistCandidate[];
  stage: StageLog;
}

const MAX_CODES = 3;
const MAX_SUMMARY_CHARS = 200;

/** Cut at a word boundary, with an ellipsis when something was cut. */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

/**
 * An id as the model wrote it, without the wrapping a model sometimes copies
 * from the prompt (brackets, quotes, a trailing colon). An id that differs in
 * anything else stays unknown and is dropped.
 */
export function cleanId(raw: string): string {
  return raw.trim().replace(/^[[("'`\s]+|[\])"'`:.,\s]+$/g, "");
}

export function clampScore(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

/** The closed lists, stable between requests, so the provider can cache them (9.3). */
function taxonomyBlock(dataset: Dataset): string {
  const tax = dataset.raw.taxonomies;
  return [
    `Kody grup docelowych (${tax.version}):`,
    ...tax.target_groups.map((group) => `- ${group.code}: ${group.label_pl}`),
    "",
    "Kody dziedzin:",
    ...tax.domains.map((domain) => `- ${domain.code}: ${domain.label_pl} (${domain.hint_pl})`),
  ].join("\n");
}

/** The label of the card at `index` (0-based) of the retrieved ids: K01 to K40. */
export function cardLabel(index: number): string {
  return `K${String(index + 1).padStart(2, "0")}`;
}

/** A label (K07, k7) as the id of the card it stands for; anything else as the model wrote it. */
function resolveId(raw: string, allowedIds: readonly string[]): string {
  const id = cleanId(raw);
  const label = /^k0*(\d{1,2})$/i.exec(id);
  return label ? (allowedIds[Number(label[1]) - 1] ?? id) : id;
}

function cardsBlock(dataset: Dataset, ids: string[]): string {
  const cards = new Map(dataset.raw.indexCards.map((card) => [card.id, card]));
  const lines = ids.flatMap((id, index) => {
    const card = cards.get(id);
    return card ? [`${cardLabel(index)}: ${card.card} Grupy: ${card.target_groups.join(", ")}.`] : [];
  });
  return [`Indeks: ${lines.length} kart`, ...lines].join("\n");
}

export function shortlistUser(dataset: Dataset, reader: ReaderContext, needText: string): string {
  return `Kontekst: ${readerContextLine(dataset, reader)}\n\n${wrapNeed(needText)}`;
}

/**
 * Server validation of stage 1 (FR-3.4 applied to ids and codes). `allowedIds`
 * are the retrieved ids in the order of the cards, so a label maps to its id
 * and the first RETRIEVAL_FLOOR are the nearest cards. Pure, for the tests.
 */
export function validateShortlist(
  output: ShortlistOutput,
  allowedIds: readonly string[],
  dataset: Dataset,
): Omit<Shortlist, "stage"> & { droppedIds: string[]; notes: string[] } {
  const allowed = new Set(allowedIds);
  const groupCodes = new Set<string>(dataset.raw.taxonomies.target_groups.map((group) => group.code));
  const domainCodes = new Set<string>(dataset.raw.taxonomies.domains.map((domain) => domain.code));
  const notes: string[] = [];

  const codes = (values: string[], known: Set<string>, label: string) => {
    const kept = [...new Set(values.map((value) => value.trim()))].filter((value) => known.has(value));
    const unknown = values.length - kept.length;
    if (unknown > 0) notes.push(`${label}: ${unknown} codes dropped (unknown or repeated)`);
    if (kept.length > MAX_CODES) notes.push(`${label}: cut to ${MAX_CODES}`);
    return kept.slice(0, MAX_CODES);
  };

  const droppedIds: string[] = [];
  const seen = new Set<string>();
  const valid: ShortlistCandidate[] = [];
  for (const candidate of output.candidates) {
    const id = resolveId(candidate.id, allowedIds);
    if (!allowed.has(id)) {
      droppedIds.push(id);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    valid.push({ id, prelim_fit: clampScore(candidate.prelim_fit), reason_pl: clip(candidate.reason_pl, MAX_REASON_CHARS) });
  }
  if (droppedIds.length > 0) notes.push(`candidates: ${droppedIds.length} ids not among the retrieved cards`);
  // Best weighted fit first, the ROPS library first on a tie (FR-3.10); the sort is stable, so the model's order breaks the rest.
  valid.sort(byWeightedFit(dataset, (c) => c.id, (c) => c.prelim_fit));
  // The nearest cards the model left out come last, with no fit and no reason; stage 2 judges them (M.9).
  const floor = allowedIds.slice(0, RETRIEVAL_FLOOR).filter((id) => !seen.has(id));
  const room = MAX_CANDIDATES - floor.length;
  if (valid.length > room) notes.push(`candidates: ${valid.length - room} beyond ${MAX_CANDIDATES} cut`);
  if (floor.length > 0) notes.push(`floor: ${floor.length} of the nearest ${RETRIEVAL_FLOOR} cards added`);

  // The summary is the route's title: a label the user wrote may stay in the need, never in our words (E1).
  let summary: string | null = clip(output.need_summary_pl, MAX_SUMMARY_CHARS) || null;
  const banned = summary ? findBanned(summary) : null;
  if (banned) {
    notes.push(`need summary dropped: banned:${banned}`);
    summary = null;
  }
  return {
    needSummary: summary,
    targetGroups: codes(output.detected_target_groups, groupCodes, "target groups"),
    domains: codes(output.detected_domains, domainCodes, "domains"),
    candidates: [...valid.slice(0, room), ...floor.map((id) => ({ id, prelim_fit: 0, reason_pl: "" }))],
    droppedIds,
    notes,
  };
}

export async function runShortlist(
  llm: Llm,
  dataset: Dataset,
  reader: ReaderContext,
  needText: string,
  retrievedIds: string[],
): Promise<Shortlist> {
  const prompt = loadPrompt("shortlist");
  const result = await llm({
    task: "shortlist",
    system: prompt.body,
    promptVersion: prompt.version,
    cachedBlocks: [taxonomyBlock(dataset), cardsBlock(dataset, retrievedIds)],
    user: shortlistUser(dataset, reader, needText),
    schema: shortlistSchema,
    effort: "medium",
    maxTokens: 4_000,
    // The same need and cards give the same candidates (M.9).
    temperature: 0,
  });
  const { droppedIds, notes, ...shortlist } = validateShortlist(result.parsed, retrievedIds, dataset);
  return { ...shortlist, stage: toStageLog("shortlist", result, { droppedIds, notes }) };
}
