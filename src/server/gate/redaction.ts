import { fold } from "@/lib/text";
import type { Span } from "./patterns";

/*
 * Redaction of FR-12.4: the spans of the patterns and the person names the
 * model quoted are replaced with "[usunięto]". Names are located here, in
 * the text as submitted, because models count offsets badly; a name counts
 * only where it stands as whole words.
 */

export const REDACTED = "[usunięto]";

const LETTER = /[\p{L}\p{N}]/u;

/** Every place where one of the names stands as whole words, ignoring case and diacritics. */
export function locateNames(text: string, names: string[]): Span[] {
  // fold() keeps the length of Polish text (one letter in, one out), so offsets carry over.
  const folded = fold(text);
  if (folded.length !== text.length) return [];
  const spans: Span[] = [];
  for (const name of names) {
    const needle = fold(name.replace(/\s+/g, " ").trim());
    if (needle.length < 3) continue;
    for (let start = folded.indexOf(needle); start >= 0; start = folded.indexOf(needle, start + 1)) {
      const end = start + needle.length;
      if ((start > 0 && LETTER.test(folded[start - 1])) || (end < folded.length && LETTER.test(folded[end]))) continue;
      spans.push({ type: "person_name", start, end });
    }
  }
  return spans;
}

/** The text with each span (sorted, without overlaps) replaced by REDACTED. */
export function applySpans(text: string, spans: Span[]): string {
  let result = "";
  let cursor = 0;
  for (const span of spans) {
    result += text.slice(cursor, span.start) + REDACTED;
    cursor = span.end;
  }
  return result + text.slice(cursor);
}
