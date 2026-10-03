import type { ContactRequest, ContentReport, Feedback, Idea, ModerationLogEntry, Need, Readiness, NeedCluster, StoredBrief, Route } from "@/lib/contracts";
import { exampleIdeas, exampleNeeds, exampleReadiness } from "./examples";
import {
  SCREENING_LOG_RETENTION_MS,
  storableRoute,
  type Counters,
  type PlaceFilter,
  type Repository,
  type RetentionCounts,
  type RouteFacts,
  type StoredScreeningLogEntry,
} from "./repository";

/*
 * The repository in the server's memory: the whole store, calling
 * `onChange` after every change so that file.ts can save it. On its own it
 * is gone after a restart (STORE_FILE=memory: the Playwright journeys, the
 * pipeline scripts). Lists are kept newest first.
 */

export interface MemoryState {
  startedAt: string;
  routes: Map<string, Route>;
  reviewedDeclines: Set<string>;
  needs: Need[];
  contacts: ContactRequest[];
  readiness: Readiness[];
  ideas: Idea[];
  feedback: Feedback[];
  reports: ContentReport[];
  log: ModerationLogEntry[];
  screeningLog: StoredScreeningLogEntry[];
  /** The last sequence number given to a screening-log entry. */
  screeningSeq: number;
  briefs: Set<string>;
  counters: Map<string, number>;
  /** The stored briefs (8.5) by need id. */
  storedBriefs: Map<string, StoredBrief>;
  /** Cluster names (FR-5.4) by cluster id. */
  clusters: Map<string, NeedCluster>;
}

export function createMemoryState(): MemoryState {
  return {
    startedAt: new Date().toISOString(),
    routes: new Map(),
    reviewedDeclines: new Set(),
    needs: exampleNeeds(),
    contacts: [],
    readiness: exampleReadiness(),
    ideas: exampleIdeas(),
    feedback: [],
    reports: [],
    log: [],
    screeningLog: [],
    screeningSeq: 0,
    briefs: new Set(),
    counters: new Map(),
    storedBriefs: new Map(),
    clusters: new Map(),
  };
}

const copy = <T>(value: T): T => structuredClone(value);

/** Keeps a list newest first by its time; a tie goes before the older entries. */
function insertNewestFirst<T>(list: T[], item: T, time: (entry: T) => string) {
  const when = Date.parse(time(item));
  const index = list.findIndex((entry) => Date.parse(time(entry)) <= when);
  list.splice(index === -1 ? list.length : index, 0, copy(item));
}
const createdAt = (entry: { created_at: string }) => entry.created_at;

function inPlaces(places: PlaceFilter | undefined, terc: string | null): boolean {
  return places === undefined || places.includes(terc);
}

const logExpired = (entry: StoredScreeningLogEntry, now: number) => now - Date.parse(entry.at) >= SCREENING_LOG_RETENTION_MS;
const textExpired = (entry: StoredScreeningLogEntry, now: number) =>
  entry.text_until !== null && Date.parse(entry.text_until) <= now;

/** Drops entries past the log retention and texts past their seven days. */
function pruneScreeningLog(state: MemoryState, now: number) {
  state.screeningLog = state.screeningLog.filter((entry) => !logExpired(entry, now));
  for (const entry of state.screeningLog) {
    if (textExpired(entry, now)) {
      entry.text = null;
      entry.text_until = null;
    }
  }
}

function routeFacts(route: Route): RouteFacts {
  return {
    id: route.id,
    created_at: route.created_at,
    mode: route.mode,
    place_terc: route.input.place_terc,
    latency_ms: route.engine.latency_ms,
    cached: route.engine.cached,
    solution_ids: route.solutions.map((solution) => solution.innovation_id),
  };
}

export function createMemoryRepository(state: MemoryState = createMemoryState(), onChange: () => void = () => {}): Repository {
  const need = (id: string) => state.needs.find((item) => item.id === id);
  const contact = (id: string) => state.contacts.find((item) => item.id === id);
  const registration = (id: string) => state.readiness.find((item) => item.id === id);

  return {
    kind: "memory",

    async saveRoute(route) {
      state.routes.set(route.id, storableRoute(route));
      onChange();
    },
    async getRoute(id) {
      const route = state.routes.get(id);
      return route && copy(route);
    },
    async listDeclinedForReview() {
      return [...state.routes.values()]
        .filter((route) => route.mode === "declined" && !state.reviewedDeclines.has(route.id))
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        .map(copy);
    },
    async markDeclineReviewed(id) {
      if (state.routes.get(id)?.mode !== "declined" || state.reviewedDeclines.has(id)) return false;
      state.reviewedDeclines.add(id);
      onChange();
      return true;
    },
    async listRouteFacts() {
      return [...state.routes.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).map(routeFacts);
    },

    async addNeed(entry) {
      insertNewestFirst(state.needs, entry, createdAt);
      onChange();
    },
    async getNeed(id) {
      const found = need(id);
      return found && copy(found);
    },
    async listNeeds(filter = {}) {
      return state.needs
        .filter(
          (item) =>
            (!filter.status || item.status === filter.status) &&
            (!filter.moderation || item.moderation.status === filter.moderation) &&
            (filter.publishable === undefined || item.consents.publish_anonymised === filter.publishable) &&
            (!filter.category || item.target_groups.includes(filter.category)) &&
            inPlaces(filter.places, item.place_terc),
        )
        .map(copy);
    },
    async needCountsByPlace() {
      const counts = new Map<string, number>();
      for (const item of state.needs) {
        if (item.place_terc) counts.set(item.place_terc, (counts.get(item.place_terc) ?? 0) + 1);
      }
      return counts;
    },
    async decideNeed(id, moderation) {
      const found = need(id);
      if (!found || found.moderation.status !== "do-weryfikacji") return undefined;
      found.moderation = { ...moderation };
      onChange();
      return copy(found);
    },
    async updateNeed(id, change) {
      const found = need(id);
      if (!found) return undefined;
      found.status = change.status;
      found.note_pl = change.note_pl;
      onChange();
      return copy(found);
    },
    async setNearestMatches(id, matches) {
      const found = need(id);
      if (!found) return undefined;
      found.nearest_matches = copy(matches);
      onChange();
      return copy(found);
    },

    async saveBrief(brief) {
      const found = need(brief.need_id);
      if (!found) return false;
      state.storedBriefs.set(brief.need_id, copy(brief));
      found.brief_id = brief.id;
      onChange();
      return true;
    },
    async getBrief(needId) {
      const found = state.storedBriefs.get(needId);
      return found && copy(found);
    },
    async saveClusters(clusters, needIds) {
      const byNeed = new Map(clusters.flatMap((cluster) => cluster.need_ids.map((id) => [id, cluster.id] as const)));
      for (const cluster of clusters) {
        state.clusters.set(cluster.id, { id: cluster.id, name_pl: cluster.name_pl, created_at: cluster.created_at });
      }
      for (const id of needIds) {
        const found = need(id);
        if (found) found.cluster_id = byNeed.get(id) ?? null;
      }
      onChange();
    },
    async listClusters() {
      return [...state.clusters.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).map(copy);
    },

    async addContact(entry) {
      insertNewestFirst(state.contacts, entry, createdAt);
      onChange();
    },
    async listContacts(filter = {}) {
      return state.contacts
        .filter(
          (item) =>
            (!filter.status || item.status === filter.status) &&
            (!filter.moderation || item.moderation.status === filter.moderation),
        )
        .map(copy);
    },
    async decideContact(id, moderation, status) {
      const found = contact(id);
      if (!found || found.moderation.status !== "do-weryfikacji") return undefined;
      found.moderation = { ...moderation };
      found.status = status;
      onChange();
      return copy(found);
    },
    async updateContact(id, change) {
      const found = contact(id);
      if (!found) return undefined;
      found.status = change.status;
      found.note_pl = change.note_pl;
      onChange();
      return copy(found);
    },

    async addReadiness(entry) {
      insertNewestFirst(state.readiness, entry, createdAt);
      onChange();
    },
    async getReadiness(id) {
      const found = registration(id);
      return found && copy(found);
    },
    async listReadiness(filter = {}) {
      return state.readiness
        .filter((item) => (!filter.status || item.verification.status === filter.status) && inPlaces(filter.places, item.place_terc))
        .map(copy);
    },
    async verifyReadiness(id, verification) {
      const found = registration(id);
      if (!found || found.verification.status !== "niezweryfikowane") return undefined;
      found.verification = { ...verification };
      onChange();
      return copy(found);
    },
    async updateReadiness(id, change) {
      const found = registration(id);
      if (!found) return undefined;
      found.verification = { ...change.verification };
      found.note_pl = change.note_pl;
      onChange();
      return copy(found);
    },

    async addIdea(idea) {
      insertNewestFirst(state.ideas, idea, createdAt);
      onChange();
    },
    async getIdea(id) {
      const found = state.ideas.find((item) => item.id === id);
      return found && copy(found);
    },
    async listIdeas() {
      return state.ideas.map(copy);
    },
    async setIdeaSimilar(id, similar) {
      const found = state.ideas.find((item) => item.id === id);
      if (!found) return undefined;
      found.similar = copy(similar);
      onChange();
      return copy(found);
    },

    async addFeedback(entry) {
      insertNewestFirst(state.feedback, entry, createdAt);
      onChange();
    },
    async listFeedback(routeId) {
      return state.feedback.filter((item) => !routeId || item.route_id === routeId).map(copy);
    },

    async addReport(report) {
      insertNewestFirst(state.reports, report, createdAt);
      onChange();
    },
    async listReports(filter = {}) {
      return state.reports.filter((item) => !filter.moderation || item.moderation.status === filter.moderation).map(copy);
    },
    async decideReport(id, moderation) {
      const found = state.reports.find((item) => item.id === id);
      if (!found || found.moderation.status !== "do-weryfikacji") return undefined;
      found.moderation = { ...moderation };
      onChange();
      return copy(found);
    },

    async appendModerationLog(entry) {
      insertNewestFirst(state.log, entry, (item) => item.ts);
      onChange();
    },
    async listModerationLog(limit) {
      return state.log.slice(0, limit).map(copy);
    },

    async writeScreeningLog(entry, now) {
      pruneScreeningLog(state, now);
      state.screeningSeq += 1;
      insertNewestFirst(state.screeningLog, { ...entry, id: `sl-${state.screeningSeq}`, reviewed_at: null }, (item) => item.at);
      onChange();
    },
    async listScreeningLog(now) {
      pruneScreeningLog(state, now);
      return state.screeningLog.map(copy);
    },
    async markScreeningTextReviewed(id, at) {
      const found = state.screeningLog.find((entry) => entry.id === id);
      if (!found || found.text === null || found.reviewed_at !== null) return false;
      found.reviewed_at = at;
      onChange();
      return true;
    },

    async applyRetention(cutoffs, { dryRun }): Promise<RetentionCounts> {
      const routesBefore = cutoffs.routesBefore === null ? null : Date.parse(cutoffs.routesBefore);
      const oldRoutes = new Set(
        [...state.routes.values()]
          .filter((route) => routesBefore !== null && Date.parse(route.created_at) < routesBefore)
          .map((route) => route.id),
      );
      const contactsBefore = Date.parse(cutoffs.contactsBefore);
      const oldContact = (item: ContactRequest) => Date.parse(item.created_at) < contactsBefore;
      const oldReadiness = (item: Readiness) => item.retention_until.slice(0, 10) < cutoffs.readinessBefore;
      const oldIdea = (item: Idea) => item.retention_until.slice(0, 10) < cutoffs.readinessBefore;
      const now = Date.parse(cutoffs.screeningAt);
      const counts: RetentionCounts = {
        routes: oldRoutes.size,
        feedback: state.feedback.filter((item) => oldRoutes.has(item.route_id)).length,
        contacts: state.contacts.filter(oldContact).length,
        readiness: state.readiness.filter(oldReadiness).length,
        ideas: state.ideas.filter(oldIdea).length,
        screeningEntries: state.screeningLog.filter((entry) => logExpired(entry, now)).length,
        screeningTexts: state.screeningLog.filter((entry) => !logExpired(entry, now) && textExpired(entry, now)).length,
      };
      if (dryRun) return counts;
      for (const id of oldRoutes) {
        state.routes.delete(id);
        state.reviewedDeclines.delete(id);
      }
      state.feedback = state.feedback.filter((item) => !oldRoutes.has(item.route_id));
      state.contacts = state.contacts.filter((item) => !oldContact(item));
      state.readiness = state.readiness.filter((item) => !oldReadiness(item));
      state.ideas = state.ideas.filter((item) => !oldIdea(item));
      pruneScreeningLog(state, now);
      if (Object.values(counts).some((count) => count > 0)) onChange();
      return counts;
    },

    async markBriefGenerated(needId) {
      if (state.briefs.has(needId)) return false;
      state.briefs.add(needId);
      onChange();
      return true;
    },
    async countEvent(name) {
      state.counters.set(name, (state.counters.get(name) ?? 0) + 1);
      onChange();
    },
    async counters(): Promise<Counters> {
      return { since: state.startedAt, counts: Object.fromEntries(state.counters) };
    },

    async close() {},
  };
}
