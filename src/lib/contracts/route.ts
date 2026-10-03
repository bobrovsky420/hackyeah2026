import type { CostBand, EvidenceLevel, RoleCode, TimeToImplement } from "./catalogue";

/*
 * The route as the pipeline returns and stores it: schema 8.4 of the
 * specification. Four fields the screens need are proposed additions to
 * 8.4, marked below.
 */

/** Matching modes (FR-3.3) and the screening outcomes that replace a route (8.10). */
export type RouteMode = "route" | "partial" | "none" | "redirected" | "declined" | "off_topic";

export interface Channel {
  type: "www" | "email" | "phone";
  value: string;
}

/** A reason of the stage 2 assessment (8.3): a quote of at most 15 words from a named field of the record. */
export interface FitReason {
  field: string;
  quote: string;
  why_pl: string;
}

export interface RouteSolution {
  innovation_id: string;
  fit_score: number;
  fit_label_pl: string;
  fit_reasons: FitReason[];
  gaps_pl: string[];
  adaptation_note_pl: string | null;
  what_it_takes: {
    implementer_types: string[];
    cost_band: CostBand;
    time_to_implement: TimeToImplement;
    evidence_level: EvidenceLevel;
  };
  where_it_runs: { count: number; nearest: { terc: string; name: string; distance_km: number }[] };
  materials: { title: string; url: string; type: string }[];
  contact: { organisation: string | null; channels: Channel[] };
}

export interface Route {
  id: string;
  created_at: string;
  input: {
    problem_text: string | null;
    place_terc: string | null;
    place_name: string | null;
    role: RoleCode | null;
    target_groups: string[];
  };
  mode: RouteMode;
  /** Proposed addition to 8.4: the need summary of stage 1 (8.3), the heading of S2. */
  need_summary_pl: string | null;
  /** Proposed addition to 8.4: the mode reason of stage 2 (8.3), shown on S3. */
  mode_reason_pl: string | null;
  screening: {
    category: string;
    confidence: number;
    sensitive_topics: string[];
    redactions: number;
    crisis_banner: boolean;
  };
  summary_pl: string | null;
  solutions: RouteSolution[];
  knowledge: { title: string; url: string; type: string; for_innovation_id: string | null }[];
  people: {
    /** `innovation_id` is a proposed addition to 8.4, so "Poproś o kontakt" knows its target. */
    innovators: { organisation: string; channels: Channel[]; persons_public: string[]; innovation_id: string }[];
    implementers_nearby: { organisation: string; place_name: string; distance_km: number; innovation_id: string }[];
    advisor: { category: string; name: string | null; role: string; email: string; phone: string };
    readiness: { count: number; names_with_consent: string[] };
  };
  path: { applicant_type: string; cost_band: CostBand; paths: { path_id: string; why_pl: string }[] };
  next_steps: { text_pl: string; link: string }[];
  unknowns_pl: string[];
  engine: {
    provider: string;
    model: string;
    prompt_version: string;
    data_version: string;
    latency_ms: number;
    cached: boolean;
  };
  label_pl: string;
  /** Proposed addition to 8.4: the reference code S11 shows for a declined request. */
  reference_code: string | null;
}
