import type { RedactionType } from "@/lib/contracts";
import { LINK_SHARE_SPAM } from "./thresholds";

/*
 * The deterministic pattern checks of FR-12.1: PESEL numbers with a valid
 * checksum, phone numbers, e-mail addresses and street addresses with a
 * house number, each found as a span with offsets into the text as
 * submitted, and the share of the text taken by links. Names are left to
 * the model; organisations and officials in their public role stay.
 */

export interface Span {
  type: RedactionType;
  start: number;
  end: number;
}

export const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const ELEVEN_DIGITS = /(?<!\d)\d{11}(?!\d)/g;
// +48 or 0048, then 9 digits as 3-3-3, or a landline with its area code as 2-3-2-2 (optionally in brackets).
const PHONE = /(?<![\d+])(?:(?:\+|00)48[\s-]?)?(?:\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\d{3}[\s-]?\d{3}[\s-]?\d{3})(?!\d)/g;
// A street, avenue, estate or square, its capitalised name (up to four words) and a house number, optionally a flat.
const ADDRESS =
  /(?<!\p{L})(?:ul\.|ulic[ay]|al\.|alej[ai]|os\.|osiedl[eu]|pl\.|plac[u]?)\s*\p{Lu}[\p{L}.'-]*(?:\s+\p{Lu}[\p{L}.'-]*){0,3}\s+\d+[a-zA-Z]?(?:\s*\/\s*\d+[a-zA-Z]?)?/gu;
const LINK = /(?:https?:\/\/|www\.)[^\s<>"]+/gi;

const PESEL_WEIGHTS = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];

/** Eleven digits whose last one is the checksum of the other ten. */
export function isPesel(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false;
  const sum = PESEL_WEIGHTS.reduce((total, weight, index) => total + weight * Number(digits[index]), 0);
  return (10 - (sum % 10)) % 10 === Number(digits[10]);
}

function spansOf(text: string, pattern: RegExp, type: RedactionType, accept: (match: string) => boolean = () => true): Span[] {
  return [...text.matchAll(pattern)]
    .filter((match) => accept(match[0]))
    .map((match) => ({ type, start: match.index, end: match.index + match[0].length }));
}

/**
 * Keeps the first of overlapping spans in order of start (the longer one on
 * a tie), so a phone inside an address is removed once.
 */
export function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Span[] = [];
  for (const span of sorted) {
    const last = kept.at(-1);
    if (last && span.start < last.end) continue;
    kept.push(span);
  }
  return kept;
}

/** Every personal-data span the patterns find, without overlaps. */
export function findPatternSpans(text: string): Span[] {
  const emails = spansOf(text, EMAIL, "email");
  const pesels = spansOf(text, ELEVEN_DIGITS, "pesel", isPesel);
  const phones = spansOf(text, PHONE, "phone");
  const addresses = spansOf(text, ADDRESS, "address");
  // A phone pattern inside an e-mail address (digits before the @) is part of the e-mail.
  return mergeSpans([...emails, ...pesels, ...addresses, ...phones]);
}

/** True when links take at least LINK_SHARE_SPAM of the text's non-space characters. */
export function mostlyLinks(text: string): boolean {
  const total = text.replace(/\s/g, "").length;
  if (total === 0) return false;
  const linked = [...text.matchAll(LINK)].reduce((sum, match) => sum + match[0].length, 0);
  return linked > 0 && linked / total >= LINK_SHARE_SPAM;
}
