import type { Route } from "@/lib/contracts";
import { redactPatterns } from "./checks";

/*
 * What POST /api/needs stores besides the text (FR-5.1, FR-5.2): the
 * summary never comes from the request body, which nobody screened. It is
 * the gate's neutral summary of the text as submitted (7.12), else the
 * route's summary when the text is still the route's own, else none.
 */

const MAX_SUMMARY = 300;

export function savedNeedSummary(gateSummary: string | null, route: Route | null, redactedText: string): string | null {
  const same = (a: string | null, b: string) => (a ?? "").replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
  const summary = gateSummary?.trim() || (route && same(route.input.problem_text, redactedText) ? route.need_summary_pl?.trim() : null) || null;
  return summary ? redactPatterns(summary).slice(0, MAX_SUMMARY) : null;
}
