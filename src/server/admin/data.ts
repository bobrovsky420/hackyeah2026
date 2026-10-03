import { catalogue } from "@/lib/catalogue";
import type { ContactRequest, Evaluation, Idea, Need, Readiness, Route } from "@/lib/contracts";
import { warsawDay } from "@/lib/dates";
import { repository, type Repository } from "@/server/db";
import { questionGroups } from "@/server/db/repository";
import { waitsForRops } from "@/server/threads/access";

/*
 * What the panel (module VI) reads of the store: the queues that wait for a
 * person at ROPS, with what is new since the reviewer's last visit, the
 * trends of module II that only the administrator sees, and the CSV export
 * of FR-9.2. Everything here runs behind the panel's door.
 */

export type QueueKey = "threads" | "partnerships" | "ideas" | "evaluations" | "needs" | "contacts" | "readiness" | "reports" | "declined";

export interface QueueCount {
  key: QueueKey;
  /** Entries that wait for a decision. */
  waiting: number;
  /** Entries created after the last visit; all of them without one. */
  fresh: number;
}

const isFresh = (createdAt: string, since: string | null) => since === null || createdAt > since;

export async function queueCounts(since: string | null, repo: Repository = repository(), now = Date.now()): Promise<QueueCount[]> {
  const [threads, posts, ideas, evaluations, needs, contacts, readiness, reports, declined, log] = await Promise.all([
    repo.listThreads(),
    repo.listPosts(),
    repo.listIdeas(),
    repo.listEvaluations(),
    repo.listNeeds(),
    repo.listContacts(),
    repo.listReadiness(),
    repo.listReports(),
    repo.listDeclinedForReview(),
    repo.listScreeningLog(now),
  ]);
  const keptTexts = log.filter((entry) => entry.text !== null && entry.reviewed_at === null && entry.ref === null);
  const count = <T extends { created_at: string }>(key: QueueKey, all: T[], waiting: (item: T) => boolean): QueueCount => {
    const open = all.filter(waiting);
    return { key, waiting: open.length, fresh: open.filter((item) => isFresh(item.created_at, since)).length };
  };
  return [
    // A conversation is new since the last visit when its last message came after it.
    {
      key: "threads",
      waiting: threads.filter(waitsForRops).length,
      fresh: threads.filter((thread) => waitsForRops(thread) && isFresh(thread.updated_at, since)).length,
    },
    count("partnerships", posts, (item) => item.moderation.status === "do-weryfikacji"),
    count("ideas", ideas, (item) => item.moderation.status === "do-weryfikacji" || item.status === "nowy"),
    count("evaluations", evaluations, (item) => item.moderation.status === "do-weryfikacji" || (item.test_signup !== null && item.forwarded_at === null)),
    count("needs", needs, (item) => item.moderation.status === "do-weryfikacji"),
    count("contacts", contacts, (item) => item.status === "nowe"),
    count("readiness", readiness, (item) => item.verification.status === "niezweryfikowane"),
    count("reports", reports, (item) => item.moderation.status === "do-weryfikacji"),
    {
      key: "declined",
      waiting: declined.length + keptTexts.length,
      fresh: declined.filter((route) => isFresh(route.created_at, since)).length + keptTexts.filter((entry) => isFresh(entry.at, since)).length,
    },
  ];
}

/** The content reports and the declined texts that wait for review (FR-12.8, FR-12.9). */
export async function reviewQueue(repo: Repository = repository(), now = Date.now()) {
  const [reports, declined, log] = await Promise.all([repo.listReports(), repo.listDeclinedForReview(), repo.listScreeningLog(now)]);
  // A declined route is reviewed through the route; its log entry points to it (ref).
  const kept = log.filter((entry) => entry.text !== null && entry.reviewed_at === null && entry.ref === null);
  return { reports, declined, kept };
}

// ------------------------------------------------------------- trends (II)

export interface Tally {
  key: string;
  count: number;
}

function tally(keys: string[]): Tally[] {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "pl"));
}

/** The Monday of the week of an instant, as YYYY-MM-DD in UTC. */
export function weekStart(iso: string): string {
  const day = new Date(iso);
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return day.toISOString().slice(0, 10);
}

/** The key of the items without a target group in the group trends and the questions filter. */
export const NO_GROUP = "bez-grupy";

const groupsOf = (groups: string[]) => (groups.length > 0 ? groups : [NO_GROUP]);

/** The routes that answer a question about a need; a declined text or another purpose asks for nothing. */
const isQuestion = (mode: Route["mode"]) => mode !== "declined" && mode !== "off_topic";

export interface Trends {
  /** The questions asked of the route, by the target groups they are about; a question counts in each of its groups. */
  questionsByGroup: Tally[];
  needsByGroup: Tally[];
  needsByPowiat: Tally[];
  needsByWeek: Tally[];
  ideasByGroup: Tally[];
  ideasByStage: Tally[];
  routesByMode: Tally[];
  /** Innovation ids, most recommended first. */
  topRecommended: Tally[];
  /** Innovation ids with their number of ratings and average, most rated first. */
  rated: { id: string; ratings: number; average: number; testers: number }[];
  totals: { needs: number; ideas: number; evaluations: number; routes: number; contacts: number; questions: number };
}

const WEEKS = 12;
const TOP = 10;

/** The demand signal of module II: needs, ideas and evaluations aggregated by area, place and time. */
export async function trends(repo: Repository = repository()): Promise<Trends> {
  const [needs, ideas, evaluations, routes, contacts] = await Promise.all([
    repo.listNeeds(),
    repo.listIdeas(),
    repo.listEvaluations(),
    repo.listRouteFacts(),
    repo.listContacts(),
  ]);
  const gminy = catalogue().gminaByTerc;
  const asked = routes.filter((route) => isQuestion(route.mode));

  const weeks = tally(needs.map((need) => weekStart(need.created_at))).sort((a, b) => a.key.localeCompare(b.key));
  const counted = evaluations.filter((item) => item.moderation.status !== "odrzucone");
  const byInnovation = new Map<string, Evaluation[]>();
  for (const item of counted) byInnovation.set(item.innovation_id, [...(byInnovation.get(item.innovation_id) ?? []), item]);
  const rated = [...byInnovation].map(([id, items]) => {
    const ratings = items.flatMap((item) => (item.rating === null ? [] : [item.rating]));
    return {
      id,
      ratings: ratings.length,
      average: ratings.length > 0 ? Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10 : 0,
      testers: items.filter((item) => item.test_signup !== null).length,
    };
  });

  return {
    questionsByGroup: tally(asked.flatMap((route) => groupsOf(route.target_groups))),
    needsByGroup: tally(needs.flatMap((need) => groupsOf(need.target_groups))),
    needsByPowiat: tally(needs.map((need) => gminy.get(need.place_terc ?? "")?.powiat ?? "bez-miejsca")).slice(0, TOP),
    needsByWeek: weeks.slice(-WEEKS),
    ideasByGroup: tally(ideas.flatMap((idea) => groupsOf(idea.target_groups))),
    ideasByStage: tally(ideas.map((idea) => idea.stage)),
    routesByMode: tally(routes.map((route) => route.mode)),
    topRecommended: tally(routes.flatMap((route) => route.solution_ids)).slice(0, TOP),
    rated: rated.sort((a, b) => b.ratings + b.testers - (a.ratings + a.testers) || b.average - a.average).slice(0, TOP),
    totals: { needs: needs.length, ideas: ideas.length, evaluations: counted.length, routes: routes.length, contacts: contacts.length, questions: asked.length },
  };
}

export interface QuestionFilter {
  /** A target group code, or NO_GROUP for the questions without one. */
  group?: string;
  /** First and last day, YYYY-MM-DD in Polish time, both included. */
  from?: string;
  to?: string;
}

/** The questions behind questionsByGroup, newest first, narrowed to a group and a date range. */
export async function questions(filter: QuestionFilter = {}, repo: Repository = repository()): Promise<Route[]> {
  const routes = await repo.listRoutes();
  return routes.filter((route) => {
    const day = warsawDay(route.created_at);
    return (
      isQuestion(route.mode) &&
      (!filter.group || groupsOf(questionGroups(route)).includes(filter.group)) &&
      (!filter.from || day >= filter.from) &&
      (!filter.to || day <= filter.to)
    );
  });
}

// --------------------------------------------------------- CSV (FR-9.2)

export const EXPORT_KINDS = ["needs", "ideas", "evaluations", "contacts", "readiness"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export function isExportKind(value: string): value is ExportKind {
  return (EXPORT_KINDS as readonly string[]).includes(value);
}

/**
 * One cell: quoted when it holds the separator, a quote or a line break; a
 * text that starts like a formula gets a leading apostrophe, so a
 * spreadsheet never runs what a submitter typed.
 */
export function csvCell(value: string | number | boolean | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[;"\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** UTF-8 with a BOM and the semicolon, so Polish Excel opens it with its characters (FR-9.2). */
export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

const moderationColumns = ["moderacja", "decyzja_kto", "decyzja_kiedy", "powod"];
const moderationCells = (item: { moderation: Need["moderation"] }) => [
  item.moderation.status,
  item.moderation.reviewer,
  item.moderation.decided_at,
  item.moderation.reason_pl,
];

export async function exportRows(kind: ExportKind, repo: Repository = repository()): Promise<(string | number | boolean | null)[][]> {
  const gmina = (terc: string | null) => (terc ? (catalogue().gminaByTerc.get(terc)?.name ?? terc) : null);
  switch (kind) {
    case "needs": {
      const items: Need[] = await repo.listNeeds();
      return [
        ["id", "utworzono", "gmina", "rola", "grupy", "status", "streszczenie", "opis", "email", "zgoda_publikacja", ...moderationColumns, "notatka"],
        ...items.map((item) => [
          item.id, item.created_at, gmina(item.place_terc), item.role, item.target_groups.join(", "), item.status,
          item.summary_pl, item.problem_text, item.reporter.email, item.consents.publish_anonymised, ...moderationCells(item), item.note_pl,
        ]),
      ];
    }
    case "ideas": {
      const items: Idea[] = await repo.listIdeas();
      return [
        ["id", "utworzono", "rodzaj", "nazwa", "opis", "istota", "dla_kogo", "grupy", "etap", "gmina", "autor", "organizacja", "email", "zgoda_publikacja", "status", "odpowiedz", ...moderationColumns, "notatka"],
        ...items.map((item) => [
          item.id, item.created_at, item.kind, item.title, item.description, item.essence, item.for_whom, item.target_groups.join(", "),
          item.stage, gmina(item.place_terc), item.author.display_name, item.author.is_organisation, item.author.email, item.consents.publish,
          item.status, item.reply?.text_pl ?? null, ...moderationCells(item), item.note_pl,
        ]),
      ];
    }
    case "evaluations": {
      const items: Evaluation[] = await repo.listEvaluations();
      const title = (id: string) => catalogue().innovationById.get(id)?.title ?? id;
      return [
        ["id", "utworzono", "innowacja", "tytul", "ocena", "skad_zna", "opinia", "usprawnienie", "testy", "gmina_testow", "autor", "email", "przekazano", ...moderationColumns, "notatka"],
        ...items.map((item) => [
          item.id, item.created_at, item.innovation_id, title(item.innovation_id), item.rating, item.experience, item.feedback, item.improvement,
          item.test_signup?.as ?? null, gmina(item.test_signup?.place_terc ?? null), item.author.display_name, item.author.email,
          item.forwarded_at, ...moderationCells(item), item.note_pl,
        ]),
      ];
    }
    case "contacts": {
      const items: ContactRequest[] = await repo.listContacts();
      return [
        ["id", "utworzono", "adresat", "adresat_id", "imie", "organizacja", "email", "wiadomosc", "status", ...moderationColumns, "notatka"],
        ...items.map((item) => [
          item.id, item.created_at, item.target.type, item.target.id, item.requester.name, item.requester.organisation, item.requester.email,
          item.message, item.status, ...moderationCells(item), item.note_pl,
        ]),
      ];
    }
    case "readiness": {
      const items: Readiness[] = await repo.listReadiness();
      return [
        ["id", "utworzono", "nazwa", "organizacja", "gmina", "tematy", "kanal", "kontakt", "zgoda_na_nazwe", "weryfikacja", "kto", "kiedy", "przechowywac_do", "notatka"],
        ...items.map((item) => [
          item.id, item.created_at, item.display_name, item.is_organisation, gmina(item.place_terc), item.topics.join(", "), item.channel.type,
          item.channel.value, item.consent_display_name, item.verification.status, item.verification.reviewer, item.verification.decided_at,
          item.retention_until, item.note_pl,
        ]),
      ];
    }
  }
}
