import type { TargetGroup } from "@/lib/data/types";
import type { Dataset } from "@/lib/data/to-contracts";
import type { Embed, StageLog } from "@/lib/contracts";
import { buildLexicalIndex, rankLexical, type LexicalIndex } from "./lexical";
import { RETRIEVE_K } from "./thresholds";

/*
 * The retriever of FR-3.7: the need, embedded as a query, against the unit
 * vectors of data/index-vectors.json (cosine is a dot product), the forty
 * nearest cards to stage 1. The target-group guard runs over the whole
 * ranking before the cut, so stage 1 still reads forty cards. A route never
 * fails here: when the service is unreachable, slow, serves another model
 * or answers nonsense, the lexical scorer of lexical.ts ranks instead and
 * the stage log says so.
 */

/**
 * Groups that are not a contradiction of each other: a need about seniors
 * may well be met by a card for people with limited mobility. Symmetric.
 * A card for `inne` never contradicts anything.
 */
const RELATED: Record<TargetGroup, TargetGroup[]> = {
  seniorzy: ["ograniczona-mobilnosc", "zdrowie", "niepelnosprawnosc-sensoryczna"],
  "dzieci-mlodziez-rodziny": ["spektrum-autyzmu", "niepelnosprawnosc-intelektualna", "zdrowie", "cudzoziemcy"],
  "ograniczona-mobilnosc": ["seniorzy", "zdrowie", "niepelnosprawnosc-sensoryczna", "niepelnosprawnosc-intelektualna", "rynek-pracy"],
  "niepelnosprawnosc-sensoryczna": ["seniorzy", "ograniczona-mobilnosc", "rynek-pracy"],
  zdrowie: ["seniorzy", "ograniczona-mobilnosc", "dzieci-mlodziez-rodziny", "spektrum-autyzmu", "niepelnosprawnosc-intelektualna", "bezdomnosc"],
  "rynek-pracy": ["cudzoziemcy", "bezdomnosc", "ograniczona-mobilnosc", "niepelnosprawnosc-sensoryczna", "niepelnosprawnosc-intelektualna", "spektrum-autyzmu"],
  cudzoziemcy: ["dzieci-mlodziez-rodziny", "rynek-pracy"],
  bezdomnosc: ["rynek-pracy", "zdrowie"],
  "niepelnosprawnosc-intelektualna": ["spektrum-autyzmu", "ograniczona-mobilnosc", "dzieci-mlodziez-rodziny", "rynek-pracy", "zdrowie"],
  "spektrum-autyzmu": ["niepelnosprawnosc-intelektualna", "dzieci-mlodziez-rodziny", "zdrowie", "rynek-pracy"],
  inne: [],
};

/**
 * True when a card's groups contradict the groups the reader gave (FR-2.3):
 * the reader named at least one group other than `inne`, and the card has
 * none of them, none related to them and not `inne`. A card without groups
 * is kept.
 */
export function contradictsReader(cardGroups: readonly string[], readerGroups: readonly string[]): boolean {
  const reader = readerGroups.filter((group): group is TargetGroup => group in RELATED && group !== "inne");
  if (reader.length === 0 || cardGroups.length === 0 || cardGroups.includes("inne")) return false;
  const allowed = new Set<string>(reader.flatMap((group) => [group, ...RELATED[group]]));
  return !cardGroups.some((group) => allowed.has(group));
}

// ------------------------------------------------------------ per dataset

interface VectorIndex {
  ids: string[];
  dims: number;
  matrix: Float32Array;
}

const vectorIndexes = new WeakMap<Dataset["raw"]["vectors"], VectorIndex>();
const lexicalIndexes = new WeakMap<Dataset["raw"]["indexCards"], LexicalIndex>();

function vectorIndex(dataset: Dataset): VectorIndex {
  const file = dataset.raw.vectors;
  let index = vectorIndexes.get(file);
  if (!index) {
    const ids = dataset.raw.indexCards.map((card) => card.id).filter((id) => file.vectors[id]);
    const matrix = new Float32Array(ids.length * file.dims);
    ids.forEach((id, row) => matrix.set(file.vectors[id], row * file.dims));
    index = { ids, dims: file.dims, matrix };
    vectorIndexes.set(file, index);
  }
  return index;
}

function lexicalIndex(dataset: Dataset): LexicalIndex {
  const cards = dataset.raw.indexCards;
  let index = lexicalIndexes.get(cards);
  if (!index) {
    const keywords = new Map(dataset.raw.records.map((record) => [record.id, record.derived.keywords_pl.join(" ")]));
    index = buildLexicalIndex(cards.map((card) => ({ id: card.id, text: `${card.title} ${card.card} ${keywords.get(card.id) ?? ""}` })));
    lexicalIndexes.set(cards, index);
  }
  return index;
}

function rankByVector(index: VectorIndex, query: number[]): string[] {
  const scores = index.ids.map((id, row) => {
    let dot = 0;
    const offset = row * index.dims;
    for (let i = 0; i < index.dims; i++) dot += index.matrix[offset + i] * query[i];
    return { id, dot, row };
  });
  scores.sort((a, b) => b.dot - a.dot || a.row - b.row);
  return scores.map((score) => score.id);
}

// ------------------------------------------------------------------ stage

export interface Retrieval {
  /** Nearest first, at most forty. */
  ids: string[];
  stage: StageLog;
}

export async function retrieve(
  query: { needText: string; targetGroups: string[] },
  dataset: Dataset,
  embed: Embed,
  now: () => number = Date.now,
): Promise<Retrieval> {
  const started = now();
  const notes: string[] = [];
  const file = dataset.raw.vectors;
  let ranking: string[] | null = null;
  let provider = "embedding-service";
  let model = file.model;

  const served = (embed as Partial<{ model: string }>).model;
  if (served !== undefined && served !== file.model) {
    notes.push(`retriever: lexical fallback (vectors built with ${file.model}, the client serves ${served})`);
  } else {
    try {
      const [vector] = await embed([query.needText], "query");
      if (!vector || vector.length !== file.dims) throw new Error(`a vector of ${vector?.length ?? 0} numbers, the index has ${file.dims}`);
      ranking = rankByVector(vectorIndex(dataset), vector);
    } catch (error) {
      // The message of our own client names no user text; another Embed's might, so only its kind is kept.
      const kind = (error as { kind?: string }).kind ?? (error as Error).name ?? "error";
      notes.push(`retriever: lexical fallback (${kind})`);
    }
  }
  if (!ranking) {
    // Cards that share no word with the need are noise, not candidates.
    ranking = rankLexical(lexicalIndex(dataset), query.needText)
      .filter((entry) => entry.score > 0)
      .map((entry) => entry.id);
    provider = "lexical";
    model = "bm25-prefix5";
  }

  const cardGroups = new Map(dataset.raw.indexCards.map((card) => [card.id, card.target_groups as string[]]));
  const dropped: string[] = [];
  const ids: string[] = [];
  for (const id of ranking) {
    if (ids.length >= RETRIEVE_K) break;
    if (contradictsReader(cardGroups.get(id) ?? [], query.targetGroups)) dropped.push(id);
    else ids.push(id);
  }
  if (provider === "lexical") notes.push(`lexical: ${ranking.length} cards share a word with the need`);
  if (dropped.length > 0) notes.push(`guard: ${dropped.length} cards dropped, target groups contradict the reader's`);

  return {
    ids,
    stage: {
      stage: "retrieve",
      provider,
      model,
      promptVersion: null,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      latencyMs: Math.round(now() - started),
      cached: false,
      droppedIds: dropped,
      droppedReasons: 0,
      notes,
    },
  };
}
