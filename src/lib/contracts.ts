import type { Dataset } from "@/lib/data/to-contracts";
import type { Llm } from "@/lib/llm/types";

/*
 * The one file of the shapes the server and the screens share: the codes
 * and records of the catalogue, the fixed contacts, the map data, the
 * paths, the stored records, the route (8.4), the brief (8.5), and at the
 * end the boundaries between the modules of the route pipeline. Types
 * only, apart from the section keys of the brief, so a client component
 * may import from here as freely as a server module.
 */

// ------------------------------------------------------------- catalogue

/*
 * Codes of the record contract (docs/innovation-record.md, data/curated/taxonomies.json)
 * and the parts of the built records and the place register the screens use.
 */

/** The two public catalogues and a partner hand-over from ROPS (FR-1.6). */
export type SourceName = "baza-krajowa" | "rops-biblioteka" | "partner-rops";
export type CostBand = "low" | "medium" | "high" | "unknown";
export type TimeToImplement = "days" | "weeks" | "months" | "year-plus" | "unknown";
export type EvidenceLevel =
  | "described"
  | "tested"
  | "selected-for-dissemination"
  | "implemented-elsewhere"
  | "in-regional-model";

/** The role asked on S1 (FR-2.1), with the codes of the test problems. */
export type RoleCode = "pracownik-instytucji" | "organizacja-spoleczna" | "mieszkaniec" | "urzad-gminy";

export interface Material {
  type: string;
  title: string;
  url: string;
}

/** A built innovation record (8.1): the fields the screens show. */
export interface Innovation {
  id: string;
  title: string;
  organisation: string | null;
  website: string | null;
  source: SourceName;
  /** Empty when the record has no web page (a partner spreadsheet row): then no source link. */
  sourceUrl: string;
  licence: string;
  retrievedAt: string | null;
  summary: string;
  problem: string;
  mechanism: string;
  requires: string[];
  targetGroups: string[];
  implementerTypes: string[];
  costBand: CostBand | null;
  timeToImplement: TimeToImplement | null;
  evidenceLevel: EvidenceLevel | null;
  originPlace: string | null;
  incubator: { name: string | null; years: string | null; programme: string | null };
  materials: Material[];
}

/** A town or village of Małopolska (GUS SIMC) that the place picker resolves to its gmina (FR-2.2). */
export interface Locality {
  simc: string;
  name: string;
  /** The TERC of its gmina: the only place passed on. */
  terc: string;
}

/** A gmina of the place register (8.9), with its area-weighted centroid as [lon, lat]. */
export interface Gmina {
  terc: string;
  name: string;
  powiat: string;
  kind: string;
  centroid: [number, number];
}

/** An implementation of an innovation in a gmina (8.6). */
export interface Implementation {
  id: string;
  innovation_id: string;
  place_terc: string;
  place_name: string | null;
  organisation: string | null;
  year: number | null;
  status: "running" | "completed" | "planned";
  source: string;
  source_url: string | null;
  note_pl: string | null;
}

// -------------------------------------------------------- fixed contacts

/*
 * The helplines of S10 and the crisis banner (FR-12.5, 12.6), and the ROPS
 * department named on the info pages and in the brief. Mapped from
 * data/curated/helplines.yaml and data/curated/advisors.yaml.
 */

export interface Helpline {
  id: string;
  /** As dialled, with spaces, e.g. "116 123". */
  number: string;
  /** The tel: link. */
  href: string;
  /** alarm: "Numery alarmowe"; support: "Pomoc i rozmowa" (FR-12.5). */
  group: "alarm" | "support";
  name: string;
  /** The name in a few words, for the one-line crisis banner of S2 (J10). */
  short: string;
  /** Which entry path of S10 lists the line first (FR-12.5). */
  forWhom: "self" | "someone" | "both";
  /** Verified opening hours; null until someone checked them. */
  hours: string | null;
  /** Who the line is for, one sentence; null when unknown. */
  whoFor: string | null;
}

export interface Department {
  name: string;
  email: string;
  /** As written, e.g. "+48 12 422 06 36 wew. 34". */
  phone: string;
  hours: string;
}

// -------------------------------------------------------------- map (S4)

/*
 * The map data of S4 (8.8, FR-7.1 to FR-7.4): the GUS indicators per gmina
 * and the gmina boundaries as the app serves them. src/lib/data/to-contracts.ts
 * maps data/built/indicators.json and data/built/map/malopolska-gminy.geojson onto these.
 */

export type IndicatorKey = "social-assistance" | "ageing" | "unemployment" | "civic-density";

/** One gmina's value of one indicator, with the year it comes from. */
export interface IndicatorValue {
  value: number;
  year: number;
  /** The BDL attribute symbol and its Polish text when the value is not plain; null otherwise. */
  flag: string | null;
  flagText: string | null;
}

/** An indicator over Małopolska; year, median, min and max are null when no gmina has a value. */
export interface IndicatorFacts {
  key: IndicatorKey;
  variable_id: number;
  year: number | null;
  gminas_with_value: number;
  median: number | null;
  min: number | null;
  max: number | null;
}

export interface IndicatorSet {
  source: { name: string; url: string; licence: string; retrieved_at: string };
  indicators: IndicatorFacts[];
  /** The need indicators per target group, "default" for every other group (8.8). */
  needByTargetGroup: Record<string, IndicatorKey[]> & { default: IndicatorKey[] };
  /** Keyed by the seven-digit TERC; a gmina without data (Szczawa, 1207132) has no entry or an empty one. */
  values: Record<string, Partial<Record<IndicatorKey, IndicatorValue>>>;
}

/** The properties of a boundary feature; the map reads `terc` (FR-7.1). */
export interface GminaBoundaryProperties {
  terc: string;
  name: string;
  powiat: string;
  kind: string;
}

export type BoundaryGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

/** The gminas of Małopolska as GeoJSON, keyed by the seven-digit TERC. */
export interface GminaBoundaries {
  type: "FeatureCollection";
  features: { type: "Feature"; properties: GminaBoundaryProperties; geometry: BoundaryGeometry }[];
}

// ------------------------------------------------------------- paths (8.7)

/** A legal or funding path, schema 8.7 (one YAML file per path in data/built/paths/). */
export interface ImplementationPath {
  id: string;
  name_pl: string;
  legal_basis_pl: string;
  applicant_types: string[];
  amount_note_pl: string;
  timing: { kind: "rolling" | "fixed" | "resolution" | "none-open"; note_pl: string };
  decision_maker_pl: string;
  steps_pl: string[];
  source_url: string;
  verified_on: string;
  reviewer: string | null;
  /** Carries the prototype note of FR-1.8 (FR-8.1). */
  notes_pl: string;
}

// -------------------------------------------------------- stored records

/*
 * What the forms store: the need (8.5), the contact request, the readiness
 * registration and the feedback (8.6). The status, moderation and `note_pl`
 * fields are kept for the ROPS console of the roadmap (S7, not built);
 * `example` marks seed entries. The records are kept by the repository of
 * src/server/db/.
 */

export type ModerationStatus = "do-weryfikacji" | "zatwierdzone" | "odrzucone";

export interface Moderation {
  status: ModerationStatus;
  reviewer: string | null;
  decided_at: string | null;
  reason_pl: string | null;
}

export interface Consent {
  text_version: string;
  timestamp: string;
}

/** The statuses of FR-5.7. */
export type NeedStatus = "nowa" | "w-analizie" | "dopasowano-pozniej" | "temat-naboru" | "zamknieta";

export interface Need {
  id: string;
  created_at: string;
  route_id: string | null;
  problem_text: string;
  summary_pl: string | null;
  place_terc: string | null;
  role: RoleCode | null;
  target_groups: string[];
  domains: string[];
  reporter: { name: string | null; organisation: string | null; email: string | null };
  consents: { store: boolean; publish_anonymised: boolean; contact: boolean } & Consent;
  status: NeedStatus;
  moderation: Moderation;
  cluster_id: string | null;
  nearest_matches: { innovation_id: string; fit_score: number; what_fits_pl: string; what_lacks_pl: string }[];
  brief_id: string | null;
  note_pl: string | null;
  example: boolean;
}

export type ContactStatus = "nowe" | "przekazane" | "zamkniete";

export interface ContactRequest {
  id: string;
  created_at: string;
  route_id: string | null;
  need_id: string | null;
  target: { type: "innovation" | "organisation" | "advisor" | "gmina"; id: string };
  requester: { name: string; organisation: string | null; email: string };
  message: string;
  screening: { outcome: "need" };
  consent: Consent;
  moderation: Moderation;
  status: ContactStatus;
  note_pl: string | null;
}

export type VerificationStatus = "niezweryfikowane" | "zweryfikowane" | "odrzucone";

export interface Readiness {
  id: string;
  created_at: string;
  display_name: string;
  is_organisation: boolean;
  place_terc: string | null;
  topics: string[];
  channel: { type: "email" | "phone"; value: string };
  consent_display_name: boolean;
  consent: Consent;
  verification: { status: VerificationStatus; reviewer: string | null; decided_at: string | null };
  retention_until: string;
  note_pl: string | null;
  /** A seed entry of the team (FR-6.5); absent on real registrations. */
  example?: boolean;
}

export type FeedbackValue = "tak" | "czesciowo" | "nie";

export interface Feedback {
  route_id: string;
  value: FeedbackValue;
  comment: string | null;
  created_at: string;
}

export type ReportReason = "nieprawdziwe" | "obrazliwe" | "dane_osobowe" | "inne";

/** "Zgłoś problem z tą treścią" (FR-12.9, 8.11): no identity of the reporter is stored. */
export interface ContentReport {
  id: string;
  created_at: string;
  target: { type: "route" | "brief" | "innovation" | "need"; id: string };
  reason: ReportReason;
  comment: string | null;
  moderation: Moderation;
}

/** Every moderation action is logged with the reviewer's token name (FR-12.8). */
export interface ModerationLogEntry {
  ts: string;
  reviewer: string;
  target_type: "need" | "contact" | "readiness" | "declined" | "report";
  target_id: string;
  action: "zatwierdzone" | "odrzucone" | "zweryfikowane" | "przejrzane" | "status";
  /** The new status code of a "status" action; null for decisions. */
  status: string | null;
  reason_pl: string | null;
  note_pl: string | null;
}

// -------------------------------------------------------------- route (8.4)

/*
 * The route as the pipeline returns and stores it: schema 8.4 of the
 * specification. Five fields the screens need are proposed additions to
 * 8.4, marked below.
 */

/** Matching modes (FR-3.3) and the screening outcomes that replace a route (8.10). */
export type RouteMode = "route" | "partial" | "none" | "redirected" | "declined" | "off_topic";

/** The sensitive topics of the screening (8.10). */
export type SensitiveTopic = "suicide" | "self_harm" | "violence" | "child_abuse" | "sexual_violence" | "addiction";

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
    sensitive_topics: SensitiveTopic[];
    redactions: number;
    crisis_banner: boolean;
  };
  /**
   * Proposed addition to 8.4: stage 1 found neither a target group nor a
   * place, so S3 asks the one question of FR-2.3.
   */
  clarification_needed: boolean;
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

// -------------------------------------------------------------- brief (8.5)

/*
 * The incubator brief of FR-5.5 ("Fiszka potrzeby dla inkubatora") and its
 * stored form of 8.5, and the named clusters of the needs bank (FR-5.4).
 * The facts are assembled from data (src/server/needs/brief-template.ts);
 * the prose parts come from the prompt brief.md (src/server/needs/brief.ts)
 * and are null wherever the template stands.
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

/** The brief as stored (8.5): generated once per need and returned as stored after that. */
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

// ------------------------------------------------- the pipeline's modules

/*
 * The boundaries between the modules of the route pipeline (specification
 * 7.12, 7.3, 7.4): the gate screens and redacts, the matcher retrieves,
 * shortlists and assesses, the composer assembles the route of 8.4, and
 * src/server/pipeline.ts runs them in that order with the replay cache.
 * Each module depends on these types only, never on another module's
 * internals, so they can be built and tested apart.
 */

/** Per stage, for the request log and the counters (FR-3.6). */
export interface StageLog {
  stage: "screen" | "retrieve" | "shortlist" | "assess" | "compose" | "brief";
  provider: string;
  model: string;
  promptVersion: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  latencyMs: number;
  cached: boolean;
  /** Ids the grounding validation dropped (FR-3.4), unknown ids included. */
  droppedIds: string[];
  /** Reasons dropped because their quote was not found in the record. */
  droppedReasons: number;
  /** Free notes, e.g. "retriever: lexical fallback". Never user text. */
  notes: string[];
}

// gate (7.12)

export type ScreeningCategory = "need" | "crisis" | "individual_case" | "harm" | "off_topic" | "spam";
export type ScreeningOutcome = "need" | "redirected" | "declined" | "off_topic";
export type RedactionType = "pesel" | "phone" | "email" | "address" | "person_name";

/** Schema 8.10. Offsets refer to the text as submitted. */
export interface ScreeningResult {
  category: ScreeningCategory;
  confidence: number;
  individual_case: boolean;
  sensitive_topics: SensitiveTopic[];
  redactions: { type: RedactionType; start: number; end: number }[];
  need_summary_pl: string | null;
  outcome: ScreeningOutcome;
  crisis_banner: boolean;
  /** e.g. "pattern:phone", "lexicon:samobój", "model:crisis>=0.6". */
  rules_fired: string[];
  prompt_version: string | null;
}

/** Which submitted text the gate screens (7.12, first paragraph). */
export type GateTextKind = "need" | "saved_need" | "contact" | "readiness" | "offer";

export interface GateInput {
  text: string;
  kind: GateTextKind;
  /** The gmina's name, the only context the model sees (FR-12.2). */
  placeName: string | null;
}

export interface GateOutput {
  screening: ScreeningResult;
  /** The text with every redaction replaced by "[usunięto]"; the original is discarded (FR-12.4). */
  redactedText: string;
  redactionCount: number;
  /** Null when the deterministic checks decided without a model call. */
  stage: StageLog | null;
}

export type ScreenText = (input: GateInput, deps: { llm: Llm }) => Promise<GateOutput>;

// matcher (7.3)

export interface MatchInput {
  /** Redacted by the gate; wrapped in <potrzeba> tags inside prompts. */
  needText: string;
  /** The gate's neutral summary, if it wrote one. */
  needSummary: string | null;
  placeTerc: string | null;
  role: RoleCode | null;
  /** Given by the reader (FR-2.3); empty when not asked or not answered. */
  targetGroups: string[];
}

/** Stage 1 (8.3), after validation: only known ids, at most 8; a nearest card the server added (M.9) has fit 0 and no reason. */
export interface ShortlistCandidate {
  id: string;
  prelim_fit: number;
  reason_pl: string;
}

/** Stage 2 (8.3), after the grounding validation of FR-3.4. */
export interface Assessment {
  id: string;
  fit_score: number;
  /** `field` names a field of the record; `quote` was found in it (fuzzy ratio at least 0.8). */
  fit_reasons: { field: string; quote: string; why_pl: string }[];
  gaps_pl: string[];
  adaptation_note_pl: string | null;
}

export type MatchMode = "route" | "partial" | "none";

export interface MatchResult {
  /** From the thresholds of FR-3.3 applied to the best validated fit, not taken from the model. */
  mode: MatchMode;
  mode_reason_pl: string | null;
  need_summary_pl: string | null;
  detected_target_groups: string[];
  detected_domains: string[];
  /** The ids the retriever handed to stage 1, nearest first (FR-3.7). */
  retrieved_ids: string[];
  candidates: ShortlistCandidate[];
  /** Every validated assessment, best first. */
  assessments: Assessment[];
  /** At most 3, a subset of the assessed ids, best first. */
  top_ids: string[];
  /** FR-2.3: stage 1 found neither a target group nor a place, and the reader gave none. */
  clarification_needed: boolean;
  stages: StageLog[];
}

/** Embeds texts with the model of FR-3.7; unit-length vectors. */
export type Embed = (texts: string[], kind: "query" | "passage") => Promise<number[][]>;

export type MatchNeed = (input: MatchInput, deps: { llm: Llm; dataset: Dataset; embed: Embed }) => Promise<MatchResult>;

// composer (7.4)

export interface ComposeInput {
  routeId: string;
  createdAt: string;
  /** As stored: the redacted text, the place, the role, the target groups. */
  input: Route["input"];
  gate: GateOutput;
  match: MatchResult;
}

/**
 * Assembles schema 8.4 from data; the model writes only the summary
 * paragraph and the three next steps (FR-4.1). A compose failure leaves
 * those blank and the route still renders. `readiness` is the readiness
 * registry as the repository holds it (FR-6.5); the composer only counts
 * and names from it and never reads the store itself.
 */
export type ComposeRoute = (
  input: ComposeInput,
  deps: { llm: Llm; dataset: Dataset; today: string; readiness: Readiness[] },
) => Promise<{ route: Route; stage: StageLog | null }>;
