import type { IndicatorKey } from "./map";
import type { ImplementationPath } from "./path";
import type { Route } from "./route";

/*
 * The incubator brief of FR-5.5 ("Fiszka potrzeby dla inkubatora") and its
 * stored form of 8.5, and the named clusters of the needs bank (FR-5.4).
 * The facts are assembled from data (src/lib/server/brief.ts); the prose
 * parts come from the prompt brief.md (src/server/needs/brief.ts) and are
 * null wherever the template stands.
 */

export interface BriefMatch {
  id: string;
  title: string;
  sourceUrl: string;
  fits: string[];
  lacks: string[];
}

/** The parts the model may write, in the order of FR-5.5. */
export type BriefProsePart = "title" | "problem" | "gap" | "direction";

export interface Brief {
  needId: string;
  generatedAt: string;
  title: string;
  problem: string;
  groups: string[];
  placeTerc: string | null;
  indicators: { key: IndicatorKey; value: number; year: number; median: number }[];
  matches: BriefMatch[];
  /** Other needs of the same category and gmina: the duplicate check of FR-5.3. */
  similarNeeds: { summary: string; createdAt: string }[];
  gaps: string[];
  implementerTypes: string[];
  partnersNearby: Route["people"]["implementers_nearby"];
  readinessCount: number;
  paths: ImplementationPath[];
  sources: { title: string; url: string }[];
  /** "Luka" as prose, shown above the gaps of the nearest matches; null: the list alone. */
  gapText: string | null;
  /** "Kierunek rozwiązania (hipoteza)"; null: the template brief.direction.text. */
  direction: string | null;
  /** The support lines of FR-12.10 when the need touches a sensitive topic, shown under the problem. */
  helplines: string | null;
  /**
   * The model's answer: the parts that passed the checks and the stage
   * notes of those that did not (never text). Null when no model answered
   * (a model error, or the fixtures), so the template stands entirely.
   */
  generation: { promptVersion: string; provider: string; model: string; parts: BriefProsePart[]; notes: string[] } | null;
}

/** The sections of 8.5, keyed in the order of FR-5.5 (the order of the IWS 2.0 application form). */
export const BRIEF_SECTION_KEYS = [
  "tytul-roboczy",
  "problem",
  "kogo-dotyczy-i-skala",
  "co-juz-istnieje",
  "luka",
  "kierunek-rozwiazania",
  "potencjalni-partnerzy",
  "mozliwe-sciezki",
  "zrodla",
  "stopka",
] as const;
export type BriefSectionKey = (typeof BRIEF_SECTION_KEYS)[number];

export interface BriefSection {
  key: BriefSectionKey;
  /** Null for the footer, which has no heading. */
  heading: string | null;
  /** The body in a small Markdown subset: paragraphs, "- " lists, "### " headings, _emphasis_, [links](url). */
  text: string;
}

/** The brief as stored (8.5): generated once per need, again only on the console's request. */
export interface StoredBrief {
  /** "br-" and the date, like the other ids. */
  id: string;
  need_id: string;
  generated_at: string;
  brief: Brief;
  sections: BriefSection[];
  markdown: string;
}

/** A named group of needs (FR-5.4); Need.cluster_id points to it. */
export interface NeedCluster {
  id: string;
  name_pl: string;
  created_at: string;
}
