import type { RoleCode } from "./catalogue";

/*
 * What the forms store and the ROPS console works on: the need (8.5), the
 * contact request, the readiness registration and the feedback (8.6).
 * `note_pl` is the console's note field (S7); `example` marks seed entries.
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

export type NeedStatus = "nowa" | "przejrzana" | "w-temacie" | "zamknieta";

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
}

export type FeedbackValue = "tak" | "czesciowo" | "nie";

export interface Feedback {
  route_id: string;
  value: FeedbackValue;
  comment: string | null;
  created_at: string;
}

/** Every moderation action is logged with the reviewer's token name (FR-12.8). */
export interface ModerationLogEntry {
  ts: string;
  reviewer: string;
  target_type: "need" | "contact" | "readiness" | "declined";
  target_id: string;
  action: "zatwierdzone" | "odrzucone" | "zweryfikowane" | "przejrzane" | "status";
  /** The new status code of a "status" action; null for decisions. */
  status: string | null;
  reason_pl: string | null;
  note_pl: string | null;
}
