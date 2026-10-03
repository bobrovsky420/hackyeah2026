import { beforeEach, describe, expect, it } from "vitest";
import type { ContactRequest, ModerationLogEntry, Route } from "@/lib/contracts";
import { changeRecord, decide, type ConsoleContext } from "@/server/console/decisions";
import { listContactsFiltered, loadQueues } from "@/server/console/queries";
import { createMemoryRepository } from "@/server/db/memory";
import type { Repository } from "@/server/db/repository";

/*
 * The console's changes on the memory repository, as the server actions of
 * src/app/rops/actions.ts call them: the status and note of a record
 * (FR-9.2), the moderation decisions and their rules (FR-12.8), the queues
 * and the contact filter.
 */

const NOW = "2026-10-03T12:00:00.000Z";
let repo: Repository;
let ctx: ConsoleContext;

beforeEach(() => {
  repo = createMemoryRepository();
  ctx = { repo, reviewer: "Recenzent testowy", now: () => NOW };
});

function contact(id: string, over: Partial<ContactRequest> = {}): ContactRequest {
  return {
    id,
    created_at: "2026-10-03T10:00:00.000Z",
    route_id: null,
    need_id: null,
    target: { type: "innovation", id: "inn-1" },
    requester: { name: "Ala", organisation: null, email: "ala@example.org" },
    message: "Chcemy wdrożyć ten program.",
    screening: { outcome: "need" },
    consent: { text_version: "v1", timestamp: "2026-10-03T10:00:00.000Z" },
    moderation: { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null },
    status: "nowe",
    note_pl: null,
    ...over,
  };
}

function declinedRoute(id: string, createdAt: string, over: Partial<Route> = {}): Route {
  return {
    id,
    created_at: createdAt,
    input: { problem_text: null, place_terc: null, place_name: null, role: null, target_groups: [] },
    mode: "declined",
    need_summary_pl: null,
    mode_reason_pl: null,
    screening: { category: "harm", confidence: 0.9, sensitive_topics: [], redactions: 0, crisis_banner: false },
    clarification_needed: false,
    summary_pl: null,
    solutions: [],
    knowledge: [],
    people: { innovators: [], implementers_nearby: [], advisor: null, readiness: { count: 0, names_with_consent: [] } },
    path: { applicant_type: "", cost_band: "unknown", paths: [] },
    next_steps: [],
    unknowns_pl: [],
    engine: { provider: "rules", model: "", prompt_version: "", data_version: "", latency_ms: 5, cached: false },
    label_pl: "",
    reference_code: "HM-2026-1234",
    ...over,
  } as unknown as Route;
}

describe("changeRecord", () => {
  it("changes the status and the note, and logs each change with the reviewer", async () => {
    const first = await changeRecord({ kind: "need", id: "nd-przyklad-1", status: "w-analizie", note: "Do rozmowy z gminą." }, ctx);
    expect(first).toMatchObject({ ok: true, item: { id: "nd-przyklad-1", status: "w-analizie", note_pl: "Do rozmowy z gminą." } });
    const second = await changeRecord({ kind: "need", id: "nd-przyklad-1", status: "temat-naboru", note: null }, ctx);
    expect(second).toMatchObject({ ok: true, item: { status: "temat-naboru", note_pl: null } });
    const log = await repo.listModerationLog(10);
    expect(log.map((entry) => [entry.action, entry.status, entry.reviewer])).toEqual([
      ["status", "temat-naboru", "Recenzent testowy"],
      ["status", "w-analizie", "Recenzent testowy"],
    ]);
  });

  it("refuses a status outside the list and an unknown record, and logs neither", async () => {
    expect(await changeRecord({ kind: "need", id: "nd-przyklad-1", status: "gotowe", note: null }, ctx)).toEqual({ ok: false, error: "invalid_status" });
    expect(await changeRecord({ kind: "need", id: "nd-nie-ma", status: "nowa", note: null }, ctx)).toEqual({ ok: false, error: "not_found" });
    expect(await repo.listModerationLog(10)).toEqual([]);
  });
});

describe("decide", () => {
  it("approves once, logs the reviewer, and reports a second decision as gone", async () => {
    const first = await decide({ kind: "need", id: "nd-przyklad-1", approve: true, reason: null, note: "OK" }, ctx);
    expect(first).toMatchObject({ ok: true, item: { moderation: { status: "zatwierdzone" } }, message: "Opublikowano potrzebę." });
    const second = await decide({ kind: "need", id: "nd-przyklad-1", approve: false, reason: "spam", note: null }, ctx);
    expect(second).toMatchObject({ ok: false, error: "gone", message: "Ten wpis nie czeka już na decyzję." });
    const [entry] = await repo.listModerationLog(5);
    expect(entry).toMatchObject<Partial<ModerationLogEntry>>({
      target_type: "need",
      target_id: "nd-przyklad-1",
      action: "zatwierdzone",
      note_pl: "OK",
      reviewer: "Recenzent testowy",
    });
  });

  it("refuses a rejection without a reason from the fixed list, and records the chosen one", async () => {
    await repo.addContact(contact("kt-1"));
    const missing = await decide({ kind: "contact", id: "kt-1", approve: false, reason: "bo tak", note: null }, ctx);
    expect(missing).toMatchObject({ ok: false, error: "reason_missing", message: "Wybierz powód odrzucenia." });
    expect(await repo.listModerationLog(5)).toEqual([]);
    const rejected = await decide({ kind: "contact", id: "kt-1", approve: false, reason: "spam", note: null }, ctx);
    expect(rejected).toMatchObject({
      ok: true,
      item: { status: "zamkniete", moderation: { status: "odrzucone", reason_pl: "Spam lub reklama" } },
    });
  });

  it("merges declined routes and kept texts into one queue and reviews both sources of an item", async () => {
    const now = Date.now();
    const iso = (offset: number) => new Date(now + offset).toISOString();
    const base = {
      kind: "need" as const,
      category: "harm" as const,
      confidence: 0.9,
      outcome: "declined" as const,
      sensitive_topics: [],
      redaction_count: 0,
      rules_fired: ["model:harm"],
      prompt_version: "screen-v1",
      text_sha256: "ab".repeat(32),
      text: "Tekst do przeglądu.",
      text_until: iso(7 * 86_400_000),
    };
    await repo.saveRoute(declinedRoute("rt-1", iso(-3000)));
    await repo.saveRoute(declinedRoute("rt-2", iso(-1000), { mode_reason_pl: "Nie możemy automatycznie przygotować drogi dla tego opisu." }));
    await repo.writeScreeningLog({ ...base, at: iso(-2900), ref: "rt-1" }, now);
    await repo.writeScreeningLog({ ...base, at: iso(-500), kind: "contact", category: "spam", outcome: "off_topic", text: "Kup teraz", ref: null }, now);

    const queue = (await loadQueues(repo, now)).declined;
    expect(queue).toMatchObject([
      { id: "sl-2", source: "log", kind: "contact", category: "spam", text: "Kup teraz", reference_code: null },
      { id: "rt-2", source: "route", mild: true, text: null, log_id: null },
      { id: "rt-1", source: "route", mild: false, text: "Tekst do przeglądu.", log_id: "sl-1", reference_code: "HM-2026-1234" },
    ]);

    const reviewed = await decide({ kind: "declined", id: "rt-1", approve: true, reason: null, note: "Słusznie." }, ctx);
    expect(reviewed).toMatchObject({ ok: true, message: "Oznaczono odmowę jako przejrzaną." });
    expect((await repo.listScreeningLog(now)).find((entry) => entry.id === "sl-1")?.reviewed_at).not.toBeNull();
    await decide({ kind: "declined", id: "sl-2", approve: true, reason: null, note: null }, ctx);

    expect((await loadQueues(repo, now)).declined.map((item) => item.id)).toEqual(["rt-2"]);
    expect(await decide({ kind: "declined", id: "sl-2", approve: true, reason: null, note: null }, ctx)).toMatchObject({ ok: false, error: "gone" });
    const log = await repo.listModerationLog(5);
    expect(log.map((entry) => [entry.target_type, entry.target_id, entry.action])).toEqual([
      ["declined", "sl-2", "przejrzane"],
      ["declined", "rt-1", "przejrzane"],
    ]);
  });
});

describe("the queues and the contact filter", () => {
  it("lists every queue with what still waits for a decision", async () => {
    const queues = await loadQueues(repo);
    expect(Object.keys(queues)).toEqual(["needs", "contacts", "readiness", "reports", "declined"]);
    // Only the needs whose authors allowed publication wait for it.
    expect(queues.needs.map((need) => need.id)).toEqual(["nd-przyklad-1", "nd-przyklad-3"]);
  });

  it("filters the contact requests by status and by the gmina of their route", async () => {
    await repo.addContact(contact("kt-1"));
    await repo.addContact(contact("kt-2", { status: "przekazane", created_at: "2026-10-03T11:00:00.000Z" }));
    expect((await listContactsFiltered(repo, { gmina: "" })).map((item) => item.id)).toEqual(["kt-2", "kt-1"]);
    expect((await listContactsFiltered(repo, { status: "przekazane", gmina: "" })).map((item) => item.id)).toEqual(["kt-2"]);
    // A request without a route matches no gmina.
    expect(await listContactsFiltered(repo, { gmina: "krak" })).toEqual([]);
  });
});
