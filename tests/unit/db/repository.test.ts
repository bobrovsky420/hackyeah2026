import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredBrief, ContactRequest, ContentReport, Evaluation, Idea, ModerationLogEntry, Need, Readiness, Route } from "@/lib/contracts";
import { exampleIdeas, exampleNeeds, exampleReadiness } from "@/server/db/examples";
import { createFileRepository } from "@/server/db/file";
import { createMemoryRepository, createMemoryState } from "@/server/db/memory";
import type { Repository, ScreeningLogEntry } from "@/server/db/repository";

/*
 * One contract for the store (src/server/db/): the memory repository, and
 * the same over a file (file.ts) in a temporary folder outside the
 * repository, a fresh file for every test. Timestamps are written as UTC
 * with milliseconds, so records compare whole after a round trip through
 * the file.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-03T12:00:00.000Z");
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

interface Target {
  name: string;
  open: () => Promise<Repository>;
  /** A repository that starts afresh, before every test. */
  reset: (repo: Repository) => Promise<Repository>;
}

/** A store without the example entries. */
const empty = () => ({ ...createMemoryState(), needs: [], readiness: [], ideas: [] });
/** The retention runs of the file store see the tests' clock, never the real day. */
const clock = () => new Date(NOW);

const memoryTarget: Target = {
  name: "memory",
  open: async () => createMemoryRepository(empty()),
  reset: async () => createMemoryRepository(empty()),
};

const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), "store-"));
let storeSeq = 0;
const openStore = () => createFileRepository(path.join(storeDir, `contract-${++storeSeq}.json`), { fresh: empty, now: clock });

const fileTarget: Target = {
  name: "file",
  open: async () => openStore(),
  reset: async (repo) => {
    await repo.close();
    return openStore();
  },
};

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterAll(() => {
  vi.restoreAllMocks();
  fs.rmSync(storeDir, { recursive: true, force: true });
});

function need(id: string, over: Partial<Need> = {}): Need {
  return {
    id,
    created_at: at(0),
    route_id: null,
    problem_text: "Samotni seniorzy w gminie wiejskiej, brak domu dziennego pobytu.",
    summary_pl: null,
    place_terc: "1207062",
    role: "mieszkaniec",
    target_groups: ["seniorzy"],
    domains: [],
    reporter: { name: null, organisation: null, email: "ala@example.org" },
    consents: { store: true, publish_anonymised: true, contact: true, text_version: "v1", timestamp: at(0) },
    status: "nowa",
    moderation: { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null },
    cluster_id: null,
    nearest_matches: [{ innovation_id: "inn-1", fit_score: 38, what_fits_pl: "a", what_lacks_pl: "b" }],
    brief_id: null,
    note_pl: null,
    example: false,
    ...over,
  };
}

function contact(id: string, over: Partial<ContactRequest> = {}): ContactRequest {
  return {
    id,
    created_at: at(0),
    route_id: "rt-1",
    need_id: null,
    target: { type: "innovation", id: "inn-1" },
    requester: { name: "Ala", organisation: null, email: "ala@example.org" },
    message: "Dzień dobry, chcemy wdrożyć ten program.",
    screening: { outcome: "need" },
    consent: { text_version: "v1", timestamp: at(0) },
    moderation: { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null },
    status: "nowe",
    note_pl: null,
    ...over,
  };
}

function registration(id: string, over: Partial<Readiness> = {}): Readiness {
  return {
    id,
    created_at: at(0),
    display_name: "Stowarzyszenie Razem",
    is_organisation: true,
    place_terc: "1261011",
    topics: ["seniorzy"],
    channel: { type: "phone", value: "600100200" },
    consent_display_name: true,
    consent: { text_version: "v1", timestamp: at(0) },
    verification: { status: "niezweryfikowane", reviewer: null, decided_at: null },
    retention_until: "2027-10-03",
    note_pl: null,
    ...over,
  };
}

function idea(id: string, over: Partial<Idea> = {}): Idea {
  return {
    id,
    created_at: at(0),
    kind: "pomysl",
    title: "Sąsiedzka wypożyczalnia sprzętu rehabilitacyjnego",
    description: "Mieszkańcy oddają nieużywany sprzęt, a świetlica go wypożycza sąsiadom.",
    essence: "Sprzęt krąży między sąsiadami zamiast leżeć w piwnicach.",
    for_whom: "Seniorzy po pobycie w szpitalu i ich opiekunowie.",
    target_groups: ["seniorzy"],
    stage: "test",
    place_terc: "1261011",
    author: { display_name: "Stowarzyszenie Razem", is_organisation: true, email: "razem@example.org" },
    consents: { store: true, publish: false, text_version: "v1", timestamp: at(0) },
    moderation: { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null },
    similar: null,
    status: "nowy",
    reply: null,
    retention_until: "2027-10-03",
    note_pl: null,
    ...over,
  };
}

function evaluation(id: string, over: Partial<Evaluation> = {}): Evaluation {
  return {
    id,
    created_at: at(0),
    innovation_id: "inn-1",
    rating: 4,
    experience: "wdrazam",
    feedback: "Działa, ale instrukcja jest za długa.",
    improvement: null,
    test_signup: null,
    author: { display_name: null, email: null },
    consents: { store: true, contact: false, text_version: "v1", timestamp: at(0) },
    moderation: { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null },
    forwarded_at: null,
    retention_until: "2027-10-03",
    note_pl: null,
    ...over,
  };
}

function report(id: string, over: Partial<ContentReport> = {}): ContentReport {
  return {
    id,
    created_at: at(0),
    target: { type: "route", id: "rt-1" },
    reason: "nieprawdziwe",
    comment: null,
    moderation: { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null },
    ...over,
  };
}

function route(id: string, mode: Route["mode"], createdAt = at(0)): Route {
  return {
    id,
    created_at: createdAt,
    input: { problem_text: "Tekst potrzeby.", place_terc: "1207062", place_name: "Laskowa", role: null, target_groups: [] },
    mode,
    need_summary_pl: null,
    mode_reason_pl: null,
    screening: { category: "need", confidence: 0.9, sensitive_topics: [], redactions: 0, crisis_banner: false },
    clarification_needed: false,
    summary_pl: null,
    solutions: [],
    knowledge: [],
    people: { innovators: [], implementers_nearby: [], advisor: null, readiness: { count: 0, names_with_consent: [] } },
    path: { applicant_type: null, cost_band: null, paths: [] },
    next_steps: [],
    unknowns_pl: [],
    engine: { provider: "x", model: "x", prompt_version: null, data_version: "x", latency_ms: 1, cached: false },
    label_pl: "",
    reference_code: mode === "declined" ? "HM-2026-1234" : null,
  } as unknown as Route;
}

function screening(atMs: number, over: Partial<ScreeningLogEntry> = {}): ScreeningLogEntry {
  return {
    at: at(atMs),
    kind: "need",
    category: "harm",
    confidence: 0.9,
    outcome: "declined",
    sensitive_topics: [],
    redaction_count: 1,
    rules_fired: ["model:harm"],
    prompt_version: "screen-v1",
    text_sha256: "ab".repeat(32),
    text: "Tekst do przeglądu.",
    text_until: at(atMs + 7 * DAY),
    ref: null,
    ...over,
  };
}

const moderation = (status: "zatwierdzone" | "odrzucone") => ({
  status,
  reviewer: "rops-1",
  decided_at: at(DAY),
  reason_pl: status === "odrzucone" ? "Dane osobowe" : null,
});

describe.each([memoryTarget, fileTarget])("the repository in $name", (target) => {
  let repo: Repository;
  beforeAll(async () => {
    repo = await target.open();
  });
  beforeEach(async () => {
    repo = await target.reset(repo);
  });
  afterAll(async () => {
    await repo?.close();
  });

  describe("routes", () => {
    it("keeps a route whole and gives a copy back", async () => {
      const stored = route("rt-1", "route");
      await repo.saveRoute(stored);
      const read = await repo.getRoute("rt-1");
      expect(read).toEqual(stored);
      read!.input.problem_text = "zmienione";
      expect((await repo.getRoute("rt-1"))?.input.problem_text).toBe("Tekst potrzeby.");
      expect(await repo.getRoute("rt-none")).toBeUndefined();
    });

    it("stores a redirected route without the reader's text (FR-2.5)", async () => {
      await repo.saveRoute(route("rt-r", "redirected"));
      const read = await repo.getRoute("rt-r");
      expect(read?.mode).toBe("redirected");
      expect(read?.input.problem_text).toBeNull();
      expect(JSON.stringify(read)).not.toContain("Tekst potrzeby");
    });

    it("queues declined routes for review until one reviewer marks them (FR-12.8)", async () => {
      await repo.saveRoute(route("rt-d1", "declined", at(-DAY)));
      await repo.saveRoute(route("rt-d2", "declined", at(0)));
      await repo.saveRoute(route("rt-ok", "route"));
      expect((await repo.listDeclinedForReview()).map((item) => item.id)).toEqual(["rt-d2", "rt-d1"]);
      expect(await repo.markDeclineReviewed("rt-d1", at(DAY))).toBe(true);
      expect(await repo.markDeclineReviewed("rt-d1", at(DAY))).toBe(false);
      expect(await repo.markDeclineReviewed("rt-ok", at(DAY))).toBe(false);
      expect(await repo.markDeclineReviewed("rt-none", at(DAY))).toBe(false);
      expect((await repo.listDeclinedForReview()).map((item) => item.id)).toEqual(["rt-d2"]);
    });
  });

  describe("needs and their filters (FR-5.6; FR-9.2 of the roadmap)", () => {
    beforeEach(async () => {
      await repo.addNeed(need("nd-1", { created_at: at(-2 * DAY), target_groups: ["seniorzy", "zdrowie"] }));
      await repo.addNeed(
        need("nd-2", { created_at: at(-DAY), place_terc: "1261011", target_groups: ["cudzoziemcy"], status: "w-analizie" }),
      );
      await repo.addNeed(
        need("nd-3", {
          created_at: at(0),
          place_terc: null,
          consents: { store: true, publish_anonymised: false, contact: false, text_version: "v1", timestamp: at(0) },
        }),
      );
    });

    it("round-trips a need and lists newest first", async () => {
      expect(await repo.getNeed("nd-1")).toEqual(need("nd-1", { created_at: at(-2 * DAY), target_groups: ["seniorzy", "zdrowie"] }));
      expect((await repo.listNeeds()).map((item) => item.id)).toEqual(["nd-3", "nd-2", "nd-1"]);
    });

    it("filters by status, category, place and the moderation queue", async () => {
      const ids = async (filter: Parameters<Repository["listNeeds"]>[0]) => (await repo.listNeeds(filter)).map((item) => item.id);
      expect(await ids({ status: "w-analizie" })).toEqual(["nd-2"]);
      expect(await ids({ category: "seniorzy" })).toEqual(["nd-3", "nd-1"]);
      expect(await ids({ category: "zdrowie" })).toEqual(["nd-1"]);
      expect(await ids({ places: ["1261011"] })).toEqual(["nd-2"]);
      expect(await ids({ places: [null] })).toEqual(["nd-3"]);
      expect(await ids({ places: ["1207062", null] })).toEqual(["nd-3", "nd-1"]);
      expect(await ids({ places: [] })).toEqual([]);
      expect(await ids({ publishable: true, moderation: "do-weryfikacji" })).toEqual(["nd-2", "nd-1"]);
      expect(await ids({ status: "nowa", category: "seniorzy", places: ["1207062"] })).toEqual(["nd-1"]);
    });

    it("counts needs per gmina for the map", async () => {
      const counts = await repo.needCountsByPlace();
      expect(Object.fromEntries(counts)).toEqual({ "1207062": 1, "1261011": 1 });
    });

    it("decides a need once; a second decision finds nothing to decide", async () => {
      const decided = await repo.decideNeed("nd-1", moderation("zatwierdzone"));
      expect(decided?.moderation).toEqual(moderation("zatwierdzone"));
      expect(await repo.decideNeed("nd-1", moderation("odrzucone"))).toBeUndefined();
      expect(await repo.decideNeed("nd-none", moderation("odrzucone"))).toBeUndefined();
      expect((await repo.getNeed("nd-1"))?.moderation.status).toBe("zatwierdzone");
      expect((await repo.listNeeds({ publishable: true, moderation: "do-weryfikacji" })).map((item) => item.id)).toEqual(["nd-2"]);
    });

    it("changes the status and the note", async () => {
      const changed = await repo.updateNeed("nd-2", { status: "temat-naboru", note_pl: "Do naboru jesienią." });
      expect(changed).toMatchObject({ status: "temat-naboru", note_pl: "Do naboru jesienią." });
      expect(await repo.updateNeed("nd-none", { status: "nowa", note_pl: null })).toBeUndefined();
    });
  });

  describe("contact requests (FR-6.4)", () => {
    it("filters, decides with the new status once, and keeps the note", async () => {
      await repo.addContact(contact("kt-1", { created_at: at(-DAY) }));
      await repo.addContact(contact("kt-2"));
      expect(await repo.listContacts()).toEqual([contact("kt-2"), contact("kt-1", { created_at: at(-DAY) })]);

      const relayed = await repo.decideContact("kt-1", moderation("zatwierdzone"), "przekazane");
      expect(relayed).toMatchObject({ status: "przekazane", moderation: moderation("zatwierdzone") });
      expect(await repo.decideContact("kt-1", moderation("odrzucone"), "zamkniete")).toBeUndefined();
      expect((await repo.listContacts({ moderation: "do-weryfikacji" })).map((item) => item.id)).toEqual(["kt-2"]);
      expect((await repo.listContacts({ status: "przekazane" })).map((item) => item.id)).toEqual(["kt-1"]);

      await repo.updateContact("kt-2", { status: "zamkniete", note_pl: "Nieaktualne." });
      expect((await repo.listContacts({ status: "zamkniete" }))[0]).toMatchObject({ id: "kt-2", note_pl: "Nieaktualne." });
    });
  });

  describe("readiness registrations (FR-6.5)", () => {
    it("round-trips, filters by status and place, and verifies once", async () => {
      const example = exampleReadiness()[0];
      await repo.addReadiness(registration("gt-1", { created_at: at(-DAY), place_terc: null }));
      await repo.addReadiness(registration("gt-2"));
      await repo.addReadiness({
        ...example,
        created_at: at(-2 * DAY),
        consent: { ...example.consent, timestamp: at(-2 * DAY) },
        verification: { ...example.verification, decided_at: at(-2 * DAY) },
      });

      expect(await repo.getReadiness("gt-2")).toEqual(registration("gt-2"));
      expect((await repo.getReadiness(example.id))?.example).toBe(true);
      expect((await repo.getReadiness("gt-2"))?.example).toBeUndefined();
      expect((await repo.listReadiness()).map((item) => item.id)).toEqual(["gt-2", "gt-1", example.id]);
      expect((await repo.listReadiness({ status: "niezweryfikowane" })).map((item) => item.id)).toEqual(["gt-2", "gt-1"]);
      expect((await repo.listReadiness({ places: [null] })).map((item) => item.id)).toEqual(["gt-1"]);
      expect((await repo.listReadiness({ status: "zweryfikowane", places: ["1261011"] })).map((item) => item.id)).toEqual([example.id]);

      const verification = { status: "zweryfikowane" as const, reviewer: "rops-1", decided_at: at(DAY) };
      expect((await repo.verifyReadiness("gt-2", verification))?.verification).toEqual(verification);
      expect(await repo.verifyReadiness("gt-2", { ...verification, status: "odrzucone" })).toBeUndefined();

      const changed = await repo.updateReadiness("gt-2", {
        verification: { ...verification, status: "odrzucone" },
        note_pl: "Zgłoszenie wycofane.",
      });
      expect(changed).toMatchObject({
        verification: { status: "odrzucone" },
        note_pl: "Zgłoszenie wycofane.",
        retention_until: "2027-10-03",
      });
    });
  });

  describe("idea cards (module III)", () => {
    it("round-trips newest first and stores the similar innovations once computed", async () => {
      await repo.addIdea(idea("pm-1", { created_at: at(-DAY) }));
      await repo.addIdea(idea("pm-2"));
      expect(await repo.getIdea("pm-2")).toEqual(idea("pm-2"));
      expect((await repo.listIdeas()).map((item) => item.id)).toEqual(["pm-2", "pm-1"]);

      const similar = [{ innovation_id: "inn-1", fit_score: 72, what_fits_pl: "a", what_lacks_pl: "b" }];
      expect((await repo.setIdeaSimilar("pm-1", similar))?.similar).toEqual(similar);
      expect((await repo.getIdea("pm-1"))?.similar).toEqual(similar);
      expect(await repo.setIdeaSimilar("pm-9", similar)).toBeUndefined();
    });
  });

  describe("evaluations of innovations (module IV)", () => {
    it("round-trips newest first and filters by innovation", async () => {
      await repo.addEvaluation(evaluation("oc-1", { created_at: at(-DAY) }));
      await repo.addEvaluation(evaluation("oc-2", { innovation_id: "inn-2" }));
      await repo.addEvaluation(evaluation("oc-3"));
      expect((await repo.listEvaluations()).map((item) => item.id)).toEqual(["oc-3", "oc-2", "oc-1"]);
      expect(await repo.listEvaluations("inn-1")).toEqual([evaluation("oc-3"), evaluation("oc-1", { created_at: at(-DAY) })]);
      expect(await repo.listEvaluations("inn-9")).toEqual([]);
    });
  });

  describe("the panel's store (module VI)", () => {
    it("moderates and answers an idea card, keeping the reply when none is given", async () => {
      await repo.addIdea(idea("pm-1"));
      const decided = { status: "zatwierdzone" as const, reviewer: "AT", decided_at: at(0), reason_pl: null };
      expect((await repo.moderateIdea("pm-1", decided))?.moderation).toEqual(decided);
      const reply = { text_pl: "Dziękujemy.", at: at(0), by: "AT" };
      expect(await repo.updateIdea("pm-1", { status: "w-analizie", note_pl: "notatka", reply })).toMatchObject({ status: "w-analizie", reply, note_pl: "notatka" });
      expect((await repo.updateIdea("pm-1", { status: "przyjety", note_pl: null }))?.reply).toEqual(reply);
      expect((await repo.updateIdea("pm-1", { status: "przyjety", note_pl: null, reply: null }))?.reply).toBeNull();
      expect(await repo.moderateIdea("pm-9", decided)).toBeUndefined();
    });

    it("moderates and forwards an evaluation", async () => {
      await repo.addEvaluation(evaluation("oc-1"));
      const rejected = { status: "odrzucone" as const, reviewer: "AT", decided_at: at(0), reason_pl: "Inny powód" };
      expect((await repo.moderateEvaluation("oc-1", rejected))?.moderation).toEqual(rejected);
      expect(await repo.forwardEvaluation("oc-1", { at: at(DAY), note_pl: "Mailem do autorów." })).toMatchObject({ forwarded_at: at(DAY), note_pl: "Mailem do autorów." });
      expect((await repo.getEvaluation("oc-1"))?.forwarded_at).toBe(at(DAY));
    });

    it("keeps one knowledge entry per id and one word per innovation, newest first", async () => {
      const entry = {
        id: "wz-1", base_id: null, title_pl: "Film", description_pl: "", url: "https://v/1", type: "video" as const,
        target_groups: ["any"], always_show: false, hidden: false, updated_at: at(0), updated_by: "AT",
      };
      await repo.saveKnowledgeEntry(entry);
      await repo.saveKnowledgeEntry({ ...entry, id: "wz-2", updated_at: at(DAY) });
      await repo.saveKnowledgeEntry({ ...entry, hidden: true });
      expect((await repo.listKnowledgeEntries()).map((item) => [item.id, item.hidden])).toEqual([["wz-2", false], ["wz-1", true]]);
      const word = { innovation_id: "inn-1", status: "zweryfikowane" as const, summary_pl: null, extra_materials: [], note_pl: null, updated_at: at(0), updated_by: "AT" };
      await repo.saveInnovationOverride(word);
      await repo.saveInnovationOverride({ ...word, status: "ukryte" });
      expect(await repo.listInnovationOverrides()).toHaveLength(1);
      expect((await repo.getInnovationOverride("inn-1"))?.status).toBe("ukryte");
    });
  });

  describe("feedback and content reports", () => {
    it("keeps feedback per route", async () => {
      await repo.addFeedback({ route_id: "rt-1", value: "tak", comment: null, created_at: at(-DAY) });
      await repo.addFeedback({ route_id: "rt-1", value: "nie", comment: "Za ogólne.", created_at: at(0) });
      await repo.addFeedback({ route_id: "rt-2", value: "czesciowo", comment: null, created_at: at(0) });
      expect((await repo.listFeedback("rt-1")).map((item) => item.value)).toEqual(["nie", "tak"]);
      expect(await repo.listFeedback()).toHaveLength(3);
    });

    it("queues reports and decides them once (8.11)", async () => {
      await repo.addReport(report("zg-1", { created_at: at(-DAY) }));
      await repo.addReport(report("zg-2", { target: { type: "innovation", id: "inn-1" }, comment: "Nieaktualny kontakt." }));
      expect((await repo.listReports()).map((item) => item.id)).toEqual(["zg-2", "zg-1"]);
      expect(await repo.decideReport("zg-1", moderation("odrzucone"))).toEqual(
        report("zg-1", { created_at: at(-DAY), moderation: moderation("odrzucone") }),
      );
      expect(await repo.decideReport("zg-1", moderation("zatwierdzone"))).toBeUndefined();
      expect((await repo.listReports({ moderation: "do-weryfikacji" })).map((item) => item.id)).toEqual(["zg-2"]);
    });
  });

  describe("the moderation log (FR-12.8)", () => {
    it("lists every action newest first, with the reviewer, up to the limit", async () => {
      for (let i = 0; i < 3; i += 1) {
        await repo.appendModerationLog({
          ts: at(i * 1000),
          reviewer: `rops-${i}`,
          target_type: "need",
          target_id: `nd-${i}`,
          action: i === 2 ? "status" : "zatwierdzone",
          status: i === 2 ? "w-analizie" : null,
          reason_pl: null,
          note_pl: i === 1 ? "Notatka." : null,
        });
      }
      const log = await repo.listModerationLog(2);
      expect(log.map((entry) => entry.target_id)).toEqual(["nd-2", "nd-1"]);
      expect(log[0]).toEqual({
        ts: at(2000),
        reviewer: "rops-2",
        target_type: "need",
        target_id: "nd-2",
        action: "status",
        status: "w-analizie",
        reason_pl: null,
        note_pl: null,
      });
      expect(log[1].note_pl).toBe("Notatka.");
    });
  });

  describe("the screening log (FR-12.7, 12.6)", () => {
    it("keeps a declined text seven days, the entry 14 days, and never a need's text", async () => {
      await repo.writeScreeningLog(screening(-15 * DAY), NOW - 15 * DAY);
      await repo.writeScreeningLog(screening(-8 * DAY), NOW - 8 * DAY);
      await repo.writeScreeningLog(screening(-DAY, { category: "spam", outcome: "off_topic" }), NOW - DAY);
      await repo.writeScreeningLog(
        screening(-1000, { category: "need", outcome: "need", text: null, text_until: null, rules_fired: [] }),
        NOW - 1000,
      );

      const log = await repo.listScreeningLog(NOW);
      expect(log.map((entry) => entry.at)).toEqual([at(-1000), at(-DAY), at(-8 * DAY)]);
      // Past its seven days the text is gone; the entry stays for the counts.
      expect(log[2]).toEqual({ ...screening(-8 * DAY, { text: null, text_until: null }), id: "sl-2", reviewed_at: null });
      expect(log[1]).toEqual({ ...screening(-DAY, { category: "spam", outcome: "off_topic" }), id: "sl-3", reviewed_at: null });
      expect(log[0].text).toBeNull();
    });

    it("keeps the record a text belongs to and marks a kept text reviewed once (FR-12.8)", async () => {
      await repo.writeScreeningLog(screening(-DAY, { ref: "rt-d1" }), NOW - DAY);
      await repo.writeScreeningLog(screening(-1000, { category: "need", outcome: "need", text: null, text_until: null }), NOW - 1000);
      const [withoutText, kept] = await repo.listScreeningLog(NOW);
      expect(kept).toMatchObject({ id: "sl-1", ref: "rt-d1", reviewed_at: null });
      expect(await repo.markScreeningTextReviewed("sl-1", at(0))).toBe(true);
      expect(await repo.markScreeningTextReviewed("sl-1", at(1000))).toBe(false);
      expect(await repo.markScreeningTextReviewed(withoutText.id, at(0))).toBe(false);
      expect(await repo.markScreeningTextReviewed("sl-99", at(0))).toBe(false);
      expect(await repo.markScreeningTextReviewed("rt-d1", at(0))).toBe(false);
      expect((await repo.listScreeningLog(NOW))[1].reviewed_at).toBe(at(0));
    });

    it("applies the retention on the next write too", async () => {
      await repo.writeScreeningLog(screening(-8 * DAY), NOW - 8 * DAY);
      expect((await repo.listScreeningLog(NOW - 8 * DAY))[0].text).not.toBeNull();
      await repo.writeScreeningLog(screening(0), NOW);
      const log = await repo.listScreeningLog(NOW);
      expect(log.map((entry) => entry.text !== null)).toEqual([true, false]);
    });
  });

  describe("the facts of the stored routes (FR-9.3)", () => {
    it("gives mode, place, latency, the cache flag and the recommended innovations, newest first", async () => {
      const recommended = route("rt-2", "route", at(0));
      recommended.solutions = [{ innovation_id: "inn-1" }, { innovation_id: "inn-2" }] as Route["solutions"];
      recommended.engine = { ...recommended.engine, latency_ms: 4200, cached: true };
      await repo.saveRoute(route("rt-1", "declined", at(-DAY)));
      await repo.saveRoute(recommended);
      expect(await repo.listRouteFacts()).toEqual([
        { id: "rt-2", created_at: at(0), mode: "route", place_terc: "1207062", latency_ms: 4200, cached: true, solution_ids: ["inn-1", "inn-2"] },
        { id: "rt-1", created_at: at(-DAY), mode: "declined", place_terc: "1207062", latency_ms: 1, cached: false, solution_ids: [] },
      ]);
    });
  });

  describe("retention (12.6)", () => {
    const cutoffs = {
      routesBefore: at(-10 * DAY),
      contactsBefore: at(-90 * DAY),
      readinessBefore: "2026-10-03",
      screeningAt: at(0),
    };

    beforeEach(async () => {
      await repo.saveRoute(route("rt-old", "route", at(-11 * DAY)));
      await repo.saveRoute(route("rt-new", "declined", at(-9 * DAY)));
      await repo.addFeedback({ route_id: "rt-old", value: "tak", comment: "Pomogło.", created_at: at(-11 * DAY) });
      await repo.addFeedback({ route_id: "rt-new", value: "nie", comment: null, created_at: at(-9 * DAY) });
      await repo.addContact(contact("kt-old", { created_at: at(-91 * DAY) }));
      await repo.addContact(contact("kt-new", { created_at: at(-89 * DAY) }));
      await repo.addReadiness(registration("gt-old", { retention_until: "2026-10-02" }));
      await repo.addReadiness(registration("gt-today", { retention_until: "2026-10-03" }));
      await repo.addIdea(idea("pm-old", { retention_until: "2026-10-02" }));
      await repo.addIdea(idea("pm-today", { retention_until: "2026-10-03" }));
      await repo.addEvaluation(evaluation("oc-old", { retention_until: "2026-10-02" }));
      await repo.addEvaluation(evaluation("oc-today", { retention_until: "2026-10-03" }));
      // Newest first, so no write applies the log's retention to the others before the run does.
      await repo.writeScreeningLog(screening(-DAY), NOW - DAY);
      await repo.writeScreeningLog(screening(-8 * DAY), NOW - 8 * DAY);
      await repo.writeScreeningLog(screening(-15 * DAY), NOW - 15 * DAY);
      await repo.addNeed(need("nd-1", { created_at: at(-100 * DAY) }));
    });

    it("counts without deleting in a dry run", async () => {
      const expected = { routes: 1, feedback: 1, contacts: 1, readiness: 1, ideas: 1, evaluations: 1, screeningEntries: 1, screeningTexts: 1 };
      expect(await repo.applyRetention(cutoffs, { dryRun: true })).toEqual(expected);
      expect(await repo.getRoute("rt-old")).toBeDefined();
      expect(await repo.listContacts()).toHaveLength(2);
      expect(await repo.listReadiness()).toHaveLength(2);
      expect(await repo.applyRetention(cutoffs, { dryRun: true })).toEqual(expected);
    });

    it("deletes what is past its period and keeps the rest", async () => {
      expect(await repo.applyRetention(cutoffs, { dryRun: false })).toEqual({
        routes: 1,
        feedback: 1,
        contacts: 1,
        readiness: 1,
        ideas: 1,
        evaluations: 1,
        screeningEntries: 1,
        screeningTexts: 1,
      });
      expect(await repo.getRoute("rt-old")).toBeUndefined();
      expect(await repo.getRoute("rt-new")).toBeDefined();
      expect((await repo.listFeedback()).map((item) => item.route_id)).toEqual(["rt-new"]);
      expect((await repo.listContacts()).map((item) => item.id)).toEqual(["kt-new"]);
      expect((await repo.listReadiness()).map((item) => item.id)).toEqual(["gt-today"]);
      expect((await repo.listIdeas()).map((item) => item.id)).toEqual(["pm-today"]);
      expect((await repo.listEvaluations()).map((item) => item.id)).toEqual(["oc-today"]);
      expect((await repo.listScreeningLog(NOW)).map((entry) => entry.text !== null)).toEqual([true, false]);
      // Needs stay until ROPS decides.
      expect((await repo.listNeeds()).map((item) => item.id)).toEqual(["nd-1"]);
      expect(await repo.applyRetention(cutoffs, { dryRun: false })).toEqual({
        routes: 0,
        feedback: 0,
        contacts: 0,
        readiness: 0,
        ideas: 0,
        evaluations: 0,
        screeningEntries: 0,
        screeningTexts: 0,
      });
    });

    it("keeps every route while the routes' cut-off has not come", async () => {
      const counts = await repo.applyRetention({ ...cutoffs, routesBefore: null }, { dryRun: false });
      expect(counts).toMatchObject({ routes: 0, feedback: 0 });
      expect(await repo.getRoute("rt-old")).toBeDefined();
    });
  });

  describe("the duplicate check, the stored brief and the clusters (FR-5.3, 8.5, FR-5.4)", () => {
    const stored = (id: string, needId: string, title: string): StoredBrief => ({
      id,
      need_id: needId,
      generated_at: at(0),
      brief: { needId, title } as StoredBrief["brief"],
      sections: [{ key: "tytul-roboczy", heading: "Tytuł roboczy", text: title }],
      markdown: `# Fiszka

${title}
`,
    });

    it("stores the nearest matches of a need", async () => {
      await repo.addNeed(need("nd-1", { nearest_matches: [] }));
      const matches = [{ innovation_id: "inn-2", fit_score: 41, what_fits_pl: "Pasuje.", what_lacks_pl: "Brakuje." }];
      expect((await repo.setNearestMatches("nd-1", matches))?.nearest_matches).toEqual(matches);
      expect((await repo.getNeed("nd-1"))?.nearest_matches).toEqual(matches);
      expect(await repo.setNearestMatches("nd-none", matches)).toBeUndefined();
    });

    it("stores one brief per need, replaces it, and sets the need's brief_id", async () => {
      await repo.addNeed(need("nd-1"));
      expect(await repo.getBrief("nd-1")).toBeUndefined();
      expect(await repo.saveBrief(stored("br-1", "nd-1", "Pierwsza"))).toBe(true);
      expect(await repo.getBrief("nd-1")).toEqual(stored("br-1", "nd-1", "Pierwsza"));
      expect((await repo.getNeed("nd-1"))?.brief_id).toBe("br-1");
      expect(await repo.saveBrief(stored("br-1", "nd-1", "Druga"))).toBe(true);
      expect((await repo.getBrief("nd-1"))?.brief.title).toBe("Druga");
      expect(await repo.saveBrief(stored("br-2", "nd-none", "Żadna"))).toBe(false);
      expect(await repo.getBrief("nd-none")).toBeUndefined();
    });

    it("replaces a clustering run: ids for the members, null for the rest of the run, names by id", async () => {
      await repo.addNeed(need("nd-1"));
      await repo.addNeed(need("nd-2"));
      await repo.addNeed(need("nd-3", { cluster_id: "cl-old" }));
      await repo.addNeed(need("nd-4", { cluster_id: "cl-keep" }));
      await repo.saveClusters([{ id: "cl-a", name_pl: "Dojazd do lekarza", created_at: at(0), need_ids: ["nd-1", "nd-2"] }], ["nd-1", "nd-2", "nd-3"]);
      const clusterOf = async (id: string) => (await repo.getNeed(id))?.cluster_id;
      expect(await clusterOf("nd-1")).toBe("cl-a");
      expect(await clusterOf("nd-2")).toBe("cl-a");
      expect(await clusterOf("nd-3")).toBeNull();
      // A need outside the run keeps its cluster.
      expect(await clusterOf("nd-4")).toBe("cl-keep");
      await repo.saveClusters([{ id: "cl-b", name_pl: "Czas wolny", created_at: at(1000), need_ids: ["nd-3"] }], ["nd-3"]);
      expect(await repo.listClusters()).toEqual([
        { id: "cl-b", name_pl: "Czas wolny", created_at: at(1000) },
        { id: "cl-a", name_pl: "Dojazd do lekarza", created_at: at(0) },
      ]);
    });
  });

  describe("the brief marker and the counters (FR-10.2)", () => {
    it("reports a need's first brief once", async () => {
      expect(await repo.markBriefGenerated("nd-1", at(0))).toBe(true);
      expect(await repo.markBriefGenerated("nd-1", at(1000))).toBe(false);
      expect(await repo.markBriefGenerated("nd-2", at(1000))).toBe(true);
    });

    it("counts events by name", async () => {
      await repo.countEvent("route_created:route");
      await repo.countEvent("route_created:route");
      await repo.countEvent("need_saved");
      const { since, counts } = await repo.counters();
      expect(counts).toEqual({ "route_created:route": 2, need_saved: 1 });
      expect(Number.isNaN(Date.parse(since))).toBe(false);
    });
  });
});

describe("the example entries", () => {
  it("a fresh store starts with the three example needs, the two team entries and the example idea card", async () => {
    const repo = createMemoryRepository();
    expect((await repo.listNeeds()).map((item) => item.id)).toEqual(["nd-przyklad-1", "nd-przyklad-2", "nd-przyklad-3"]);
    expect((await repo.listReadiness()).map((item) => item.id)).toEqual(["gt-przyklad-1", "gt-przyklad-2"]);
    expect((await repo.listIdeas()).map((item) => item.id)).toEqual(["pm-przyklad-1"]);
  });

  it("the example idea card is marked and already holds its similar innovations (module III)", () => {
    const [card] = exampleIdeas();
    expect(card).toMatchObject({ example: true, consents: { store: true } });
    expect(card.author.email).toMatch(/@example\.org$/);
    expect(card.similar?.length).toBeGreaterThan(0);
  });

  it("the seed holds two consented and verified team organisations, marked as examples (FR-6.5)", () => {
    const entries = exampleReadiness();
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry).toMatchObject({ is_organisation: true, consent_display_name: true, example: true });
      expect(entry.verification.status).toBe("zweryfikowane");
      expect(entry.channel.value).toMatch(/@example\.org$/);
    }
    expect(exampleNeeds().every((item) => item.example)).toBe(true);
  });
});

describe("the store file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "store-file-"));
  const fileOf = (name: string) => {
    fs.mkdirSync(path.join(dir, name), { recursive: true });
    return path.join(dir, name, "records.json");
  };
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("keeps every entry across a close and a reopen, and carries the screening sequence on", async () => {
    const file = fileOf("reopen");
    const entry: ModerationLogEntry = {
      ts: at(0),
      reviewer: "rops-1",
      target_type: "need",
      target_id: "nd-1",
      action: "zatwierdzone",
      status: null,
      reason_pl: null,
      note_pl: null,
    };
    const first = createFileRepository(file, { fresh: empty, now: clock });
    await first.saveRoute(route("rt-1", "route"));
    await first.addNeed(need("nd-1"));
    await first.addContact(contact("kt-1"));
    await first.addReadiness(registration("gt-1"));
    await first.addIdea(idea("pm-1"));
    await first.addEvaluation(evaluation("oc-1"));
    await first.saveKnowledgeEntry({
      id: "wz-1", base_id: null, title_pl: "Film", description_pl: "", url: "https://v/1", type: "video",
      target_groups: ["any"], always_show: false, hidden: false, updated_at: at(0), updated_by: "AT",
    });
    await first.saveInnovationOverride({ innovation_id: "inn-1", status: "zweryfikowane", summary_pl: null, extra_materials: [], note_pl: null, updated_at: at(0), updated_by: "AT" });
    await first.addFeedback({ route_id: "rt-1", value: "tak", comment: null, created_at: at(0) });
    await first.addReport(report("zg-1"));
    await first.appendModerationLog(entry);
    await first.writeScreeningLog(screening(-DAY), NOW - DAY);
    await first.writeScreeningLog(screening(-1000, { category: "need", outcome: "need", text: null, text_until: null }), NOW - 1000);
    await first.countEvent("route");
    await first.countEvent("route");
    expect(await first.markBriefGenerated("nd-1", at(0))).toBe(true);
    const { since } = await first.counters();
    await first.close();

    const second = createFileRepository(file, { fresh: empty, now: clock });
    expect(await second.getRoute("rt-1")).toEqual(route("rt-1", "route"));
    expect(await second.listNeeds()).toEqual([need("nd-1")]);
    expect(await second.listContacts()).toEqual([contact("kt-1")]);
    expect(await second.listReadiness()).toEqual([registration("gt-1")]);
    expect(await second.listIdeas()).toEqual([idea("pm-1")]);
    expect(await second.listEvaluations()).toEqual([evaluation("oc-1")]);
    expect(await second.listKnowledgeEntries()).toHaveLength(1);
    expect((await second.getInnovationOverride("inn-1"))?.status).toBe("zweryfikowane");
    expect(await second.listFeedback()).toEqual([{ route_id: "rt-1", value: "tak", comment: null, created_at: at(0) }]);
    expect(await second.listReports()).toEqual([report("zg-1")]);
    expect(await second.listModerationLog(10)).toEqual([entry]);
    expect((await second.listScreeningLog(NOW)).map((item) => item.id)).toEqual(["sl-2", "sl-1"]);
    await second.writeScreeningLog(screening(0), NOW);
    expect((await second.listScreeningLog(NOW))[0].id).toBe("sl-3");
    expect(await second.counters()).toEqual({ since, counts: { route: 2 } });
    expect(await second.markBriefGenerated("nd-1", at(0))).toBe(false);
    // The recovery point of the second start.
    expect(fs.existsSync(`${file}.bak`)).toBe(true);
    await second.close();
  });

  it("writes the changes of one tick as one whole file and leaves no temporary behind", async () => {
    const file = fileOf("burst");
    const repo = createFileRepository(file, { fresh: empty, now: clock });
    await repo.addNeed(need("nd-1"));
    await repo.addNeed(need("nd-2"));
    await repo.countEvent("need");
    // Nothing is written on the request's own tick.
    expect(fs.existsSync(file)).toBe(false);
    await repo.close();
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(saved).toMatchObject({ version: 1, pid: process.pid, state: { screeningSeq: 0, counters: [["need", 1]] } });
    expect(saved.state.needs.map((item: Need) => item.id)).toEqual(["nd-2", "nd-1"]);
    expect(fs.readdirSync(path.dirname(file))).toEqual(["records.json"]);
  });

  it("applies the retention defaults when it opens, and saves the result", async () => {
    const file = fileOf("retention");
    const first = createFileRepository(file, { fresh: empty, now: clock });
    await first.addContact(contact("kt-old", { created_at: at(-91 * DAY) }));
    await first.addContact(contact("kt-new", { created_at: at(-89 * DAY) }));
    await first.close();

    const second = createFileRepository(file, { fresh: empty, now: clock });
    expect((await second.listContacts()).map((item) => item.id)).toEqual(["kt-new"]);
    await second.close();
    expect(JSON.parse(fs.readFileSync(file, "utf8")).state.contacts.map((item: ContactRequest) => item.id)).toEqual(["kt-new"]);
  });

  it("opens a file saved before the idea cards' panel fields, the evaluations and the panel's knowledge existed", async () => {
    const file = fileOf("older");
    const first = createFileRepository(file, { fresh: empty, now: clock });
    await first.addIdea(idea("pm-1"));
    await first.close();
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const card of saved.state.ideas) {
      delete card.status;
      delete card.reply;
    }
    delete saved.state.evaluations;
    delete saved.state.knowledgeEntries;
    delete saved.state.innovationOverrides;
    fs.writeFileSync(file, JSON.stringify(saved));

    const second = createFileRepository(file, { fresh: empty, now: clock });
    expect(await second.getIdea("pm-1")).toMatchObject({ status: "nowy", reply: null });
    expect(await second.listEvaluations()).toEqual([]);
    expect(await second.listKnowledgeEntries()).toEqual([]);
    expect(await second.listInnovationOverrides()).toEqual([]);
    expect(fs.readdirSync(path.dirname(file)).some((name) => name.includes("unreadable"))).toBe(false);
    await second.close();
  });

  it("moves a file that is not a store aside and starts with the examples", async () => {
    const file = fileOf("unreadable");
    fs.writeFileSync(file, "{ not a store");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = createFileRepository(file, { now: clock });
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
    expect(fs.readdirSync(path.dirname(file)).filter((name) => name.startsWith("records.json.unreadable-"))).toHaveLength(1);
    expect((await repo.listNeeds()).map((item) => item.id)).toEqual(["nd-przyklad-1", "nd-przyklad-2", "nd-przyklad-3"]);
    expect((await repo.listReadiness()).map((item) => item.id)).toEqual(["gt-przyklad-1", "gt-przyklad-2"]);
    await repo.close();
  });

  it("refuses a file of a newer version instead of discarding it", () => {
    const file = fileOf("newer");
    fs.writeFileSync(file, JSON.stringify({ version: 2, saved_at: at(0), pid: 1, state: {} }));
    expect(() => createFileRepository(file, { now: clock })).toThrow(/version 2/);
    expect(fs.existsSync(file)).toBe(true);
  });
});
