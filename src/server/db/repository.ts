import type {
  ContactRequest,
  ContactStatus,
  ContentReport,
  Feedback,
  Moderation,
  ModerationLogEntry,
  ModerationStatus,
  Need,
  NeedStatus,
  Readiness,
  VerificationStatus,
} from "@/lib/contracts/records";
import type { NeedCluster, StoredBrief } from "@/lib/contracts/brief";
import type { Route } from "@/lib/contracts/route";
import type { GateTextKind, ScreeningCategory, ScreeningOutcome } from "@/server/contracts";
import type { SensitiveTopic } from "@/lib/contracts/route";

/*
 * Everything the app keeps between requests, behind one async interface:
 * the memory store (memory.ts), which file.ts loads from and saves to one
 * JSON file (docs/storage.md); src/server/db/index.ts opens it. Lists come
 * newest first. Every record handed out is a copy: changing it changes
 * nothing stored.
 */

/** One entry of the screening log (FR-12.7); see src/server/gate/log.ts. */
export interface ScreeningLogEntry {
  at: string;
  kind: GateTextKind;
  category: ScreeningCategory;
  confidence: number;
  outcome: ScreeningOutcome;
  sensitive_topics: SensitiveTopic[];
  redaction_count: number;
  rules_fired: string[];
  prompt_version: string | null;
  /** sha256 of the text as submitted, hex. */
  text_sha256: string;
  /** The redacted text, for `declined` and spam only, until text_until. */
  text: string | null;
  text_until: string | null;
  /** The stored record the text belongs to, when there is one: the route id of a declined request. */
  ref: string | null;
}

/** A screening-log entry as the repository gives it back. */
export interface StoredScreeningLogEntry extends ScreeningLogEntry {
  /** "sl-" and the entry's sequence number, for the declined-texts review (FR-12.8). */
  id: string;
  /** Set once a reviewer looked at the kept text. */
  reviewed_at: string | null;
}

/** What the statistics of FR-9.3 need of a stored route, without the route itself. */
export interface RouteFacts {
  id: string;
  created_at: string;
  mode: Route["mode"];
  place_terc: string | null;
  latency_ms: number;
  cached: boolean;
  /** The recommended innovations, in the route's order. */
  solution_ids: string[];
}

/**
 * The cut-offs of one retention run (12.6, OP-18), computed by
 * src/server/retention.ts. Each rule deletes what lies before its cut-off.
 */
export interface RetentionCutoffs {
  /** Routes created before this instant go, with their feedback; null keeps every route. */
  routesBefore: string | null;
  /** Contact requests created before this instant go. */
  contactsBefore: string;
  /** Readiness registrations whose retention_until (YYYY-MM-DD) is before this day go. */
  readinessBefore: string;
  /** The screening log as of this instant: entries past 14 days go, texts past text_until are cleared. */
  screeningAt: string;
}

/** How many records a retention run deleted, or would delete in a dry run. */
export interface RetentionCounts {
  routes: number;
  feedback: number;
  contacts: number;
  readiness: number;
  screeningEntries: number;
  screeningTexts: number;
}

/** Logs go after 14 days (12.6). */
export const SCREENING_LOG_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * A place filter of the console: the gminas whose label matched the typed
 * text; `null` in the list stands for the entries without a gmina.
 */
export type PlaceFilter = (string | null)[];

export interface NeedFilter {
  status?: NeedStatus;
  moderation?: ModerationStatus;
  /** Only the needs whose author allowed publication (the moderation queue, FR-5.6). */
  publishable?: boolean;
  /** A target group code (FR-9.2 "kategoria"). */
  category?: string;
  places?: PlaceFilter;
}

export interface ContactFilter {
  status?: ContactStatus;
  moderation?: ModerationStatus;
}

export interface ReadinessFilter {
  status?: VerificationStatus;
  places?: PlaceFilter;
}

export interface ReportFilter {
  moderation?: ModerationStatus;
}

export interface Counters {
  /** Since when the counters count: the store's first start. */
  since: string;
  counts: Record<string, number>;
}

export interface Repository {
  readonly kind: "memory" | "file";

  // Routes (8.4), kept for the permalink.
  /** Stores a new route; a `redirected` route loses the reader's text first (FR-2.5). */
  saveRoute(route: Route): Promise<void>;
  getRoute(id: string): Promise<Route | undefined>;
  /** The declined-texts queue of FR-12.8: stored `declined` routes nobody reviewed yet. */
  listDeclinedForReview(): Promise<Route[]>;
  /** Marks a stored declined route as reviewed; false when it is unknown or was reviewed already. */
  markDeclineReviewed(id: string, at: string): Promise<boolean>;
  /** The facts of every stored route for the statistics (FR-9.3), newest first. */
  listRouteFacts(): Promise<RouteFacts[]>;

  // Needs (8.5).
  addNeed(need: Need): Promise<void>;
  getNeed(id: string): Promise<Need | undefined>;
  listNeeds(filter?: NeedFilter): Promise<Need[]>;
  /** Needs per gmina TERC, for the map (FR-7.2). */
  needCountsByPlace(): Promise<Map<string, number>>;
  /** Decides a need that still waits for moderation; undefined when it is unknown or decided already. */
  decideNeed(id: string, moderation: Moderation): Promise<Need | undefined>;
  updateNeed(id: string, change: { status: NeedStatus; note_pl: string | null }): Promise<Need | undefined>;
  /** The duplicate check of FR-5.3, stored once computed. */
  setNearestMatches(id: string, matches: Need["nearest_matches"]): Promise<Need | undefined>;

  // The brief (8.5) and the clusters of the needs bank (FR-5.4).
  /** Stores a need's brief, replacing an earlier one, and sets the need's brief_id; false when the need is unknown. */
  saveBrief(brief: StoredBrief): Promise<boolean>;
  getBrief(needId: string): Promise<StoredBrief | undefined>;
  /**
   * Replaces a clustering run: every need of `needIds` gets the id of the
   * cluster that lists it, or null; the clusters' names are stored under
   * their ids (an id is a hash of its members, so a name is replaced only
   * when the same members are named again).
   */
  saveClusters(clusters: (NeedCluster & { need_ids: string[] })[], needIds: string[]): Promise<void>;
  /** Every stored cluster name, newest first. */
  listClusters(): Promise<NeedCluster[]>;

  // Contact requests (8.6).
  addContact(contact: ContactRequest): Promise<void>;
  listContacts(filter?: ContactFilter): Promise<ContactRequest[]>;
  /** Decides a request that still waits for moderation, with its new status. */
  decideContact(id: string, moderation: Moderation, status: ContactStatus): Promise<ContactRequest | undefined>;
  updateContact(id: string, change: { status: ContactStatus; note_pl: string | null }): Promise<ContactRequest | undefined>;

  // Readiness registrations (8.6, FR-6.5).
  addReadiness(entry: Readiness): Promise<void>;
  getReadiness(id: string): Promise<Readiness | undefined>;
  listReadiness(filter?: ReadinessFilter): Promise<Readiness[]>;
  /** Verifies or rejects a registration that is still unverified. */
  verifyReadiness(id: string, verification: Readiness["verification"]): Promise<Readiness | undefined>;
  updateReadiness(
    id: string,
    change: { verification: Readiness["verification"]; note_pl: string | null },
  ): Promise<Readiness | undefined>;

  // Feedback (FR-10.1).
  addFeedback(entry: Feedback): Promise<void>;
  listFeedback(routeId?: string): Promise<Feedback[]>;

  // Content reports (8.11).
  addReport(report: ContentReport): Promise<void>;
  listReports(filter?: ReportFilter): Promise<ContentReport[]>;
  decideReport(id: string, moderation: Moderation): Promise<ContentReport | undefined>;

  // The moderation log (FR-12.8).
  appendModerationLog(entry: ModerationLogEntry): Promise<void>;
  listModerationLog(limit: number): Promise<ModerationLogEntry[]>;

  // The screening log (FR-12.7).
  /** Writes one entry; first drops entries past 14 days and texts past their text_until. */
  writeScreeningLog(entry: ScreeningLogEntry, now: number): Promise<void>;
  /** The log as of `now`, with the same retention applied. */
  listScreeningLog(now: number): Promise<StoredScreeningLogEntry[]>;
  /** Marks a kept text as reviewed; false when the entry is unknown, holds no text or was reviewed already. */
  markScreeningTextReviewed(id: string, at: string): Promise<boolean>;

  // Retention (12.6, OP-18).
  /** Deletes what lies past the cut-offs; a dry run only counts it. */
  applyRetention(cutoffs: RetentionCutoffs, options: { dryRun: boolean }): Promise<RetentionCounts>;

  // The brief marker and the event counters (FR-10.2).
  /** True the first time a need's brief is generated. */
  markBriefGenerated(needId: string, at: string): Promise<boolean>;
  countEvent(name: string): Promise<void>;
  counters(): Promise<Counters>;

  /** Saves what is pending and stops the store's timer; for scripts and tests. */
  close(): Promise<void>;
}

/** FR-2.5: the route as it may be stored. */
export function storableRoute(route: Route): Route {
  const copy = structuredClone(route);
  if (copy.mode === "redirected") copy.input = { ...copy.input, problem_text: null };
  return copy;
}
