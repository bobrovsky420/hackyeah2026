import { readFileSync } from "node:fs";
import path from "node:path";
import { parseYamlSubset, type YamlValue } from "@/lib/data/yaml";

/*
 * The output checks on the model's text (FR-12.10, 9.4 compose.md, 11 rule
 * 6): the banned words of data/safety/banned-words-pl.yaml, and the amounts
 * and dates the composer's texts must not carry (FR-8.5). A text that fails
 * is replaced by its template; the log names the check, never the text.
 */

export const BANNED_WORDS_FILE = "data/safety/banned-words-pl.yaml";

/** One entry: consecutive words, each an exact form or a prefix (written with a trailing *). */
type Entry = { word: string; prefix: boolean }[];

export interface BannedWords {
  categories: Map<string, Entry[]>;
}

export function parseBannedWords(source: string, file = BANNED_WORDS_FILE): BannedWords {
  const root = parseYamlSubset(source, file) as { categories?: Record<string, YamlValue> } | null;
  const categories = new Map<string, Entry[]>();
  for (const [name, list] of Object.entries(root?.categories ?? {})) {
    if (!Array.isArray(list)) throw new Error(`${file}: categories.${name} must be a list`);
    categories.set(
      name,
      list.map((item) =>
        String(item)
          .toLocaleLowerCase("pl")
          .split(/\s+/)
          .filter(Boolean)
          .map((word) => (word.endsWith("*") ? { word: word.slice(0, -1), prefix: true } : { word, prefix: false })),
      ),
    );
  }
  return { categories };
}

let loaded: BannedWords | undefined;

/** The list of the repository, read once per process. */
export function bannedWords(): BannedWords {
  loaded ??= parseBannedWords(readFileSync(path.join(process.cwd(), BANNED_WORDS_FILE), "utf8"));
  return loaded;
}

function wordsOf(text: string): string[] {
  return text.normalize("NFC").toLocaleLowerCase("pl").match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** The category of the first banned entry found in `text`, or null. */
export function findBanned(text: string, list: BannedWords = bannedWords()): string | null {
  const words = wordsOf(text);
  for (const [category, entries] of list.categories) {
    for (const entry of entries) {
      for (let start = 0; start + entry.length <= words.length; start++) {
        const hit = entry.every(({ word, prefix }, offset) =>
          prefix ? words[start + offset].startsWith(word) : words[start + offset] === word,
        );
        if (hit) return category;
      }
    }
  }
  return null;
}

/** Amounts ("5 000 zł", "20%", "600 tys."), dates ("30.09", "2026 r.") and month names: no model text carries them (FR-8.5, 9.4). A version such as "2.0" is not a date. */
const AMOUNT_OR_DATE =
  /\d[\d\s.,]*\s*(zł|złotych|pln|eur|euro|%|tys\b|mln\b)|\b([12]?\d|3[01])[./](0?[1-9]|1[0-2])\b|\b(19|20)\d{2}\b|\b(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\b/iu;

export function hasAmountOrDate(text: string): boolean {
  return AMOUNT_OR_DATE.test(text);
}

/** Why a model text cannot be shown, for the stage notes; null when it passes. */
export function rejectReason(text: string, list?: BannedWords): string | null {
  const category = findBanned(text, list);
  if (category) return `banned:${category}`;
  if (hasAmountOrDate(text)) return "amount-or-date";
  if (/https?:|www\.|@/i.test(text)) return "link-in-text";
  return null;
}
