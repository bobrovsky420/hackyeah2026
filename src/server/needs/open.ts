import type { Need } from "@/lib/contracts";
import { needSummary } from "./checks";

/*
 * The public view of the needs bank (FR-5.6, J8, GET /api/needs/open): only
 * needs whose reporter allowed anonymised publication and that a person at
 * ROPS approved in the moderation tab (pre-moderation, E6). The projection
 * is built field by field, so no reporter field, consent, note or the full
 * text can leak by being added to Need later.
 */

export interface OpenNeed {
  id: string;
  /** The day only, "2026-10-03". */
  date: string;
  place_terc: string | null;
  /** Target-group codes: the "category" of the list and its filter. */
  target_groups: string[];
  /** The stored summary, else the first sentence of the redacted text, with the gate's patterns applied once more. */
  summary_pl: string;
}

export interface OpenNeedsFilter {
  category?: string | null;
  terc?: string | null;
}

export function isPublishable(need: Need): boolean {
  return (
    need.consents.store &&
    need.consents.publish_anonymised &&
    need.moderation.status === "zatwierdzone" &&
    need.status !== "zamknieta"
  );
}

export function openNeeds(needs: Need[], filter: OpenNeedsFilter = {}): OpenNeed[] {
  return needs
    .filter(isPublishable)
    .filter((need) => !filter.category || need.target_groups.includes(filter.category))
    .filter((need) => !filter.terc || need.place_terc === filter.terc)
    .map((need) => ({
      id: need.id,
      date: need.created_at.slice(0, 10),
      place_terc: need.place_terc,
      target_groups: [...need.target_groups],
      summary_pl: needSummary(need),
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
