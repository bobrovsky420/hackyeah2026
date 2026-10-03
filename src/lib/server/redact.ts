import { findPatternSpans } from "@/server/gate/patterns";
import { applySpans, REDACTED } from "@/server/gate/redaction";

/*
 * The deterministic redaction of FR-12.4 for texts that do not pass the
 * full gate (a content report's comment, the prototype's canned routes):
 * e-mail addresses, PESEL numbers with a valid checksum, phone numbers and
 * street addresses with a house number, found by the gate's patterns in
 * src/server/gate/patterns.ts. Names are left to the gate's model;
 * organisations and officials in their public role stay.
 */

export { REDACTED };

/** The text with personal data replaced, and how many fragments were removed. */
export function redact(text: string): { text: string; count: number } {
  const spans = findPatternSpans(text);
  return { text: applySpans(text, spans), count: spans.length };
}
