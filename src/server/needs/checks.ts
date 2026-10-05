import { findPatternSpans, mergeSpans } from "@/server/gate/patterns";
import { applySpans } from "@/server/gate/redaction";
import { rejectReason, type BannedWords } from "@/server/route/safety";

/*
 * The output checks on the model's prose in the needs bank (9.4 brief.md
 * and cluster.md, FR-12.10, 11 rule 6): the composer's checks of
 * src/server/route/safety.ts (banned words, amounts and dates, links), plus
 * two the brief needs because it is longer free text: no proper name and
 * no number that the input did not carry (no names of people, no invented
 * facts). A text that fails is replaced by its template; the stage notes
 * name the check, never the text.
 */

/**
 * Words written with a capital inside a sentence that are never a new name:
 * the institutions and region the product itself names, and the kinds of
 * local institution every gmina has (OSP, KGW, GOPS and the like).
 */
const ALLOWED_NAMES = [
  "rops",
  "ops",
  "gops",
  "mops",
  "osp",
  "kgw",
  "dps",
  "śds",
  "cus",
  "pcpr",
  "gus",
  "małopolska",
  "małopolski",
  "małopolsce",
  "małopolskę",
  "polska",
  "polski",
  "polsce",
  "polskę",
  "kraków",
  "krakowie",
  "inkubator",
  "inkubatora",
  "włączenia",
  "społecznego",
  "dział",
  "działu",
  "innowacji",
  "społecznych",
];

/** The texts a model answer may draw on, prepared once per call for the name and number checks. */
export interface KnownText {
  words: string[];
  numbers: Set<string>;
}

/** The capitalised forms of address of the singular "Ty" (rule 11), which the name check would read as new names. */
export const SINGULAR_ADDRESS = "Ty Ciebie Cię Tobie Tobą Twój Twoja Twoje Twojego Twojej Twoim Twoją Twoich Twoimi Twym Twą";

export function knownText(...texts: (string | null | undefined)[]): KnownText {
  const joined = texts.filter(Boolean).join(" ").normalize("NFC");
  const words = [...new Set(joined.toLocaleLowerCase("pl").match(/\p{L}+/gu) ?? [])];
  return { words, numbers: new Set(joined.match(/\d+/g) ?? []) };
}

function commonPrefix(a: string, b: string): number {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length += 1;
  return length;
}

/**
 * A word the input names in some inflected form: "Zakliczynie" matches
 * "Zakliczyn", "Krakowie" matches "Kraków" (the shared stem is at least the
 * shorter word less three letters, and at least four letters).
 */
function isKnownWord(word: string, known: KnownText): boolean {
  const lower = word.toLocaleLowerCase("pl");
  if (ALLOWED_NAMES.includes(lower)) return true;
  return known.words.some((candidate) => {
    const shorter = Math.min(candidate.length, lower.length);
    const needed = Math.min(shorter, Math.max(4, shorter - 3));
    return commonPrefix(candidate, lower) >= needed;
  });
}

/**
 * The capitalised words inside a sentence that the input does not carry:
 * new names of people, organisations or places. A sentence's first word,
 * even after an opening quote or bracket, is not a name by its capital.
 */
export function unknownNames(text: string, known: KnownText): string[] {
  const found: string[] = [];
  const normalised = text.normalize("NFC");
  for (const match of normalised.matchAll(/\p{Lu}[\p{L}-]*/gu)) {
    const before = normalised.slice(0, match.index).replace(/[\s„"'«»(\[\p{Pd}]+$/u, "");
    if (before === "" || /[.!?:;\n]$/.test(before)) continue;
    const word = match[0].replace(/-+$/, "");
    if (!isKnownWord(word, known)) found.push(word);
  }
  return found;
}

/** Numbers written with digits that the input does not carry. */
export function unknownNumbers(text: string, known: KnownText): string[] {
  return (text.match(/\d+/g) ?? []).filter((number) => !known.numbers.has(number));
}

export function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export interface ProseLimits {
  min: number;
  max: number;
}

/** Why a model text cannot be used, for the stage notes; null when it passes. */
export function proseProblem(text: string, limits: ProseLimits, known: KnownText, banned?: BannedWords): string | null {
  if (text.length < limits.min) return "too-short";
  if (text.length > limits.max) return "too-long";
  const reason = rejectReason(text, banned);
  if (reason) return reason;
  if (/!/.test(text)) return "exclamation";
  if (unknownNumbers(text, known).length > 0) return "new-number";
  if (unknownNames(text, known).length > 0) return "new-name";
  return null;
}

/** The deterministic redaction of the gate (e-mail, phone, PESEL, address), again, on text that goes into a prompt or onto a public list. */
export function redactPatterns(text: string): string {
  return applySpans(text, mergeSpans(findPatternSpans(text)));
}

/** A need's summary for a prompt or a list: the stored summary, else the first sentence of the redacted text, at most `max` characters. */
export function needSummary(need: { summary_pl: string | null; problem_text: string }, max = 300): string {
  const source = clean(need.summary_pl ?? need.problem_text.split(/(?<=[.!?])\s/)[0] ?? need.problem_text);
  const text = redactPatterns(source);
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
