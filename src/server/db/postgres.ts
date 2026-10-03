import { and, arrayContains, desc, asc, eq, inArray, isNotNull, isNull, lt, lte, not, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { ContactRequest, ContentReport, Moderation, ModerationLogEntry, Need, Readiness } from "@/lib/contracts/records";
import {
  SCREENING_LOG_RETENTION_MS,
  storableRoute,
  type PlaceFilter,
  type Repository,
  type RetentionCounts,
  type ScreeningLogEntry,
  type StoredScreeningLogEntry,
} from "./repository";
import * as schema from "./schema";

/*
 * The repository in PostgreSQL 16 through Drizzle (9.1). Timestamps are
 * timestamptz and come back as ISO strings in UTC; the route is kept whole
 * as jsonb next to the columns the console filters on. Decisions update
 * only rows still waiting for one, so two reviewers never decide the same
 * entry twice.
 */

type Db = PostgresJsDatabase<typeof schema>;
type NeedRow = typeof schema.needs.$inferSelect;
type ContactRow = typeof schema.contactRequests.$inferSelect;
type ReadinessRow = typeof schema.readiness.$inferSelect;
type ReportRow = typeof schema.contentReports.$inferSelect;
type ScreeningRow = typeof schema.screeningLog.$inferSelect;

const PENDING = "do-weryfikacji";

const toDate = (value: string) => new Date(value);
const toDateOrNull = (value: string | null) => (value === null ? null : new Date(value));
const iso = (value: Date) => value.toISOString();
const isoOrNull = (value: Date | null) => (value === null ? null : value.toISOString());

function moderationColumns(moderation: Moderation) {
  return {
    moderationStatus: moderation.status,
    moderationReviewer: moderation.reviewer,
    moderationDecidedAt: toDateOrNull(moderation.decided_at),
    moderationReasonPl: moderation.reason_pl,
  };
}

function moderationOf(row: NeedRow | ContactRow | ReportRow): Moderation {
  return {
    status: row.moderationStatus,
    reviewer: row.moderationReviewer,
    decided_at: isoOrNull(row.moderationDecidedAt),
    reason_pl: row.moderationReasonPl,
  };
}

function needRow(need: Need): NeedRow {
  return {
    id: need.id,
    createdAt: toDate(need.created_at),
    routeId: need.route_id,
    problemText: need.problem_text,
    summaryPl: need.summary_pl,
    placeTerc: need.place_terc,
    role: need.role,
    targetGroups: need.target_groups,
    domains: need.domains,
    reporter: need.reporter,
    consentStore: need.consents.store,
    consentPublish: need.consents.publish_anonymised,
    consentContact: need.consents.contact,
    consentTextVersion: need.consents.text_version,
    consentAt: toDate(need.consents.timestamp),
    status: need.status,
    ...moderationColumns(need.moderation),
    clusterId: need.cluster_id,
    nearestMatches: need.nearest_matches,
    briefId: need.brief_id,
    notePl: need.note_pl,
    example: need.example,
  };
}

function needOf(row: NeedRow): Need {
  return {
    id: row.id,
    created_at: iso(row.createdAt),
    route_id: row.routeId,
    problem_text: row.problemText,
    summary_pl: row.summaryPl,
    place_terc: row.placeTerc,
    role: row.role,
    target_groups: row.targetGroups,
    domains: row.domains,
    reporter: row.reporter,
    consents: {
      store: row.consentStore,
      publish_anonymised: row.consentPublish,
      contact: row.consentContact,
      text_version: row.consentTextVersion,
      timestamp: iso(row.consentAt),
    },
    status: row.status,
    moderation: moderationOf(row),
    cluster_id: row.clusterId,
    nearest_matches: row.nearestMatches,
    brief_id: row.briefId,
    note_pl: row.notePl,
    example: row.example,
  };
}

function contactRow(contact: ContactRequest): ContactRow {
  return {
    id: contact.id,
    createdAt: toDate(contact.created_at),
    routeId: contact.route_id,
    needId: contact.need_id,
    targetType: contact.target.type,
    targetId: contact.target.id,
    requester: contact.requester,
    message: contact.message,
    screening: contact.screening,
    consent: contact.consent,
    ...moderationColumns(contact.moderation),
    status: contact.status,
    notePl: contact.note_pl,
  };
}

function contactOf(row: ContactRow): ContactRequest {
  return {
    id: row.id,
    created_at: iso(row.createdAt),
    route_id: row.routeId,
    need_id: row.needId,
    target: { type: row.targetType, id: row.targetId },
    requester: row.requester,
    message: row.message,
    screening: row.screening,
    consent: row.consent,
    moderation: moderationOf(row),
    status: row.status,
    note_pl: row.notePl,
  };
}

function verificationColumns(verification: Readiness["verification"]) {
  return {
    verificationStatus: verification.status,
    verificationReviewer: verification.reviewer,
    verificationDecidedAt: toDateOrNull(verification.decided_at),
  };
}

function readinessRow(entry: Readiness): ReadinessRow {
  return {
    id: entry.id,
    createdAt: toDate(entry.created_at),
    displayName: entry.display_name,
    isOrganisation: entry.is_organisation,
    placeTerc: entry.place_terc,
    topics: entry.topics,
    channel: entry.channel,
    consentDisplayName: entry.consent_display_name,
    consent: entry.consent,
    ...verificationColumns(entry.verification),
    retentionUntil: entry.retention_until.slice(0, 10),
    notePl: entry.note_pl,
    example: entry.example ?? false,
  };
}

function readinessOf(row: ReadinessRow): Readiness {
  return {
    id: row.id,
    created_at: iso(row.createdAt),
    display_name: row.displayName,
    is_organisation: row.isOrganisation,
    place_terc: row.placeTerc,
    topics: row.topics,
    channel: row.channel,
    consent_display_name: row.consentDisplayName,
    consent: row.consent,
    verification: {
      status: row.verificationStatus,
      reviewer: row.verificationReviewer,
      decided_at: isoOrNull(row.verificationDecidedAt),
    },
    retention_until: row.retentionUntil,
    note_pl: row.notePl,
    ...(row.example ? { example: true } : {}),
  };
}

function reportOf(row: ReportRow): ContentReport {
  return {
    id: row.id,
    created_at: iso(row.createdAt),
    target: { type: row.targetType, id: row.targetId },
    reason: row.reason,
    comment: row.comment,
    moderation: moderationOf(row),
  };
}

function screeningOf(row: ScreeningRow): StoredScreeningLogEntry {
  return {
    id: `sl-${row.seq}`,
    at: iso(row.at),
    kind: row.kind as ScreeningLogEntry["kind"],
    category: row.category as ScreeningLogEntry["category"],
    confidence: row.confidence,
    outcome: row.outcome as ScreeningLogEntry["outcome"],
    sensitive_topics: row.sensitiveTopics as ScreeningLogEntry["sensitive_topics"],
    redaction_count: row.redactionCount,
    rules_fired: row.rulesFired,
    prompt_version: row.promptVersion,
    text_sha256: row.textSha256,
    text: row.text,
    text_until: isoOrNull(row.textUntil),
    ref: row.ref,
    reviewed_at: isoOrNull(row.reviewedAt),
  };
}

/** "sl-12" to 12; null for anything else. */
function screeningSeq(id: string): number | null {
  const match = /^sl-(\d{1,15})$/.exec(id);
  return match ? Number(match[1]) : null;
}

/** The console's place filter: the listed gminas, and the entries without one when null is listed. */
function placeCondition(column: PgColumn, places: PlaceFilter | undefined): SQL | undefined {
  if (places === undefined) return undefined;
  const tercs = places.filter((place): place is string => place !== null);
  const parts: SQL[] = [];
  if (tercs.length > 0) parts.push(inArray(column, tercs));
  if (places.includes(null)) parts.push(isNull(column));
  return parts.length > 0 ? or(...parts) : sql`false`;
}

export interface PostgresRepositoryOptions {
  /** Connections in the pool; the app's default is 10. */
  max?: number;
}

export function createPostgresRepository(url: string, options: PostgresRepositoryOptions = {}): Repository {
  const client = postgres(url, { max: options.max ?? 10, onnotice: () => {} });
  const db: Db = drizzle(client, { schema });
  const { routes, needs, contactRequests, readiness, feedback, contentReports, moderationLog, screeningLog } = schema;

  const logExpired = (now: number) => lt(screeningLog.at, new Date(now - SCREENING_LOG_RETENTION_MS));
  const textExpired = (now: number) => lte(screeningLog.textUntil, new Date(now));

  async function pruneScreeningLog(now: number) {
    await db.delete(screeningLog).where(logExpired(now));
    await db.update(screeningLog).set({ text: null, textUntil: null }).where(textExpired(now));
  }

  return {
    kind: "postgres",

    async saveRoute(route) {
      const stored = storableRoute(route);
      await db.insert(routes).values({
        id: stored.id,
        createdAt: toDate(stored.created_at),
        mode: stored.mode,
        placeTerc: stored.input.place_terc,
        route: stored,
      });
    },
    async getRoute(id) {
      const [row] = await db.select({ route: routes.route }).from(routes).where(eq(routes.id, id));
      return row?.route;
    },
    async listDeclinedForReview() {
      const rows = await db
        .select({ route: routes.route })
        .from(routes)
        .where(and(eq(routes.mode, "declined"), isNull(routes.declineReviewedAt)))
        .orderBy(desc(routes.createdAt));
      return rows.map((row) => row.route);
    },
    async markDeclineReviewed(id, at) {
      const rows = await db
        .update(routes)
        .set({ declineReviewedAt: toDate(at) })
        .where(and(eq(routes.id, id), eq(routes.mode, "declined"), isNull(routes.declineReviewedAt)))
        .returning({ id: routes.id });
      return rows.length > 0;
    },
    async listRouteFacts() {
      const rows = await db
        .select({
          id: routes.id,
          createdAt: routes.createdAt,
          mode: routes.mode,
          placeTerc: routes.placeTerc,
          latencyMs: sql<number | null>`(${routes.route}->'engine'->>'latency_ms')::double precision`,
          cached: sql<boolean | null>`(${routes.route}->'engine'->>'cached')::boolean`,
          solutionIds: sql<string[]>`jsonb_path_query_array(${routes.route}, '$.solutions[*].innovation_id')`,
        })
        .from(routes)
        .orderBy(desc(routes.createdAt), asc(routes.id));
      return rows.map((row) => ({
        id: row.id,
        created_at: iso(row.createdAt),
        mode: row.mode,
        place_terc: row.placeTerc,
        latency_ms: row.latencyMs ?? 0,
        cached: row.cached ?? false,
        solution_ids: row.solutionIds ?? [],
      }));
    },

    async addNeed(need) {
      await db.insert(needs).values(needRow(need));
    },
    async getNeed(id) {
      const [row] = await db.select().from(needs).where(eq(needs.id, id));
      return row && needOf(row);
    },
    async listNeeds(filter = {}) {
      const rows = await db
        .select()
        .from(needs)
        .where(
          and(
            filter.status ? eq(needs.status, filter.status) : undefined,
            filter.moderation ? eq(needs.moderationStatus, filter.moderation) : undefined,
            filter.publishable === undefined ? undefined : eq(needs.consentPublish, filter.publishable),
            filter.category ? arrayContains(needs.targetGroups, [filter.category]) : undefined,
            placeCondition(needs.placeTerc, filter.places),
          ),
        )
        .orderBy(desc(needs.createdAt), asc(needs.id));
      return rows.map(needOf);
    },
    async needCountsByPlace() {
      const rows = await db
        .select({ terc: needs.placeTerc, count: sql<number>`count(*)::int` })
        .from(needs)
        .groupBy(needs.placeTerc);
      return new Map(rows.flatMap((row) => (row.terc ? [[row.terc, row.count] as const] : [])));
    },
    async decideNeed(id, moderation) {
      const [row] = await db
        .update(needs)
        .set(moderationColumns(moderation))
        .where(and(eq(needs.id, id), eq(needs.moderationStatus, PENDING)))
        .returning();
      return row && needOf(row);
    },
    async updateNeed(id, change) {
      const [row] = await db
        .update(needs)
        .set({ status: change.status, notePl: change.note_pl })
        .where(eq(needs.id, id))
        .returning();
      return row && needOf(row);
    },
    async setNearestMatches(id, matches) {
      const [row] = await db.update(needs).set({ nearestMatches: matches }).where(eq(needs.id, id)).returning();
      return row && needOf(row);
    },

    async saveBrief(brief) {
      return db.transaction(async (tx) => {
        const updated = await tx.update(needs).set({ briefId: brief.id }).where(eq(needs.id, brief.need_id)).returning({ id: needs.id });
        if (updated.length === 0) return false;
        const values = {
          id: brief.id,
          needId: brief.need_id,
          generatedAt: toDate(brief.generated_at),
          brief: brief.brief,
          sections: brief.sections,
          markdown: brief.markdown,
        };
        await tx
          .insert(schema.briefs)
          .values(values)
          .onConflictDoUpdate({
            target: schema.briefs.needId,
            set: { id: values.id, generatedAt: values.generatedAt, brief: values.brief, sections: values.sections, markdown: values.markdown },
          });
        return true;
      });
    },
    async getBrief(needId) {
      const [row] = await db.select().from(schema.briefs).where(eq(schema.briefs.needId, needId));
      return (
        row && {
          id: row.id,
          need_id: row.needId,
          generated_at: iso(row.generatedAt),
          brief: row.brief,
          sections: row.sections,
          markdown: row.markdown,
        }
      );
    },
    async saveClusters(clusters, needIds) {
      await db.transaction(async (tx) => {
        for (const cluster of clusters) {
          await tx
            .insert(schema.needClusters)
            .values({ id: cluster.id, namePl: cluster.name_pl, createdAt: toDate(cluster.created_at) })
            .onConflictDoUpdate({ target: schema.needClusters.id, set: { namePl: cluster.name_pl, createdAt: toDate(cluster.created_at) } });
        }
        if (needIds.length > 0) await tx.update(needs).set({ clusterId: null }).where(inArray(needs.id, needIds));
        for (const cluster of clusters) {
          const members = cluster.need_ids.filter((id) => needIds.includes(id));
          if (members.length > 0) await tx.update(needs).set({ clusterId: cluster.id }).where(inArray(needs.id, members));
        }
      });
    },
    async listClusters() {
      const rows = await db.select().from(schema.needClusters).orderBy(desc(schema.needClusters.createdAt), asc(schema.needClusters.id));
      return rows.map((row) => ({ id: row.id, name_pl: row.namePl, created_at: iso(row.createdAt) }));
    },

    async addContact(contact) {
      await db.insert(contactRequests).values(contactRow(contact));
    },
    async listContacts(filter = {}) {
      const rows = await db
        .select()
        .from(contactRequests)
        .where(
          and(
            filter.status ? eq(contactRequests.status, filter.status) : undefined,
            filter.moderation ? eq(contactRequests.moderationStatus, filter.moderation) : undefined,
          ),
        )
        .orderBy(desc(contactRequests.createdAt), asc(contactRequests.id));
      return rows.map(contactOf);
    },
    async decideContact(id, moderation, status) {
      const [row] = await db
        .update(contactRequests)
        .set({ ...moderationColumns(moderation), status })
        .where(and(eq(contactRequests.id, id), eq(contactRequests.moderationStatus, PENDING)))
        .returning();
      return row && contactOf(row);
    },
    async updateContact(id, change) {
      const [row] = await db
        .update(contactRequests)
        .set({ status: change.status, notePl: change.note_pl })
        .where(eq(contactRequests.id, id))
        .returning();
      return row && contactOf(row);
    },

    async addReadiness(entry) {
      await db.insert(readiness).values(readinessRow(entry));
    },
    async getReadiness(id) {
      const [row] = await db.select().from(readiness).where(eq(readiness.id, id));
      return row && readinessOf(row);
    },
    async listReadiness(filter = {}) {
      const rows = await db
        .select()
        .from(readiness)
        .where(
          and(
            filter.status ? eq(readiness.verificationStatus, filter.status) : undefined,
            placeCondition(readiness.placeTerc, filter.places),
          ),
        )
        .orderBy(desc(readiness.createdAt), asc(readiness.id));
      return rows.map(readinessOf);
    },
    async verifyReadiness(id, verification) {
      const [row] = await db
        .update(readiness)
        .set(verificationColumns(verification))
        .where(and(eq(readiness.id, id), eq(readiness.verificationStatus, "niezweryfikowane")))
        .returning();
      return row && readinessOf(row);
    },
    async updateReadiness(id, change) {
      const [row] = await db
        .update(readiness)
        .set({ ...verificationColumns(change.verification), notePl: change.note_pl })
        .where(eq(readiness.id, id))
        .returning();
      return row && readinessOf(row);
    },

    async addFeedback(entry) {
      await db.insert(feedback).values({
        routeId: entry.route_id,
        value: entry.value,
        comment: entry.comment,
        createdAt: toDate(entry.created_at),
      });
    },
    async listFeedback(routeId) {
      const rows = await db
        .select()
        .from(feedback)
        .where(routeId ? eq(feedback.routeId, routeId) : undefined)
        .orderBy(desc(feedback.createdAt), desc(feedback.seq));
      return rows.map((row) => ({ route_id: row.routeId, value: row.value, comment: row.comment, created_at: iso(row.createdAt) }));
    },

    async addReport(report) {
      await db.insert(contentReports).values({
        id: report.id,
        createdAt: toDate(report.created_at),
        targetType: report.target.type,
        targetId: report.target.id,
        reason: report.reason,
        comment: report.comment,
        ...moderationColumns(report.moderation),
      });
    },
    async listReports(filter = {}) {
      const rows = await db
        .select()
        .from(contentReports)
        .where(filter.moderation ? eq(contentReports.moderationStatus, filter.moderation) : undefined)
        .orderBy(desc(contentReports.createdAt), asc(contentReports.id));
      return rows.map(reportOf);
    },
    async decideReport(id, moderation) {
      const [row] = await db
        .update(contentReports)
        .set(moderationColumns(moderation))
        .where(and(eq(contentReports.id, id), eq(contentReports.moderationStatus, PENDING)))
        .returning();
      return row && reportOf(row);
    },

    async appendModerationLog(entry) {
      await db.insert(moderationLog).values({
        ts: toDate(entry.ts),
        reviewer: entry.reviewer,
        targetType: entry.target_type,
        targetId: entry.target_id,
        action: entry.action,
        status: entry.status,
        reasonPl: entry.reason_pl,
        notePl: entry.note_pl,
      });
    },
    async listModerationLog(limit) {
      const rows = await db.select().from(moderationLog).orderBy(desc(moderationLog.ts), desc(moderationLog.seq)).limit(limit);
      return rows.map(
        (row): ModerationLogEntry => ({
          ts: iso(row.ts),
          reviewer: row.reviewer,
          target_type: row.targetType,
          target_id: row.targetId,
          action: row.action,
          status: row.status,
          reason_pl: row.reasonPl,
          note_pl: row.notePl,
        }),
      );
    },

    async writeScreeningLog(entry, now) {
      await pruneScreeningLog(now);
      await db.insert(screeningLog).values({
        at: toDate(entry.at),
        kind: entry.kind,
        category: entry.category,
        confidence: entry.confidence,
        outcome: entry.outcome,
        sensitiveTopics: entry.sensitive_topics,
        redactionCount: entry.redaction_count,
        rulesFired: entry.rules_fired,
        promptVersion: entry.prompt_version,
        textSha256: entry.text_sha256,
        text: entry.text,
        textUntil: toDateOrNull(entry.text_until),
        ref: entry.ref,
      });
    },
    async listScreeningLog(now) {
      await pruneScreeningLog(now);
      const rows = await db.select().from(screeningLog).orderBy(desc(screeningLog.at), desc(screeningLog.seq));
      return rows.map(screeningOf);
    },
    async markScreeningTextReviewed(id, at) {
      const seq = screeningSeq(id);
      if (seq === null) return false;
      const rows = await db
        .update(screeningLog)
        .set({ reviewedAt: toDate(at) })
        .where(and(eq(screeningLog.seq, seq), isNotNull(screeningLog.text), isNull(screeningLog.reviewedAt)))
        .returning({ seq: screeningLog.seq });
      return rows.length > 0;
    },

    async applyRetention(cutoffs, { dryRun }): Promise<RetentionCounts> {
      const oldRoutes = cutoffs.routesBefore === null ? sql`false` : lt(routes.createdAt, toDate(cutoffs.routesBefore));
      const oldRouteIds = db.select({ id: routes.id }).from(routes).where(oldRoutes);
      const oldFeedback = inArray(feedback.routeId, oldRouteIds);
      const oldContacts = lt(contactRequests.createdAt, toDate(cutoffs.contactsBefore));
      const oldReadiness = lt(readiness.retentionUntil, cutoffs.readinessBefore);
      const now = Date.parse(cutoffs.screeningAt);
      return db.transaction(async (tx) => {
        const count = async (table: PgTable, where: SQL | undefined) => {
          const [row] = await tx.select({ count: sql<number>`count(*)::int` }).from(table).where(where);
          return row?.count ?? 0;
        };
        const counts: RetentionCounts = {
          routes: await count(routes, oldRoutes),
          feedback: await count(feedback, oldFeedback),
          contacts: await count(contactRequests, oldContacts),
          readiness: await count(readiness, oldReadiness),
          screeningEntries: await count(screeningLog, logExpired(now)),
          screeningTexts: await count(screeningLog, and(textExpired(now), not(logExpired(now)))),
        };
        if (dryRun) return counts;
        // Feedback first: its condition reads the routes about to go.
        await tx.delete(feedback).where(oldFeedback);
        await tx.delete(routes).where(oldRoutes);
        await tx.delete(contactRequests).where(oldContacts);
        await tx.delete(readiness).where(oldReadiness);
        await tx.delete(screeningLog).where(logExpired(now));
        await tx.update(screeningLog).set({ text: null, textUntil: null }).where(textExpired(now));
        return counts;
      });
    },

    async markBriefGenerated(needId, at) {
      const rows = await db
        .insert(schema.generatedBriefs)
        .values({ needId, generatedAt: toDate(at) })
        .onConflictDoNothing()
        .returning({ needId: schema.generatedBriefs.needId });
      return rows.length > 0;
    },
    async countEvent(name) {
      await db
        .insert(schema.eventCounters)
        .values({ name, count: 1 })
        .onConflictDoUpdate({ target: schema.eventCounters.name, set: { count: sql`${schema.eventCounters.count} + 1` } });
    },
    async counters() {
      const rows = await db.select().from(schema.eventCounters);
      const since = rows.reduce<Date | null>((first, row) => (first && first <= row.since ? first : row.since), null);
      return {
        since: (since ?? new Date()).toISOString(),
        counts: Object.fromEntries(rows.map((row) => [row.name, row.count])),
      };
    },

    async close() {
      await client.end({ timeout: 5 });
    },
  };
}
