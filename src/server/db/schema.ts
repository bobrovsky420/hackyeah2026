import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { Brief, BriefSection } from "@/lib/contracts/brief";
import type { Consent, ContactRequest, Need, Readiness } from "@/lib/contracts/records";
import type { Route } from "@/lib/contracts/route";

/*
 * The PostgreSQL schema (9.1) of what the app keeps: routes (8.4), needs
 * (8.5), contact requests, readiness registrations and feedback (8.6),
 * content reports (8.11), the moderation log (FR-12.8), the screening log
 * (FR-12.7), the brief marker and the event counters (FR-10.2). Columns
 * where the console filters or sorts, jsonb for the nested parts. The rate
 * limiter's memory and the gate's repeat and abuse memory are never
 * written here (12.5, FR-12.14). Migrations: `pnpm db:generate` after a
 * change here, `pnpm db:migrate` to apply them (docs/database.md).
 */

const stamp = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const textList = (name: string) =>
  text(name)
    .array()
    .notNull()
    .default(sql`'{}'::text[]`);

/** The route as the permalink shows it; a `redirected` route is stored without the reader's text (FR-2.5). */
export const routes = pgTable(
  "routes",
  {
    id: text("id").primaryKey(),
    createdAt: stamp("created_at").notNull(),
    mode: text("mode").$type<Route["mode"]>().notNull(),
    placeTerc: text("place_terc"),
    route: jsonb("route").$type<Route>().notNull(),
    /** The declined-texts review of FR-12.8: set once a reviewer looked at it. */
    declineReviewedAt: stamp("decline_reviewed_at"),
  },
  (table) => [
    index("routes_created_at_idx").on(table.createdAt),
    index("routes_mode_idx").on(table.mode),
    index("routes_place_terc_idx").on(table.placeTerc),
  ],
);

export const needs = pgTable(
  "needs",
  {
    id: text("id").primaryKey(),
    createdAt: stamp("created_at").notNull(),
    routeId: text("route_id"),
    problemText: text("problem_text").notNull(),
    summaryPl: text("summary_pl"),
    placeTerc: text("place_terc"),
    role: text("role").$type<Need["role"]>(),
    targetGroups: textList("target_groups"),
    domains: textList("domains"),
    reporter: jsonb("reporter").$type<Need["reporter"]>().notNull(),
    consentStore: boolean("consent_store").notNull(),
    consentPublish: boolean("consent_publish").notNull(),
    consentContact: boolean("consent_contact").notNull(),
    consentTextVersion: text("consent_text_version").notNull(),
    consentAt: stamp("consent_at").notNull(),
    status: text("status").$type<Need["status"]>().notNull(),
    moderationStatus: text("moderation_status").$type<Need["moderation"]["status"]>().notNull(),
    moderationReviewer: text("moderation_reviewer"),
    moderationDecidedAt: stamp("moderation_decided_at"),
    moderationReasonPl: text("moderation_reason_pl"),
    clusterId: text("cluster_id"),
    nearestMatches: jsonb("nearest_matches").$type<Need["nearest_matches"]>().notNull(),
    briefId: text("brief_id"),
    notePl: text("note_pl"),
    example: boolean("example").notNull().default(false),
  },
  (table) => [
    index("needs_created_at_idx").on(table.createdAt),
    index("needs_status_idx").on(table.status),
    index("needs_moderation_status_idx").on(table.moderationStatus),
    index("needs_place_terc_idx").on(table.placeTerc),
    index("needs_target_groups_idx").using("gin", table.targetGroups),
  ],
);

export const contactRequests = pgTable(
  "contact_requests",
  {
    id: text("id").primaryKey(),
    createdAt: stamp("created_at").notNull(),
    routeId: text("route_id"),
    needId: text("need_id"),
    targetType: text("target_type").$type<ContactRequest["target"]["type"]>().notNull(),
    targetId: text("target_id").notNull(),
    requester: jsonb("requester").$type<ContactRequest["requester"]>().notNull(),
    message: text("message").notNull(),
    screening: jsonb("screening").$type<ContactRequest["screening"]>().notNull(),
    consent: jsonb("consent").$type<Consent>().notNull(),
    moderationStatus: text("moderation_status").$type<ContactRequest["moderation"]["status"]>().notNull(),
    moderationReviewer: text("moderation_reviewer"),
    moderationDecidedAt: stamp("moderation_decided_at"),
    moderationReasonPl: text("moderation_reason_pl"),
    status: text("status").$type<ContactRequest["status"]>().notNull(),
    notePl: text("note_pl"),
  },
  (table) => [
    index("contact_requests_created_at_idx").on(table.createdAt),
    index("contact_requests_status_idx").on(table.status),
    index("contact_requests_moderation_status_idx").on(table.moderationStatus),
  ],
);

export const readiness = pgTable(
  "readiness",
  {
    id: text("id").primaryKey(),
    createdAt: stamp("created_at").notNull(),
    displayName: text("display_name").notNull(),
    isOrganisation: boolean("is_organisation").notNull(),
    placeTerc: text("place_terc"),
    topics: textList("topics"),
    channel: jsonb("channel").$type<Readiness["channel"]>().notNull(),
    consentDisplayName: boolean("consent_display_name").notNull(),
    consent: jsonb("consent").$type<Consent>().notNull(),
    verificationStatus: text("verification_status").$type<Readiness["verification"]["status"]>().notNull(),
    verificationReviewer: text("verification_reviewer"),
    verificationDecidedAt: stamp("verification_decided_at"),
    retentionUntil: date("retention_until", { mode: "string" }).notNull(),
    notePl: text("note_pl"),
    example: boolean("example").notNull().default(false),
  },
  (table) => [
    index("readiness_created_at_idx").on(table.createdAt),
    index("readiness_verification_status_idx").on(table.verificationStatus),
    index("readiness_place_terc_idx").on(table.placeTerc),
  ],
);

export const feedback = pgTable(
  "feedback",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    routeId: text("route_id").notNull(),
    value: text("value").$type<"tak" | "czesciowo" | "nie">().notNull(),
    comment: text("comment"),
    createdAt: stamp("created_at").notNull(),
  },
  (table) => [index("feedback_route_id_idx").on(table.routeId)],
);

export const contentReports = pgTable(
  "content_reports",
  {
    id: text("id").primaryKey(),
    createdAt: stamp("created_at").notNull(),
    targetType: text("target_type").$type<"route" | "brief" | "innovation" | "need">().notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").$type<"nieprawdziwe" | "obrazliwe" | "dane_osobowe" | "inne">().notNull(),
    comment: text("comment"),
    moderationStatus: text("moderation_status").$type<"do-weryfikacji" | "zatwierdzone" | "odrzucone">().notNull(),
    moderationReviewer: text("moderation_reviewer"),
    moderationDecidedAt: stamp("moderation_decided_at"),
    moderationReasonPl: text("moderation_reason_pl"),
  },
  (table) => [
    index("content_reports_created_at_idx").on(table.createdAt),
    index("content_reports_moderation_status_idx").on(table.moderationStatus),
  ],
);

/** Every moderation action with the reviewer's token name (FR-12.8). */
export const moderationLog = pgTable(
  "moderation_log",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    ts: stamp("ts").notNull(),
    reviewer: text("reviewer").notNull(),
    targetType: text("target_type").$type<"need" | "contact" | "readiness" | "declined" | "report">().notNull(),
    targetId: text("target_id").notNull(),
    action: text("action").$type<"zatwierdzone" | "odrzucone" | "zweryfikowane" | "przejrzane" | "status">().notNull(),
    status: text("status"),
    reasonPl: text("reason_pl"),
    notePl: text("note_pl"),
  },
  (table) => [index("moderation_log_ts_idx").on(table.ts)],
);

/** FR-12.7: no identity; the text only for `declined` and spam, until text_until (seven days). */
export const screeningLog = pgTable(
  "screening_log",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    at: stamp("at").notNull(),
    kind: text("kind").notNull(),
    category: text("category").notNull(),
    confidence: doublePrecision("confidence").notNull(),
    outcome: text("outcome").notNull(),
    sensitiveTopics: textList("sensitive_topics"),
    redactionCount: integer("redaction_count").notNull(),
    rulesFired: textList("rules_fired"),
    promptVersion: text("prompt_version"),
    textSha256: text("text_sha256").notNull(),
    text: text("text"),
    textUntil: stamp("text_until"),
    /** The stored record the text belongs to, when there is one: the route id of a declined request. */
    ref: text("ref"),
    /** The declined-texts review of FR-12.8: set once a reviewer looked at the kept text. */
    reviewedAt: stamp("reviewed_at"),
  },
  (table) => [index("screening_log_at_idx").on(table.at), index("screening_log_text_until_idx").on(table.textUntil)],
);

/** Needs whose brief was generated once, for the counter brief_generated (FR-10.2). */
export const generatedBriefs = pgTable("generated_briefs", {
  needId: text("need_id").primaryKey(),
  generatedAt: stamp("generated_at").notNull(),
});

/** The brief of a need as generated (8.5): one per need, replaced only on the console's request. */
export const briefs = pgTable(
  "briefs",
  {
    id: text("id").primaryKey(),
    needId: text("need_id").notNull().unique(),
    generatedAt: stamp("generated_at").notNull(),
    brief: jsonb("brief").$type<Brief>().notNull(),
    sections: jsonb("sections").$type<BriefSection[]>().notNull(),
    markdown: text("markdown").notNull(),
  },
  (table) => [index("briefs_generated_at_idx").on(table.generatedAt)],
);

/** The names of the clusters of the needs bank (FR-5.4); needs.cluster_id points here. */
export const needClusters = pgTable("need_clusters", {
  id: text("id").primaryKey(),
  namePl: text("name_pl").notNull(),
  createdAt: stamp("created_at").notNull(),
});

/** The event counters of FR-10.2: names and numbers, nothing personal. */
export const eventCounters = pgTable("event_counters", {
  name: text("name").primaryKey(),
  count: bigint("count", { mode: "number" }).notNull(),
  since: stamp("since").notNull().defaultNow(),
});
