import { fold } from "@/lib/text";

/*
 * The retriever's fallback when the embedding service is down (7.3): BM25
 * over the index cards (title, card line) and the record's keywords.
 * Polish-aware enough for a fallback: lowercase, diacritics folded ("ł" to
 * "l"), short function words dropped, and every word cut to a prefix of five
 * letters, so "seniorzy", "seniorów" and "seniorami" meet. Pure; the index
 * is built once per list of documents.
 */

const PREFIX = 5;
const K1 = 1.2;
const B = 0.75;

/** Function words that match everywhere, already folded. Words under three letters are dropped anyway. */
const STOPWORDS = new Set(
  (
    "ale albo ani bardzo bez beda byc byla bylo byly czy dla gdy gdzie ich jak jaki jakie jego jej jest jestem jestesmy juz " +
    "kiedy kto ktora ktore ktory ktorzy mamy mnie moze mozna nam nas nasz nasza nasze naszej naszych nie nic oraz przez przy " +
    "sie sobie tak takze tam tego tej ten teraz tez tych tylko tym wiec wszystko zeby lub oni ona one ono jako czyli coraz"
  ).split(" "),
);

/** Folded, stop words dropped, cut to the prefix. */
export function lexicalTerms(text: string): string[] {
  const terms: string[] = [];
  for (const word of fold(text).split(/[^a-z0-9]+/)) {
    if (word.length < 3 || STOPWORDS.has(word)) continue;
    terms.push(word.length > PREFIX ? word.slice(0, PREFIX) : word);
  }
  return terms;
}

export interface LexicalDocument {
  id: string;
  text: string;
}

export interface LexicalIndex {
  ids: string[];
  termFreqs: Map<string, number>[];
  lengths: number[];
  averageLength: number;
  documentFreq: Map<string, number>;
}

export function buildLexicalIndex(documents: LexicalDocument[]): LexicalIndex {
  const documentFreq = new Map<string, number>();
  const termFreqs = documents.map((document) => {
    const freqs = new Map<string, number>();
    for (const term of lexicalTerms(document.text)) freqs.set(term, (freqs.get(term) ?? 0) + 1);
    for (const term of freqs.keys()) documentFreq.set(term, (documentFreq.get(term) ?? 0) + 1);
    return freqs;
  });
  const lengths = termFreqs.map((freqs) => [...freqs.values()].reduce((sum, n) => sum + n, 0));
  const averageLength = lengths.reduce((sum, n) => sum + n, 0) / Math.max(1, lengths.length);
  return { ids: documents.map((document) => document.id), termFreqs, lengths, averageLength, documentFreq };
}

/** Every document id with its BM25 score for the query, best first; ties keep the index order. */
export function rankLexical(index: LexicalIndex, query: string): { id: string; score: number }[] {
  const terms = [...new Set(lexicalTerms(query))];
  const total = index.ids.length;
  const scored = index.ids.map((id, i) => {
    let score = 0;
    const freqs = index.termFreqs[i];
    for (const term of terms) {
      const tf = freqs.get(term);
      if (!tf) continue;
      const df = index.documentFreq.get(term) ?? 0;
      const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
      score += (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * index.lengths[i]) / (index.averageLength || 1)));
    }
    return { id, score, order: i };
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.map(({ id, score }) => ({ id, score }));
}
