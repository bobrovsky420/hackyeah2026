import "server-only";
import { randomBytes } from "node:crypto";
import type { RoleCode } from "@/lib/contracts/catalogue";
import type {
  ContactRequest,
  ContentReport,
  Feedback,
  ModerationLogEntry,
  Need,
  Readiness,
} from "@/lib/contracts/records";
import type { Route } from "@/lib/contracts/route";

/*
 * The prototype's database: everything lives in the server's memory and is
 * gone after a restart. It sits on globalThis so that pages, route handlers
 * and server actions share one copy. The real app replaces this module with
 * PostgreSQL (9.1) behind the same functions.
 */
interface Store {
  startedAt: string;
  routes: Map<string, Route>;
  needs: Need[];
  contacts: ContactRequest[];
  readiness: Readiness[];
  feedback: Feedback[];
  reports: ContentReport[];
  reviewedDeclines: Set<string>;
  /** Needs whose brief was generated once, for the counter brief_generated (FR-10.2). */
  briefs: Set<string>;
  log: ModerationLogEntry[];
  counters: Map<string, number>;
  /** The rate limiter's memory (12.5): request times per client address, never written elsewhere. */
  rateHits: Map<string, number[]>;
}

export const CONSENT_VERSION = "zgoda-prototyp-v1";

function exampleNeed(
  id: string,
  placeTerc: string,
  role: RoleCode,
  text: string,
  groups: string[],
  publish: boolean,
  routeId: string | null = null,
): Need {
  return {
    id,
    created_at: "2026-10-03T09:00:00+02:00",
    route_id: routeId,
    problem_text: text,
    summary_pl: text,
    place_terc: placeTerc,
    role,
    target_groups: groups,
    domains: [],
    reporter: { name: null, organisation: null, email: null },
    consents: {
      store: true,
      publish_anonymised: publish,
      contact: false,
      text_version: CONSENT_VERSION,
      timestamp: "2026-10-03T09:00:00+02:00",
    },
    status: "nowa",
    moderation: { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null },
    cluster_id: null,
    nearest_matches: [],
    brief_id: null,
    note_pl: null,
    example: true,
  };
}

function createStore(): Store {
  return {
    startedAt: new Date().toISOString(),
    routes: new Map(),
    needs: [
      exampleNeed(
        "nd-przyklad-1",
        "1207062",
        "pracownik-instytucji",
        "Samotni seniorzy w gminie wiejskiej, brak domu dziennego pobytu.",
        ["seniorzy"],
        true,
      ),
      exampleNeed(
        "nd-przyklad-2",
        "1211011",
        "organizacja-spoleczna",
        "Młodzież nie ma gdzie się spotykać po lekcjach.",
        ["dzieci-mlodziez-rodziny"],
        false,
        "przyklad-mlodziez",
      ),
      exampleNeed(
        "nd-przyklad-3",
        "1261011",
        "mieszkaniec",
        "Dzieci z rodzin z Ukrainy potrzebują pomocy w odrabianiu lekcji.",
        ["dzieci-mlodziez-rodziny", "cudzoziemcy"],
        true,
        "przyklad-dzieci",
      ),
    ],
    contacts: [],
    readiness: [],
    feedback: [],
    reports: [],
    reviewedDeclines: new Set(),
    briefs: new Set(),
    log: [],
    counters: new Map(),
    rateHits: new Map(),
  };
}

const holder = globalThis as typeof globalThis & { __prototypeStore?: Store };
export const store: Store = (holder.__prototypeStore ??= createStore());

// A store kept by `next dev` across reloads may predate a field added since; give it the default.
for (const [key, value] of Object.entries(createStore())) {
  if (!(key in store)) Object.assign(store, { [key]: value });
}

/** Ids in the style of the specification: rt-2026-10-03-7f3a. */
export function newId(prefix: "rt" | "nd" | "kt" | "gt" | "zg"): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}-${date}-${randomBytes(3).toString("hex")}`;
}

/** Event counters of FR-10.2, without cookies or personal data. */
export function countEvent(name: string) {
  store.counters.set(name, (store.counters.get(name) ?? 0) + 1);
}

export function nowIso(): string {
  return new Date().toISOString();
}
