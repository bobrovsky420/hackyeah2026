// generated from schemas/*.schema.json by scripts/build-data-types.mjs, do not edit

/**
 * What scripts/parse-catalogues.py writes to .local/pipeline/sources/<id>.json from the raw snapshots: source text verbatim, provenance, deterministic mappings. No model output. See docs/innovation-record.md.
 */
export interface SourceRecord {
  id: string;
  source: "baza-krajowa" | "rops-biblioteka" | "partner-rops";
  title: string;
  intro_pl: string | null;
  /**
   * @minItems 1
   */
  sources: {
    name: "baza-krajowa" | "rops-biblioteka" | "partner-rops";
    url: string | null;
    category_slug: string | null;
    retrieved_at: string;
    licence: "CC BY 4.0" | "MIIS-agreement";
    licence_url: string;
    raw_path: string;
    raw_sha256: string;
  }[];
  /**
   * Verbatim text per section of the entry; keys per docs/innovation-record.md; list items as lines starting with '- '
   */
  source_fields: {
    [k: string]: string;
  };
  tags: {
    advanced: {
      id: number;
      taxonomy: string;
      path: string;
      name: string;
      name_en?: string | null;
      [k: string]: unknown;
    }[];
    simple: {
      id: number;
      facet: string;
      name: string;
      [k: string]: unknown;
    }[];
  };
  /**
   * Deterministic mapping from the tags (national base) or the category (ROPS library); the worker must keep target_groups and implementer_types; settings and domain_hints are hints
   */
  mapped: {
    target_groups: string[];
    implementer_types: string[];
    character: string[];
    tools: string[];
    areas: string[];
    settings: ("rural" | "urban")[];
    domain_hints: string[];
  };
  innovator: {
    /**
     * Podmiot prawny, Osoba fizyczna, Grupa nieformalna (national base) or null
     */
    type: string | null;
    place_name: string | null;
    /**
     * Only when the innovator type is missing; for the human check
     */
    name_unclassified?: string;
  };
  organisation: {
    name: string;
    website: string | null;
    /**
     * Further organisations named among the authors
     */
    others?: string[];
  } | null;
  /**
   * Names exactly as the source publishes them; nothing else about a person is stored
   */
  persons_public: string[];
  /**
   * ROPS author lines the parser could not classify as an organisation or a person; a reviewer decides
   */
  authors_unclassified?: string[];
  /**
   * The source entry carries contact details; they are not copied (FR-1.9, R6)
   */
  contact_in_source: boolean;
  origin: {
    incubator_name: string | null;
    incubator_years: string | null;
    incubator_profile_url: string | null;
    programme: "POWER 4.1" | "FERS" | null;
    selected_for_dissemination: boolean | null;
    dissemination_label_pl: string | null;
    region: string | null;
    rops_incubated: boolean;
  };
  materials: {
    type: "pdf" | "doc" | "sheet" | "slides" | "zip" | "video" | "image" | "audio" | "link";
    title: string;
    url: string;
    licence: string | null;
    /**
     * Path of the downloaded copy under .local/raw, when the crawl fetched it
     */
    local_path: string | null;
    /**
     * e.g. dead-2026-09-28 for an empty download
     */
    status?: string;
  }[];
  links: {
    title: string;
    url: string;
  }[];
  /**
   * Plain text of the whole entry for matching and for grounding checks: title, intro and every source field with its Polish label
   */
  text_pl: string;
  /**
   * Parser doubts for the human check, e.g. authors-heuristic, unknown-label:<label>
   */
  review_flags: string[];
  /**
   * Hash of title, category and source fields; a derived record must repeat it
   */
  fingerprint: string;
  parser_version: string;
  parsed_at: string;
}

/**
 * What an extraction worker writes to .local/pipeline/derived/<id>.json. Closed lists (target_groups, domains, implementer_types, setting, scale, cost_band, time_to_implement, evidence_level) are enforced by scripts/derive-records.py from data/taxonomies.json, the single source of truth; word limits, grounding and personal-data rules are enforced there too. See docs/innovation-record.md.
 */
export interface DerivedRecord {
  id: string;
  prompt_version: string;
  /**
   * Model id of the worker, as given by the coordinator, e.g. claude-haiku-4-5
   */
  generated_by: string;
  generated_at: string;
  /**
   * Copied from the source record's 'fingerprint'; a mismatch marks the derived record stale
   */
  source_fingerprint: string;
  /**
   * What it is, for whom, how; at most 60 words
   */
  summary_pl: string;
  /**
   * The problem it answers; at most 60 words
   */
  problem_pl: string;
  /**
   * How it works, concretely; at most 60 words
   */
  mechanism_pl: string;
  /**
   * One line for the matching index; at most 30 words
   */
  index_card_pl: string;
  /**
   * @minItems 1
   * @maxItems 3
   */
  target_groups: string[];
  /**
   * @minItems 1
   * @maxItems 3
   */
  domains: string[];
  /**
   * @minItems 1
   * @maxItems 5
   */
  implementer_types: string[];
  setting: string;
  scale: string;
  cost_band: string;
  time_to_implement: string;
  evidence_level: string;
  /**
   * A town or gmina named in the source, copied verbatim; null when the source names none
   */
  origin_place_pl: string | null;
  /**
   * @minItems 1
   * @maxItems 6
   */
  requires_pl: string[];
  /**
   * @minItems 3
   * @maxItems 10
   */
  keywords_pl: string[];
  evidence: {
    problem_pl?: EvidenceItem;
    mechanism_pl?: EvidenceItem;
    cost_band: EvidenceItem;
    time_to_implement: EvidenceItem;
    evidence_level: EvidenceItem;
    setting: EvidenceItem;
    scale: EvidenceItem;
  };
  confidence: "high" | "medium" | "low";
  /**
   * Doubts for the reviewer; at most 40 words; null when none
   */
  notes_pl: string | null;
}
export interface EvidenceItem {
  /**
   * quote: the source states it (quote required); inference: judged from what the source describes; unknown: the source gives nothing
   */
  basis: "quote" | "inference" | "unknown";
  /**
   * Verbatim words from the source record's text_pl, at most 20 words; required when basis is quote
   */
  quote: string | null;
}
