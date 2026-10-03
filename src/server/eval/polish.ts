import { findBanned, type BannedWords } from "@/server/route/safety";

/*
 * The Polish check of 13.2 on every string the model wrote into a route:
 * the banned words of data/curated/banned-words-pl.yaml (the composer's own
 * check, FR-12.10), no English fragments, no leaked field names or record
 * ids, and a language check. The language check is a heuristic without a
 * dependency: a text of six words or more must carry Polish function words
 * or Polish letters. It catches an English or a garbled answer, not a
 * stylistic slip; the Polish review of 13.5 stays with people.
 */

/** English function words that are not Polish words ("to", "a", "i", "on", "no", "we", "do", "by", "but", "was" are). */
const ENGLISH = new Set(
  "the and of is are were with for this that these those which would should could will from have has been not what your you their there it its an be or if they our can into about than then when where who how why please here".split(
    " ",
  ),
);

const POLISH = new Set(
  "i w we na z ze się nie do to że jest są o a dla lub oraz jak po przez od co czy być może który która które którzy tym tej ten ta te jej jego ich już tak ale bo gdy także tylko można przy pod nad bez u za".split(
    " ",
  ),
);

const POLISH_LETTERS = /[ąćęłńóśźż]/i;

export interface PolishIssue {
  field: string;
  /** "banned:<category>", "english", "identifier", "not-polish". */
  kind: string;
}

function wordsOf(text: string): string[] {
  return text.normalize("NFC").toLocaleLowerCase("pl").match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Why one generated text fails the Polish check; empty when it passes. */
export function polishIssues(text: string, list?: BannedWords): string[] {
  const issues: string[] = [];
  const banned = findBanned(text, list);
  if (banned) issues.push(`banned:${banned}`);
  const words = wordsOf(text);
  if (words.filter((word) => ENGLISH.has(word)).length >= 2) issues.push("english");
  if (/\b[a-z]+_[a-z_]+\b/.test(text) || /\binn-(nat|rops|partner)-/.test(text)) issues.push("identifier");
  if (words.length >= 6) {
    const polish = words.filter((word) => POLISH.has(word) || POLISH_LETTERS.test(word)).length;
    if (polish / words.length < 0.1) issues.push("not-polish");
  }
  return issues;
}

/** Every generated string of a route with its field, for the check and the report. */
export interface GeneratedString {
  field: string;
  text: string;
}

export function checkPolish(strings: GeneratedString[], list?: BannedWords): PolishIssue[] {
  return strings.flatMap(({ field, text }) => polishIssues(text, list).map((kind) => ({ field, kind })));
}
