import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type {
  ContactRequest,
  ContentReport,
  Evaluation,
  EvaluationExperience,
  Idea,
  IdeaKind,
  IdeaSimilar,
  IdeaStage,
  IdeaStatus,
  Mentor,
  Moderation,
  ModerationLogEntry,
  Need,
  NeedStatus,
  PartnershipPost,
  Readiness,
  ReportReason,
  Route,
  Sector,
  TesterRole,
  Thread,
  ThreadMessage,
  ThreadTopic,
} from "@/lib/contracts";
import { CONSENT_VERSION } from "./examples";
import type { MemoryState } from "./memory";
import { storableRoute } from "./repository";

/*
 * The demonstration data of the ROPS panel (DEMO_DATA=true, docs/storage.md):
 * a simulated twelve-week pilot in Małopolska, so the trends of module II
 * and the queues of module VI show what the panel looks like in operation.
 * A fresh store gets it beside the examples of examples.ts; a store that
 * exists keeps what it has. Every record carries `demo: true`: the panel
 * marks it and its trends can leave it out, and the public pages and the
 * route skip it (decision of the jury demo: panel only).
 *
 * The material is real where it can be: the questions of
 * data/curated/demo-questions.yaml with the routes the pipeline computed
 * for them (data/built/demo-routes.json, `pnpm demo:routes`), and the
 * hand-written texts of data/curated/demo-records.yaml. Only the
 * timeline is simulated: when each record came, and what ROPS decided. A
 * seeded generator draws it, so every reset gives the same data, with the
 * dates counted back from the moment the store starts.
 */

const QUESTIONS_FILE = path.join("data", "curated", "demo-questions.yaml");
const RECORDS_FILE = path.join("data", "curated", "demo-records.yaml");
const RUNS_FILE = path.join("data", "built", "demo-routes.json");

const SEED = "demo-pilot";
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const WEEKS = 12;
/** Questions per week, oldest first: a summer start, then growth once the schools and the offices are back. */
const WEEK_WEIGHTS = [0.45, 0.55, 0.5, 0.45, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3];
/** Sunday first, as getDay counts. */
const WEEKDAY_WEIGHTS = [0.25, 1, 1.1, 1, 1, 0.8, 0.35];
const HOUR_WEIGHTS = [0.02, 0.01, 0.01, 0.01, 0.01, 0.02, 0.05, 0.2, 0.5, 0.8, 1, 1, 0.9, 0.9, 0.8, 0.7, 0.6, 0.6, 0.7, 0.7, 0.6, 0.4, 0.2, 0.08];
/** Homelessness has 20 questions on two catalogue items; real demand asks it less often. */
const HOMELESSNESS_KEPT = 8;
/** Questions about seniors and about families that a second person asks again later. */
const REPEATS_PER_GROUP = 10;
/** Share of the answered questions whose asker saved the need to the needs bank. */
const NEED_SHARE = 0.38;
/** Entries younger than this may still wait for a decision; most of those younger than two days do. */
const WAITING_DAYS = 5;

const ROPS_NAME = "Dział Innowacji Społecznych ROPS";
const REVIEWERS = ["Opiekunka kategorii seniorzy", "Opiekun kategorii rynek pracy", "Koordynatorka panelu"];

// ------------------------------------------------------------- the sources

interface BankQuestion {
  id: string;
  category?: string;
  place_terc: string;
}

interface RunEntry {
  question_id: string;
  route: Route;
  nearest?: IdeaSimilar[] | null;
}

type Named = { display_name: string };

interface DemoRecords {
  ideas: {
    id: string;
    kind: IdeaKind;
    stage: IdeaStage;
    target_groups: string[];
    author: Named & { is_organisation: boolean };
    title: string;
    description: string;
    essence: string;
    for_whom: string;
    reply_pl: string | null;
  }[];
  contacts: { id: string; target: "innovation" | "advisor"; group: string; requester: { name: string; organisation: string | null }; message: string }[];
  readiness: { id: string; display_name: string; topics: string[] }[];
  mentors: { id: string; name: string; expertise_pl: string; target_groups: string[] }[];
  posts: {
    id: string;
    kind: PartnershipPost["kind"];
    sector: Sector;
    seeking: Sector[];
    target_groups: string[];
    author: Named & { organisation: string | null };
    title: string;
    description: string;
  }[];
  threads: {
    id: string;
    topic: ThreadTopic;
    subject: string;
    author: Named & { organisation: string | null; sector: Sector };
    target_groups: string[];
    mentor: string | null;
    post: string | null;
    messages: { author: ThreadMessage["author"]; text: string }[];
  }[];
  reports: { id: string; target: ContentReport["target"]["type"]; reason: ReportReason; comment: string | null }[];
  moderation_reasons_pl: string[];
  notes_pl: string[];
  evaluations: {
    id: string;
    innovation_id: string;
    rating: number | null;
    experience: EvaluationExperience | null;
    feedback: string | null;
    improvement: string | null;
    test_signup: { as: TesterRole } | null;
    author: Named | null;
  }[];
}

export interface DemoSources {
  questions: BankQuestion[];
  /** The computed route of each question and declined input, by its id in the bank. */
  runs: Map<string, RunEntry>;
  ideaSimilar: Record<string, IdeaSimilar[]>;
  records: DemoRecords;
}

/** The three files, or null with a log line naming what is missing. */
export function readDemoSources(root = process.cwd()): DemoSources | null {
  // Read at run time from the checkout, like the rest of data/: the build traces none of it.
  const at = (file: string) => path.join(/*turbopackIgnore: true*/ root, file);
  const missing = [QUESTIONS_FILE, RECORDS_FILE, RUNS_FILE].filter((file) => !existsSync(/*turbopackIgnore: true*/ at(file)));
  if (missing.length > 0) {
    console.warn(`[store] DEMO_DATA is set, but ${missing.join(", ")} is missing (pnpm demo:routes builds the routes); no demonstration data`);
    return null;
  }
  const read = (file: string) => readFileSync(/*turbopackIgnore: true*/ at(file), "utf8");
  const runs = JSON.parse(read(RUNS_FILE)) as { entries: RunEntry[]; idea_similar?: Record<string, IdeaSimilar[]> };
  return {
    questions: (parse(read(QUESTIONS_FILE)) as { questions: BankQuestion[] }).questions,
    runs: new Map(runs.entries.map((entry) => [entry.question_id, entry])),
    ideaSimilar: runs.idea_similar ?? {},
    records: parse(read(RECORDS_FILE)) as DemoRecords,
  };
}

// ------------------------------------------------------------- randomness

/** mulberry32 seeded from a string: the same draws on every machine. */
function seeded(seed: string): () => number {
  let state = createHash("sha256").update(seed).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const warsaw = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hour: "numeric", hourCycle: "h23", weekday: "short" });
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

class Draw {
  private readonly random: () => number;
  private readonly ids = new Set<string>();

  constructor(
    seed: string,
    readonly now: number,
  ) {
    this.random = seeded(seed);
  }

  /** The start of the simulated pilot. */
  get start() {
    return this.now - WEEKS * 7 * DAY;
  }

  chance(probability: number) {
    return this.random() < probability;
  }

  between(min: number, max: number) {
    return min + this.random() * (max - min);
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.random() * items.length)];
  }

  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  id(prefix: string): string {
    for (;;) {
      const id = `${prefix}-demo-${Math.floor(this.random() * 0xffffff).toString(16).padStart(6, "0")}`;
      if (!this.ids.has(id)) {
        this.ids.add(id);
        return id;
      }
    }
  }

  hash(): string {
    return createHash("sha256").update(String(this.random())).digest("hex");
  }

  /**
   * An instant between `from` and `to` (by default the whole pilot up to a
   * few minutes ago), more likely in the later weeks, on weekdays and in
   * the day's busy hours of Polish time; null when the range is empty.
   */
  when(from = this.start, to = this.now - 10 * 60 * 1000): number | null {
    const lo = Math.max(from, this.start);
    const hi = Math.min(to, this.now - 60 * 1000);
    if (hi <= lo) return null;
    for (let attempt = 0; attempt < 200; attempt++) {
      const at = this.between(lo, hi);
      const week = Math.min(WEEKS - 1, Math.max(0, Math.floor((at - this.start) / (7 * DAY))));
      const parts = Object.fromEntries(warsaw.formatToParts(at).map((part) => [part.type, part.value]));
      const weight = (WEEK_WEIGHTS[week] / 1.3) * (WEEKDAY_WEIGHTS[WEEKDAYS.indexOf(parts.weekday)] / 1.1) * HOUR_WEIGHTS[Number(parts.hour)];
      if (this.random() < weight) return Math.round(at);
    }
    return Math.round(this.between(lo, hi));
  }
}

const iso = (at: number) => new Date(at).toISOString();
const yearAfter = (at: number) => {
  const until = new Date(at);
  until.setUTCFullYear(until.getUTCFullYear() + 1);
  return until.toISOString().slice(0, 10);
};
const isPerson = (name: string) => /^\p{Lu}\p{Ll}+ \p{Lu}\.$/u.test(name);
const byNewest = <T>(time: (item: T) => string) => (a: T, b: T) => Date.parse(time(b)) - Date.parse(time(a));

// --------------------------------------------------------------- the build

export interface DemoSet {
  routes: Route[];
  needs: Need[];
  ideas: Idea[];
  evaluations: Evaluation[];
  contacts: ContactRequest[];
  readiness: Readiness[];
  mentors: Mentor[];
  posts: PartnershipPost[];
  threads: Thread[];
  reports: ContentReport[];
  log: ModerationLogEntry[];
}

/** The simulated pilot as of `now`; the same sources and `now` give the same set. */
export function buildDemo(sources: DemoSources, now: number): DemoSet {
  const draw = new Draw(SEED, now);
  const { records } = sources;
  const log: ModerationLogEntry[] = [];
  const reviewer = () => draw.pick(REVIEWERS);
  const reason = () => draw.pick(records.moderation_reasons_pl);
  const note = (probability: number) => (draw.chance(probability) ? draw.pick(records.notes_pl) : null);
  const consent = (at: number) => ({ text_version: CONSENT_VERSION, timestamp: iso(at) });

  // A person keeps one gmina in every section; an organisation type is a different one each time.
  const placesOfPeople = new Map<string, string>();
  const anyPlace = () => draw.pick(sources.questions).place_terc;
  const placeOf = (name: string) => {
    if (!isPerson(name)) return anyPlace();
    const known = placesOfPeople.get(name) ?? anyPlace();
    placesOfPeople.set(name, known);
    return known;
  };

  /** ROPS's decision some working hours after `at`, or null while the entry is young or the decision would lie ahead. */
  const decision = (at: number, minHours = 3, maxDays = 4) => {
    const age = (now - at) / DAY;
    if ((age < 2 && draw.chance(0.85)) || (age < WAITING_DAYS && draw.chance(0.35))) return null;
    const when = draw.when(at + minHours * HOUR, at + maxDays * DAY);
    return when === null ? null : { at: when, reviewer: reviewer() };
  };
  const logged = (
    done: { at: number; reviewer: string },
    target_type: ModerationLogEntry["target_type"],
    target_id: string,
    action: ModerationLogEntry["action"],
    extra: Partial<Pick<ModerationLogEntry, "status" | "reason_pl" | "note_pl">> = {},
  ) => log.push({ ts: iso(done.at), reviewer: done.reviewer, target_type, target_id, action, status: null, reason_pl: null, note_pl: null, ...extra });
  const moderated = (
    at: number,
    target_type: ModerationLogEntry["target_type"],
    target_id: string,
    rejectShare: number,
  ): Moderation => {
    const done = decision(at);
    if (!done) return { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null };
    const rejected = draw.chance(rejectShare);
    const reason_pl = rejected ? reason() : null;
    logged(done, target_type, target_id, rejected ? "odrzucone" : "zatwierdzone", { reason_pl });
    return { status: rejected ? "odrzucone" : "zatwierdzone", reviewer: done.reviewer, decided_at: iso(done.at), reason_pl };
  };

  // ---- questions: every bank question once, homelessness thinned, some seniors' and families' questions asked again.
  const bank = sources.questions.filter((question) => sources.runs.has(question.id));
  const homeless = draw.shuffle(bank.filter((question) => question.category === "bezdomnosc")).slice(HOMELESSNESS_KEPT);
  const repeats = ["seniorzy", "dzieci-mlodziez-rodziny"].flatMap((group) =>
    draw.shuffle(bank.filter((question) => question.category === group)).slice(0, REPEATS_PER_GROUP),
  );
  const declinedInputs = [...sources.runs.keys()].filter((id) => !bank.some((question) => question.id === id));
  const asked = [...bank.filter((question) => !homeless.includes(question)).map((question) => question.id), ...repeats.map((question) => question.id), ...declinedInputs];

  const routes: Route[] = [];
  const routeOf = new Map<string, string>(); // route id -> question id
  for (const questionId of asked) {
    const at = draw.when();
    if (at === null) continue;
    const run = sources.runs.get(questionId)!;
    const route = storableRoute({ ...structuredClone(run.route), id: draw.id("rt"), created_at: iso(at), demo: true });
    routes.push(route);
    routeOf.set(route.id, questionId);
  }

  // ---- needs: saved from a part of the answered questions, not from the declined inputs.
  const needs: Need[] = [];
  const needOfRoute = new Map<string, string>();
  for (const route of routes) {
    const questionId = routeOf.get(route.id)!;
    if (declinedInputs.includes(questionId) || !["route", "partial", "none"].includes(route.mode) || !route.input.problem_text) continue;
    if (!draw.chance(NEED_SHARE)) continue;
    const at = Date.parse(route.created_at) + draw.between(2, 15) * 60 * 1000;
    if (at >= now) continue;
    const id = draw.id("nd");
    const withEmail = draw.chance(0.2);
    const moderation = moderated(at, "need", id, 0.12);
    const age = (now - at) / DAY;
    const status: NeedStatus =
      age < 7 ? "nowa" : draw.pick<NeedStatus>(["w-analizie", "w-analizie", "w-analizie", "temat-naboru", "temat-naboru", "dopasowano-pozniej", "zamknieta", "nowa"]);
    if (status !== "nowa" && moderation.decided_at) {
      logged({ at: Date.parse(moderation.decided_at) + HOUR, reviewer: moderation.reviewer! }, "need", id, "status", { status });
    }
    needs.push({
      id,
      created_at: iso(at),
      route_id: route.id,
      problem_text: route.input.problem_text,
      summary_pl: route.need_summary_pl,
      place_terc: route.input.place_terc,
      role: route.input.role,
      target_groups: route.question_groups ?? [],
      domains: [],
      reporter: { name: null, organisation: null, email: withEmail ? `${id}@example.org` : null },
      consents: { store: true, publish_anonymised: draw.chance(0.65), contact: withEmail, ...consent(at) },
      status,
      moderation,
      cluster_id: null,
      nearest_matches: sources.runs.get(routeOf.get(route.id)!)?.nearest ?? [],
      brief_id: null,
      note_pl: note(0.2),
      example: false,
      demo: true,
    });
    needOfRoute.set(route.id, id);
  }

  // ---- idea cards (module III).
  const ideas: Idea[] = records.ideas.flatMap((card) => {
    const at = draw.when();
    if (at === null) return [];
    const id = draw.id("pm");
    const publish = draw.chance(0.85);
    const moderation = moderated(at, "idea", id, 0.08);
    let status: IdeaStatus = "nowy";
    let reply: Idea["reply"] = null;
    if (moderation.decided_at) {
      status = card.reply_pl ? draw.pick<IdeaStatus>(["w-analizie", "przyjety"]) : draw.pick<IdeaStatus>(["w-analizie", "w-analizie", "przyjety", "zamkniety"]);
      const done = { at: Date.parse(moderation.decided_at) + HOUR, reviewer: moderation.reviewer! };
      logged(done, "idea", id, "status", { status });
      const replied = card.reply_pl ? draw.when(done.at + HOUR, done.at + 6 * DAY) : null;
      if (card.reply_pl && replied !== null) {
        reply = { text_pl: card.reply_pl, at: iso(replied), by: ROPS_NAME };
        logged({ at: replied, reviewer: done.reviewer }, "idea", id, "odpowiedz");
      }
    }
    return [
      {
        id,
        created_at: iso(at),
        kind: card.kind,
        title: card.title,
        description: card.description,
        essence: card.essence,
        for_whom: card.for_whom,
        target_groups: card.target_groups,
        stage: card.stage,
        place_terc: placeOf(card.author.display_name),
        author: { display_name: card.author.display_name, is_organisation: card.author.is_organisation, email: `${id}@example.org` },
        consents: { store: true, publish, ...consent(at) },
        moderation,
        similar: sources.ideaSimilar[card.id] ?? null,
        status,
        reply,
        retention_until: yearAfter(at),
        note_pl: note(0.2),
        demo: true,
      },
    ];
  });

  // ---- evaluations of innovations (module IV).
  const evaluations: Evaluation[] = records.evaluations.flatMap((item) => {
    const at = draw.when();
    if (at === null) return [];
    const id = draw.id("oc");
    // A test sign-up is never rejected; ROPS passes almost every approved one on within a week.
    const moderation = moderated(at, "evaluation", id, item.test_signup ? 0 : 0.04);
    let forwarded_at: string | null = null;
    if (item.test_signup && moderation.status === "zatwierdzone" && draw.chance(0.95)) {
      const forwarded = draw.when(Date.parse(moderation.decided_at!) + HOUR, Date.parse(moderation.decided_at!) + 7 * DAY);
      if (forwarded !== null) {
        forwarded_at = iso(forwarded);
        logged({ at: forwarded, reviewer: moderation.reviewer! }, "evaluation", id, "przekazane");
      }
    }
    const name = item.author?.display_name ?? null;
    return [
      {
        id,
        created_at: iso(at),
        innovation_id: item.innovation_id,
        rating: item.rating,
        experience: item.experience,
        feedback: item.feedback,
        improvement: item.improvement,
        test_signup: item.test_signup ? { as: item.test_signup.as, place_terc: name ? placeOf(name) : anyPlace() } : null,
        author: { display_name: name, email: item.test_signup ? `${id}@example.org` : null },
        consents: { store: true, contact: item.test_signup !== null, ...consent(at) },
        moderation,
        forwarded_at,
        retention_until: yearAfter(at),
        note_pl: note(0.1),
        demo: true,
      },
    ];
  });

  // ---- contact requests, sent from a route of the asker's group.
  const answered = routes.filter((route) => route.solutions.length > 0 && !declinedInputs.includes(routeOf.get(route.id)!));
  const contacts: ContactRequest[] = records.contacts.flatMap((item) => {
    const fitting = answered.filter((route) => (route.question_groups ?? []).includes(item.group));
    const route = draw.pick(fitting.length > 0 ? fitting : answered);
    const at = Date.parse(route.created_at) + draw.between(3, 40) * 60 * 1000;
    if (at >= now) return [];
    const id = draw.id("kt");
    const done = decision(at, 2, 3);
    const rejected = done !== null && draw.chance(0.05);
    const status = done === null ? "nowe" : rejected ? "zamkniete" : draw.pick(["przekazane", "przekazane", "zamkniete"] as const);
    if (done) logged(done, "contact", id, rejected ? "odrzucone" : "zatwierdzone", { status, reason_pl: rejected ? reason() : null });
    return [
      {
        id,
        created_at: iso(at),
        route_id: route.id,
        need_id: needOfRoute.get(route.id) ?? null,
        target:
          item.target === "advisor"
            ? { type: "advisor", id: item.group }
            : { type: "innovation", id: draw.pick(route.solutions.slice(0, 3)).innovation_id },
        requester: { name: item.requester.name, organisation: item.requester.organisation, email: `${id}@example.org` },
        message: item.message,
        screening: { outcome: "need" },
        consent: consent(at),
        moderation: done
          ? { status: rejected ? "odrzucone" : "zatwierdzone", reviewer: done.reviewer, decided_at: iso(done.at), reason_pl: null }
          : { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null },
        status,
        note_pl: done ? note(0.3) : null,
        demo: true,
      },
    ];
  });

  // ---- readiness registrations (FR-6.5).
  const readiness: Readiness[] = records.readiness.flatMap((item) => {
    const at = draw.when();
    if (at === null) return [];
    const id = draw.id("gt");
    const done = decision(at);
    const rejected = done !== null && draw.chance(0.08);
    if (done) logged(done, "readiness", id, rejected ? "odrzucone" : "zweryfikowane");
    return [
      {
        id,
        created_at: iso(at),
        display_name: item.display_name,
        is_organisation: true,
        place_terc: anyPlace(),
        topics: item.topics,
        channel: { type: "email", value: `${id}@example.org` },
        consent_display_name: draw.chance(0.75),
        consent: consent(at),
        verification: done
          ? { status: rejected ? "odrzucone" : "zweryfikowane", reviewer: done.reviewer, decided_at: iso(done.at) }
          : { status: "niezweryfikowane", reviewer: null, decided_at: null },
        retention_until: yearAfter(at),
        note_pl: null,
        demo: true,
      },
    ];
  });

  // ---- mentors, partnership posts and conversations (module V).
  const mentorIds = new Map(records.mentors.map((mentor, index) => [mentor.id, `mt-demo-${index + 1}`]));
  const mentors: Mentor[] = records.mentors.map((mentor) => ({
    id: mentorIds.get(mentor.id)!,
    name: mentor.name,
    expertise_pl: mentor.expertise_pl,
    target_groups: mentor.target_groups,
    active: true,
    updated_at: iso(draw.start + DAY),
    demo: true,
  }));
  const mentorOf = (id: string): Pick<Mentor, "id" | "name"> | null => {
    const own = records.mentors.find((mentor) => mentor.id === id);
    return own ? { id: mentorIds.get(id)!, name: own.name } : null;
  };

  const threads: Thread[] = [];
  /** A conversation whose messages end some time ago: waiting for ROPS when the user wrote last. */
  const conversation = (
    source: Pick<DemoRecords["threads"][number], "topic" | "subject" | "author" | "target_groups" | "messages">,
    mentor: Pick<Mentor, "id" | "name"> | null,
    ref: Thread["ref"],
    startAt: number | null,
  ): Thread | null => {
    const waits = source.messages.at(-1)?.author === "uzytkownik";
    let end = startAt ?? (waits ? draw.when(now - 6 * DAY) : draw.when(draw.start + 10 * DAY, now - 2 * DAY));
    if (end === null) return null;
    const times = [end];
    for (let i = source.messages.length - 2; i >= 0; i--) times.unshift((end = end - draw.between(3, 48) * HOUR));
    if (startAt !== null) {
      // A post's conversation starts with the post; its later messages follow it.
      const shift = startAt - times[0];
      for (let i = 0; i < times.length; i++) times[i] += shift;
      if (times.at(-1)! >= now) return null;
    }
    if (times[0] < draw.start) return null;
    const id = draw.id("rz");
    const messages: ThreadMessage[] = source.messages.map((message, index) => ({
      id: draw.id("wd"),
      at: iso(times[index]),
      author: message.author,
      name: message.author === "rops" ? ROPS_NAME : message.author === "mentor" ? (mentor?.name ?? null) : null,
      text: message.text,
    }));
    for (const [index, message] of source.messages.entries()) {
      if (message.author === "rops") logged({ at: times[index], reviewer: reviewer() }, "thread", id, "odpowiedz");
    }
    const last = times.at(-1)!;
    const status: Thread["status"] = waits ? (messages.length === 1 ? "nowa" : "w-toku") : now - last > 20 * DAY && draw.chance(0.5) ? "zamknieta" : "w-toku";
    return {
      id,
      created_at: iso(times[0]),
      updated_at: iso(last),
      topic: source.topic,
      subject: source.subject,
      author: { display_name: source.author.display_name, organisation: source.author.organisation, email: null, sector: source.author.sector },
      place_terc: placeOf(source.author.display_name),
      target_groups: source.target_groups,
      ref,
      access_hash: draw.hash(),
      mentor: mentor ? { ...mentor, key_hash: draw.hash() } : null,
      messages,
      status,
      consent: consent(times[0]),
      retention_until: yearAfter(last),
      note_pl: null,
      demo: true,
    };
  };

  const posts: PartnershipPost[] = records.posts.flatMap((item) => {
    const at = draw.when();
    if (at === null) return [];
    const id = draw.id("pp");
    const own = records.threads.find((thread) => thread.post === item.id);
    const source = own ?? {
      topic: "partnerstwo" as const,
      subject: item.title,
      author: { ...item.author, sector: item.sector },
      target_groups: item.target_groups,
      messages: [{ author: "uzytkownik" as const, text: item.description }],
    };
    const thread = conversation(source, null, { type: "partnership", id }, at);
    if (!thread) return [];
    // A post without a written conversation: ROPS published it and closed the conversation, unless it is new.
    if (!own && now - at > WAITING_DAYS * DAY) thread.status = "zamknieta";
    threads.push(thread);
    return [
      {
        id,
        created_at: iso(at),
        kind: item.kind,
        title: item.title,
        description: item.description,
        sector: item.sector,
        seeking: item.seeking,
        place_terc: thread.place_terc,
        target_groups: item.target_groups,
        author: { display_name: item.author.display_name, organisation: item.author.organisation, email: null },
        thread_id: thread.id,
        moderation: moderated(at, "partnership", id, 0.05),
        retention_until: yearAfter(at),
        demo: true,
      },
    ];
  });
  for (const item of records.threads.filter((thread) => thread.post === null)) {
    const mentor = item.mentor ? mentorOf(item.mentor) : null;
    const thread = conversation(item, mentor, null, null);
    if (!thread) continue;
    if (mentor) logged({ at: Date.parse(thread.messages[0].at) + HOUR, reviewer: reviewer() }, "thread", thread.id, "mentor");
    threads.push(thread);
  }

  // ---- content reports (8.11).
  const reported = records.evaluations.map((item) => item.innovation_id);
  const reports: ContentReport[] = records.reports.flatMap((item) => {
    const at = draw.when();
    if (at === null) return [];
    const id = draw.id("zg");
    const target =
      item.target === "route"
        ? draw.pick(answered).id
        : item.target === "need" && needs.length > 0
          ? draw.pick(needs).id
          : draw.pick(reported);
    const type = item.target === "need" && needs.length === 0 ? "innovation" : item.target;
    return [{ id, created_at: iso(at), target: { type, id: target }, reason: item.reason, comment: item.comment, moderation: moderated(at, "report", id, 0.3), demo: true }];
  });

  return {
    routes,
    needs: needs.sort(byNewest((item) => item.created_at)),
    ideas: ideas.sort(byNewest((item) => item.created_at)),
    evaluations: evaluations.sort(byNewest((item) => item.created_at)),
    contacts: contacts.sort(byNewest((item) => item.created_at)),
    readiness: readiness.sort(byNewest((item) => item.created_at)),
    mentors,
    posts: posts.sort(byNewest((item) => item.created_at)),
    threads: threads.sort(byNewest((item) => item.updated_at)),
    reports: reports.sort(byNewest((item) => item.created_at)),
    log: log.filter((entry) => Date.parse(entry.ts) < now).sort(byNewest((entry) => entry.ts)),
  };
}

/** A fresh store's state with the demonstration data added, newest first like every list; unchanged when a source file is missing. */
export function withDemoData(state: MemoryState, now = Date.now(), root = process.cwd()): MemoryState {
  const sources = readDemoSources(root);
  if (!sources) return state;
  const demo = buildDemo(sources, now);
  for (const route of demo.routes) state.routes.set(route.id, route);
  for (const mentor of demo.mentors) state.mentors.set(mentor.id, mentor);
  const merge = <T>(base: T[], added: T[], time: (item: T) => string) => [...base, ...added].sort(byNewest(time));
  state.needs = merge(state.needs, demo.needs, (item) => item.created_at);
  state.ideas = merge(state.ideas, demo.ideas, (item) => item.created_at);
  state.evaluations = merge(state.evaluations, demo.evaluations, (item) => item.created_at);
  state.contacts = merge(state.contacts, demo.contacts, (item) => item.created_at);
  state.readiness = merge(state.readiness, demo.readiness, (item) => item.created_at);
  state.posts = merge(state.posts, demo.posts, (item) => item.created_at);
  state.threads = merge(state.threads, demo.threads, (item) => item.updated_at);
  state.reports = merge(state.reports, demo.reports, (item) => item.created_at);
  state.log = merge(state.log, demo.log, (item) => item.ts);
  console.info(
    `[store] demonstration data: ${demo.routes.length} routes, ${demo.needs.length} needs, ${demo.ideas.length} ideas, ` +
      `${demo.evaluations.length} evaluations, ${demo.contacts.length} contacts, ${demo.readiness.length} readiness, ` +
      `${demo.posts.length} posts, ${demo.threads.length} conversations, ${demo.reports.length} reports`,
  );
  return state;
}
