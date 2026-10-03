import { MAX_QUOTE_WORDS, QUOTE_MIN_RATIO } from "./thresholds";

/*
 * The quote check of FR-3.4: a quote counts as found in a field when its
 * normalised text reaches a fuzzy ratio of 0.8 against the best window of
 * the field. Normalised means NFKC, lowercase, quotes and punctuation
 * gone, whitespace unified: the text is reduced to its words. The ratio is
 * a character-level Levenshtein ratio (1 - distance / longer length) over
 * windows of the field's words, so a typo or a changed ending passes and
 * a paraphrase does not. Pure functions, no I/O.
 */

interface Token {
  /** Lowercased, NFKC. */
  text: string;
  start: number;
  end: number;
}

const WORD = /[\p{L}\p{N}]+/gu;

/** The words of a text with their offsets in the NFKC form of the text. */
function tokenize(text: string): { source: string; tokens: Token[] } {
  const source = text.normalize("NFKC");
  const tokens: Token[] = [];
  for (const match of source.matchAll(WORD)) {
    const start = match.index ?? 0;
    tokens.push({ text: match[0].toLocaleLowerCase("pl-PL"), start, end: start + match[0].length });
  }
  return { source, tokens };
}

/** Lowercase, NFKC, quotes and punctuation removed, one space between words. */
export function normaliseText(text: string): string {
  return tokenize(text)
    .tokens.map((token) => token.text)
    .join(" ");
}

/** Edit distance with insertions, deletions and substitutions of one character each. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = new Array<number>(b.length + 1);
  let current = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) previous[j] = j;
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    [previous, current] = [current, previous];
  }
  return previous[b.length];
}

/** 1 for equal strings, 0 for nothing in common; two empty strings are equal. */
export function similarity(a: string, b: string): number {
  const longer = Math.max(a.length, b.length);
  return longer === 0 ? 1 : 1 - levenshtein(a, b) / longer;
}

export interface QuoteMatch {
  ratio: number;
  /** The best window of the field as it stands in the record, whitespace collapsed; null when nothing overlaps. */
  text: string | null;
}

/**
 * The best window of `field` for `quote`: windows of the quote's word count
 * plus or minus two, compared character by character after normalisation.
 * Windows that share fewer than half of the quote's words are skipped, which
 * keeps the check fast and loses nothing a ratio of 0.8 would pass.
 */
export function bestQuoteMatch(quote: string, field: string): QuoteMatch {
  const wanted = tokenize(quote).tokens.map((token) => token.text);
  const { source, tokens } = tokenize(field);
  if (wanted.length === 0 || tokens.length === 0) return { ratio: 0, text: null };
  const target = wanted.join(" ");
  const wantedSet = new Map<string, number>();
  for (const word of wanted) wantedSet.set(word, (wantedSet.get(word) ?? 0) + 1);
  const minOverlap = Math.ceil(wanted.length / 2);

  let best: QuoteMatch = { ratio: 0, text: null };
  const smallest = Math.max(1, wanted.length - 2);
  const largest = Math.min(tokens.length, wanted.length + 2);
  for (let size = smallest; size <= largest; size++) {
    for (let start = 0; start + size <= tokens.length; start++) {
      const window = tokens.slice(start, start + size);
      const left = new Map(wantedSet);
      let overlap = 0;
      for (const token of window) {
        const count = left.get(token.text) ?? 0;
        if (count > 0) {
          overlap += 1;
          left.set(token.text, count - 1);
        }
      }
      if (overlap < minOverlap) continue;
      const ratio = similarity(target, window.map((token) => token.text).join(" "));
      if (ratio > best.ratio) {
        const text = source.slice(window[0].start, window[window.length - 1].end).replace(/\s+/g, " ");
        best = { ratio, text };
        if (ratio === 1) return best;
      }
    }
  }
  return best;
}

/** Words as a reader counts them: runs of non-space characters. */
export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export type QuoteVerdict =
  | { ok: true; ratio: number; quote: string }
  | { ok: false; reason: "empty" | "too_long" | "not_found"; ratio: number };

/**
 * FR-3.4 for one reason: at least two and at most 15 words, found in the
 * field at a ratio of at least 0.8. The quote that is kept is the window of
 * the record itself, so the reader sees the source's words, not the
 * model's copy of them (unless that window would be longer than 15 words).
 */
export function checkQuote(quote: string, field: string): QuoteVerdict {
  const words = wordCount(quote);
  if (tokenize(quote).tokens.length < 2) return { ok: false, reason: "empty", ratio: 0 };
  if (words > MAX_QUOTE_WORDS) return { ok: false, reason: "too_long", ratio: 0 };
  const match = bestQuoteMatch(quote, field);
  if (match.ratio < QUOTE_MIN_RATIO || match.text === null) return { ok: false, reason: "not_found", ratio: match.ratio };
  const kept = wordCount(match.text) <= MAX_QUOTE_WORDS ? match.text : quote.trim().replace(/\s+/g, " ");
  return { ok: true, ratio: match.ratio, quote: kept };
}
