import { catalogue } from "@/lib/catalogue";
import type { ContactRequest, Evaluation, Idea, Need, Readiness, Route } from "@/lib/contracts";
import { warsawDay } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { reportReasons } from "@/lib/reports";
import { repository, type Repository } from "@/server/db";
import { questionGroups } from "@/server/db/repository";
import { canvasSections } from "@/lib/canvas";
import { waitsForRops } from "@/server/threads/access";
import { ideaForm, type IdeaForm } from "./labels";

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

// ------------------------------------------------------- "Do zrobienia"

/** One entry that waits for a person at ROPS, for the dashboard's single list. */
export interface TodoItem {
  key: QueueKey;
  id: string;
  summary: string;
  /** Since when it waits: its creation, or for a conversation the author's last message. */
  since: string;
  href: string;
}

/** Working days a reply may take before an entry is "po terminie". */
export const OVERDUE_WORKING_DAYS = 5;

/** Monday to Friday between two days in Poland, the first not counted; public holidays are not known here. */
export function workingDaysBetween(from: string, to: string): number {
  let days = 0;
  const day = new Date(`${warsawDay(from)}T12:00:00Z`);
  const end = new Date(`${warsawDay(to)}T12:00:00Z`);
  while (day < end) {
    day.setUTCDate(day.getUTCDate() + 1);
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days;
}

const firstLine = (text: string, max = 110) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
};

/**
 * Everything that waits for a person at ROPS, oldest first, across the
 * queues of queueCounts and on the same conditions, each with a link to the
 * entry itself (the item's page, or its place in its queue's list).
 */
export async function todoList(repo: Repository = repository(), now = Date.now()): Promise<TodoItem[]> {
  const [threads, posts, ideas, evaluations, needs, contacts, readiness, review] = await Promise.all([
    repo.listThreads(),
    repo.listPosts(),
    repo.listIdeas(),
    repo.listEvaluations(),
    repo.listNeeds(),
    repo.listContacts(),
    repo.listReadiness(),
    reviewQueue(repo, now),
  ]);
  const title = (id: string) => catalogue().innovationById.get(id)?.title ?? id;
  const items: TodoItem[] = [
    ...threads.filter(waitsForRops).map((thread) => ({
      key: "threads" as const,
      id: thread.id,
      summary: thread.subject,
      since: [...thread.messages].reverse().find((message) => message.author !== "rops")?.at ?? thread.updated_at,
      href: `/rops/rozmowy/${thread.id}`,
    })),
    ...posts.filter((post) => post.moderation.status === "do-weryfikacji").map((post) => ({ key: "partnerships" as const, id: post.id, summary: post.title, since: post.created_at, href: `/rops/partnerstwa#wpis-${post.id}` })),
    ...ideas
      .filter((idea) => idea.moderation.status === "do-weryfikacji" || idea.status === "nowy")
      .map((idea) => ({ key: "ideas" as const, id: idea.id, summary: idea.title, since: idea.created_at, href: `/rops/pomysly/${idea.id}` })),
    ...evaluations
      .filter((item) => item.moderation.status === "do-weryfikacji" || (item.test_signup !== null && item.forwarded_at === null))
      .map((item) => ({ key: "evaluations" as const, id: item.id, summary: title(item.innovation_id), since: item.created_at, href: `/rops/opinie#wpis-${item.id}` })),
    ...needs
      .filter((need) => need.moderation.status === "do-weryfikacji")
      .map((need) => ({ key: "needs" as const, id: need.id, summary: firstLine(need.summary_pl ?? need.problem_text), since: need.created_at, href: `/rops/potrzeby#wpis-${need.id}` })),
    ...contacts
      .filter((item) => item.status === "nowe")
      .map((item) => ({ key: "contacts" as const, id: item.id, summary: firstLine(item.message), since: item.created_at, href: `/rops/kontakty#wpis-${item.id}` })),
    ...readiness
      .filter((item) => item.verification.status === "niezweryfikowane")
      .map((item) => ({ key: "readiness" as const, id: item.id, summary: item.display_name, since: item.created_at, href: `/rops/gotowosc#wpis-${item.id}` })),
    ...review.reports
      .filter((report) => report.moderation.status === "do-weryfikacji")
      .map((report) => ({ key: "reports" as const, id: report.id, summary: firstLine(report.comment ?? `${t(reportReasons[report.reason])}: ${report.target.id}`), since: report.created_at, href: `/rops/zgloszenia#wpis-${report.id}` })),
    ...review.declined.map((route) => ({
      key: "declined" as const,
      id: route.id,
      summary: firstLine(route.input.problem_text ?? route.id),
      since: route.created_at,
      href: `/rops/zgloszenia#wpis-${route.id}`,
    })),
    ...review.kept.map((entry) => ({ key: "declined" as const, id: entry.id, summary: firstLine(entry.text ?? entry.id), since: entry.at, href: `/rops/zgloszenia#wpis-${entry.id}` })),
  ];
  return items.sort((a, b) => a.since.localeCompare(b.since));
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
  /** The count of the previous period of the same length, when a period is chosen. */
  previous?: number;
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

/** The periods of the trends (?okres=); each but "calosc" is compared with the period of the same length before it. */
export const TREND_RANGES = ["30-dni", "3-miesiace", "12-miesiecy", "calosc"] as const;
export type TrendRange = (typeof TREND_RANGES)[number];

const RANGE_DAYS: Record<Exclude<TrendRange, "calosc">, number> = { "30-dni": 30, "3-miesiace": 91, "12-miesiecy": 365 };

/** The days of a period, YYYY-MM-DD in Polish time, both ends included; `from` is null for the whole time. */
export interface TrendPeriod {
  range: TrendRange;
  from: string | null;
  to: string;
  previous: { from: string; to: string } | null;
  /** The step of the timeline: weeks up to three months, months beyond. */
  grain: "week" | "month";
}

/** A day plus or minus days, on YYYY-MM-DD. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function trendPeriod(range: TrendRange, now = Date.now()): TrendPeriod {
  const to = warsawDay(new Date(now).toISOString());
  if (range === "calosc") return { range, from: null, to, previous: null, grain: "month" };
  const days = RANGE_DAYS[range];
  const from = addDays(to, -(days - 1));
  return { range, from, to, previous: { from: addDays(from, -days), to: addDays(from, -1) }, grain: days > 91 ? "month" : "week" };
}

const within = (createdAt: string, from: string | null, to: string) => {
  const day = warsawDay(createdAt);
  return (from === null || day >= from) && day <= to;
};

/** The Monday of the week of a day, on YYYY-MM-DD. */
const mondayOf = (day: string) => weekStart(`${day}T12:00:00Z`);

/**
 * The timeline of a period, every step from its first day (or the first
 * entry) to its last, empty steps included, so a quiet week shows as one.
 */
function timeline(days: string[], period: TrendPeriod): Tally[] {
  const first = period.from ?? [...days].sort()[0];
  if (!first) return [];
  const step = period.grain === "week" ? mondayOf : (day: string) => day.slice(0, 7);
  const counts = tally(days.map(step));
  const keys: string[] = [];
  for (let day = first; day <= period.to; day = addDays(day, 1)) {
    const key = step(day);
    if (keys.at(-1) !== key) keys.push(key);
  }
  return keys.map((key) => ({ key, count: counts.find((row) => row.key === key)?.count ?? 0 }));
}

/** A tally of the period with the counts of the previous period beside it, including the keys that fell to zero. */
function compared<T extends { created_at: string }>(items: T[], period: TrendPeriod, keysOf: (item: T) => string[]): Tally[] {
  const current = tally(items.filter((item) => within(item.created_at, period.from, period.to)).flatMap(keysOf));
  if (!period.previous) return current;
  const { from, to } = period.previous;
  const before = tally(items.filter((item) => within(item.created_at, from, to)).flatMap(keysOf));
  const gone = before.filter((row) => !current.some((item) => item.key === row.key)).map((row) => ({ key: row.key, count: 0 }));
  return [...current, ...gone].map((row) => ({ ...row, previous: before.find((item) => item.key === row.key)?.count ?? 0 }));
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
  /** Needs per step of the period's timeline: Mondays (YYYY-MM-DD) or months (YYYY-MM). */
  needsOverTime: Tally[];
  period: TrendPeriod;
  ideasByGroup: Tally[];
  ideasByStage: Tally[];
  /** The ideas by how they were sent: the short form or the CANVAS application. */
  ideasByForm: Tally[];
  routesByMode: Tally[];
  /** Innovation ids, most recommended first. */
  topRecommended: Tally[];
  /** Innovation ids with their number of ratings and average, most rated first. */
  rated: { id: string; ratings: number; average: number; testers: number }[];
  totals: { needs: number; ideas: number; evaluations: number; routes: number; contacts: number; questions: number };
}

const TOP = 10;

/** The powiat key of a need: the powiat of its gmina, or NO_PLACE. */
export const NO_PLACE = "bez-miejsca";
const powiatOf = (placeTerc: string | null) => catalogue().gminaByTerc.get(placeTerc ?? "")?.powiat ?? NO_PLACE;

/**
 * The demand signal of module II: needs, ideas and evaluations aggregated
 * by area, place and time; the demonstration data, when the store holds
 * it, counts like any entry (the panel's notice says so).
 */
export async function trends(repo: Repository = repository(), range: TrendRange = "calosc", now = Date.now()): Promise<Trends> {
  const [needs, ideas, evaluations, routes, contacts] = await Promise.all([
    repo.listNeeds(),
    repo.listIdeas(),
    repo.listEvaluations(),
    repo.listRouteFacts(),
    repo.listContacts(),
  ]);
  const period = trendPeriod(range, now);
  const inPeriod = <T extends { created_at: string }>(items: T[]) => items.filter((item) => within(item.created_at, period.from, period.to));
  const asked = routes.filter((route) => isQuestion(route.mode));

  const counted = inPeriod(evaluations.filter((item) => item.moderation.status !== "odrzucone"));
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
    questionsByGroup: compared(asked, period, (route) => groupsOf(route.target_groups)),
    needsByGroup: compared(needs, period, (need) => groupsOf(need.target_groups)),
    needsByPowiat: compared(needs, period, (need) => [powiatOf(need.place_terc)]).slice(0, TOP),
    needsOverTime: timeline(
      needs.map((need) => warsawDay(need.created_at)),
      period,
    ),
    ideasByGroup: compared(ideas, period, (idea) => groupsOf(idea.target_groups)),
    ideasByStage: compared(ideas, period, (idea) => [idea.stage]),
    ideasByForm: compared(ideas, period, (idea) => [ideaForm(idea)]),
    routesByMode: compared(routes, period, (route) => [route.mode]),
    topRecommended: compared(routes, period, (route) => route.solution_ids).slice(0, TOP),
    rated: rated.sort((a, b) => b.ratings + b.testers - (a.ratings + a.testers) || b.average - a.average).slice(0, TOP),
    period,
    totals: {
      needs: inPeriod(needs).length,
      ideas: inPeriod(ideas).length,
      evaluations: counted.length,
      routes: inPeriod(routes).length,
      contacts: inPeriod(contacts).length,
      questions: inPeriod(asked).length,
    },
  };
}

/** What the needs queue can be narrowed to from a bar of the trends. */
export interface NeedTrendFilter {
  /** A target group code, or NO_GROUP. */
  group?: string;
  /** A powiat's name, or NO_PLACE. */
  powiat?: string;
  from?: string;
  to?: string;
}

/** The needs behind a bar of the trends: by group, powiat and days in Polish time, both ends included. */
export function filterNeeds(needs: Need[], filter: NeedTrendFilter): Need[] {
  return needs.filter(
    (need) =>
      (!filter.group || groupsOf(need.target_groups).includes(filter.group)) &&
      (!filter.powiat || powiatOf(need.place_terc) === filter.powiat) &&
      within(need.created_at, filter.from ?? null, filter.to ?? "9999-12-31"),
  );
}

/** What the ideas list can be narrowed to from a bar of the trends. */
export interface IdeaTrendFilter {
  group?: string;
  stage?: string;
  form?: IdeaForm;
  from?: string;
  to?: string;
}

export function filterIdeas(ideas: Idea[], filter: IdeaTrendFilter): Idea[] {
  return ideas.filter(
    (idea) =>
      (!filter.group || groupsOf(idea.target_groups).includes(filter.group)) &&
      (!filter.stage || idea.stage === filter.stage) &&
      (!filter.form || ideaForm(idea) === filter.form) &&
      within(idea.created_at, filter.from ?? null, filter.to ?? "9999-12-31"),
  );
}

/** The powiaty of Małopolska, in Polish order, for the needs filter. */
export function powiaty(): string[] {
  return [...new Set([...catalogue().gminaByTerc.values()].map((gmina) => gmina.powiat))].sort((a, b) => a.localeCompare(b, "pl"));
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

/** How many records of the demonstration data the store holds (src/server/db/demo.ts): the panel's banner. */
export async function demoCount(repo: Repository = repository()): Promise<number> {
  const lists: { demo?: boolean }[][] = await Promise.all([
    repo.listRouteFacts(),
    repo.listNeeds(),
    repo.listIdeas(),
    repo.listEvaluations(),
    repo.listContacts(),
    repo.listReadiness(),
    repo.listThreads(),
    repo.listPosts(),
    repo.listMentors(),
    repo.listReports(),
  ]);
  return lists.reduce((sum, list) => sum + list.filter((item) => item.demo).length, 0);
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

/** A CANVAS application's answers in one cell, a line per answer: "Problem: Intensywność ...: Bardzo poważny problem". */
function canvasCell(idea: Idea): string | null {
  if (!idea.canvas) return null;
  return canvasSections(idea.canvas)
    .flatMap((section) => section.rows.map((row) => `${section.title}: ${row.label} ${row.value}`))
    .join("\n");
}

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
        ["id", "utworzono", "rodzaj", "forma", "nazwa", "opis", "istota", "dla_kogo", "grupy", "etap", "gmina", "autor", "organizacja", "email", "zgoda_publikacja", "status", "odpowiedz", ...moderationColumns, "notatka", "canvas"],
        ...items.map((item) => [
          item.id, item.created_at, item.kind, ideaForm(item), item.title, item.description, item.essence, item.for_whom, item.target_groups.join(", "),
          item.stage, gmina(item.place_terc), item.author.display_name, item.author.is_organisation, item.author.email, item.consents.publish,
          item.status, item.reply?.text_pl ?? null, ...moderationCells(item), item.note_pl, canvasCell(item),
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
