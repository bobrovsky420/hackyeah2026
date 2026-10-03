import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContactRequest, ModerationLogEntry } from "@/lib/contracts/records";
import type { Route } from "@/lib/contracts/route";
import { requestAuthorized } from "@/lib/server/auth";
import { setRepository } from "@/server/db";
import { createMemoryRepository } from "@/server/db/memory";
import type { Repository } from "@/server/db/repository";
import { GET as getNeeds } from "@/app/api/rops/needs/route";
import { PATCH as patchNeed } from "@/app/api/rops/needs/[id]/route";
import { GET as getContacts } from "@/app/api/rops/contact-requests/route";
import { GET as getModeration } from "@/app/api/rops/moderation/route";
import { PATCH as patchModeration } from "@/app/api/rops/moderation/[type]/[id]/route";
import { GET as getStats } from "@/app/api/rops/stats/route";
import { GET as getExport } from "@/app/api/rops/export.csv/route";

/*
 * The console's JSON API (9.2) on the memory repository: the access code,
 * the filters of the console's pages, the moderation rules and log, the
 * Polish errors and no-store on every answer.
 */

const TOKEN = "kod-testowy-rops";
let repo: Repository;

beforeEach(() => {
  vi.stubEnv("ROPS_TOKEN", TOKEN);
  repo = createMemoryRepository();
  setRepository(repo);
});
afterEach(() => {
  setRepository(undefined);
  vi.unstubAllEnvs();
});

function request(path: string, init: RequestInit & { token?: string | null; cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.token !== null) headers.set("authorization", `Bearer ${init.token ?? TOKEN}`);
  if (init.cookie) headers.set("cookie", init.cookie);
  return new Request(`http://localhost${path}`, { ...init, headers });
}

const patch = (path: string, body: unknown) => request(path, { method: "PATCH", body: JSON.stringify(body) });
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

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

async function body(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe("the access code", () => {
  it("accepts the code as a bearer token or as the console's cookie", () => {
    expect(requestAuthorized(request("/api/rops/stats"))).toBe(true);
    expect(requestAuthorized(request("/api/rops/stats", { token: null, cookie: `theme=dark; rops_token=${TOKEN}` }))).toBe(true);
  });

  it("refuses a wrong code, no code, and any code on a production server without ROPS_TOKEN", () => {
    expect(requestAuthorized(request("/api/rops/stats", { token: "zly-kod" }))).toBe(false);
    expect(requestAuthorized(request("/api/rops/stats", { token: null, cookie: "rops_token=zly-kod" }))).toBe(false);
    expect(requestAuthorized(request("/api/rops/stats", { token: null }))).toBe(false);
    vi.stubEnv("ROPS_TOKEN", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(requestAuthorized(request("/api/rops/stats", { token: "rops-prototyp" }))).toBe(false);
  });

  it("answers every endpoint without the code with a Polish 401 and no-store", async () => {
    const anonymous = (path: string, method = "GET") =>
      request(path, { token: null, method, body: method === "PATCH" ? "{}" : undefined });
    const answers = [
      await getNeeds(anonymous("/api/rops/needs")),
      await patchNeed(anonymous("/api/rops/needs/nd-przyklad-1", "PATCH"), params({ id: "nd-przyklad-1" })),
      await getContacts(anonymous("/api/rops/contact-requests")),
      await getModeration(anonymous("/api/rops/moderation?queue=needs")),
      await patchModeration(anonymous("/api/rops/moderation/need/nd-przyklad-1", "PATCH"), params({ type: "need", id: "nd-przyklad-1" })),
      await getStats(anonymous("/api/rops/stats")),
      await getExport(anonymous("/api/rops/export.csv?what=needs")),
    ];
    for (const answer of answers) {
      expect(answer.status).toBe(401);
      expect(answer.headers.get("cache-control")).toBe("no-store");
      expect(await body(answer)).toMatchObject({ error: "unauthorized", message: expect.stringContaining("Brak dostępu") });
    }
    // Nothing changed.
    expect((await repo.getNeed("nd-przyklad-1"))?.moderation.status).toBe("do-weryfikacji");
  });
});

describe("GET /api/rops/needs", () => {
  it("lists the needs with the filters of the Potrzeby page", async () => {
    const ids = async (query: string) => {
      const answer = await getNeeds(request(`/api/rops/needs${query}`));
      expect(answer.headers.get("cache-control")).toBe("no-store");
      const { items, count } = (await body(answer)) as { items: { id: string }[]; count: number };
      expect(count).toBe(items.length);
      return items.map((item) => item.id);
    };
    expect(await ids("")).toEqual(["nd-przyklad-1", "nd-przyklad-2", "nd-przyklad-3"]);
    expect(await ids("?kategoria=cudzoziemcy")).toEqual(["nd-przyklad-3"]);
    expect(await ids("?gmina=krak")).toEqual(["nd-przyklad-3"]);
    expect(await ids("?status=zamknieta")).toEqual([]);
  });

  it("refuses an unknown status or category with the field named", async () => {
    const answer = await getNeeds(request("/api/rops/needs?status=gotowe"));
    expect(answer.status).toBe(422);
    expect(await body(answer)).toMatchObject({ error: "invalid", field: "status", message: "Nieprawidłowa wartość w polu status." });
    expect((await getNeeds(request("/api/rops/needs?kategoria=koty"))).status).toBe(422);
  });
});

describe("PATCH /api/rops/needs/{id}", () => {
  it("changes the status, keeps the note it was not given, and logs the change", async () => {
    await patchNeed(patch("/api/rops/needs/nd-przyklad-1", { status: "w-analizie", note: "Do rozmowy z gminą." }), params({ id: "nd-przyklad-1" }));
    const answer = await patchNeed(patch("/api/rops/needs/nd-przyklad-1", { status: "temat-naboru" }), params({ id: "nd-przyklad-1" }));
    expect(answer.status).toBe(200);
    expect((await body(answer)).item).toMatchObject({ id: "nd-przyklad-1", status: "temat-naboru", note_pl: "Do rozmowy z gminą." });
    const cleared = await patchNeed(patch("/api/rops/needs/nd-przyklad-1", { note: "" }), params({ id: "nd-przyklad-1" }));
    expect((await body(cleared)).item).toMatchObject({ status: "temat-naboru", note_pl: null });
    const log = await repo.listModerationLog(10);
    expect(log.map((entry) => [entry.action, entry.status])).toEqual([
      ["status", "temat-naboru"],
      ["status", "temat-naboru"],
      ["status", "w-analizie"],
    ]);
  });

  it("answers 422 for a wrong status, 404 for an unknown need, 400 for a body that is not JSON", async () => {
    expect((await patchNeed(patch("/api/rops/needs/nd-przyklad-1", { status: "gotowe" }), params({ id: "nd-przyklad-1" }))).status).toBe(422);
    const unknown = await patchNeed(patch("/api/rops/needs/nd-nie-ma", { status: "nowa" }), params({ id: "nd-nie-ma" }));
    expect(unknown.status).toBe(404);
    expect(await body(unknown)).toMatchObject({ message: "Nie znaleźliśmy tego wpisu." });
    const broken = request("/api/rops/needs/nd-przyklad-1", { method: "PATCH", body: "nie json" });
    expect((await patchNeed(broken, params({ id: "nd-przyklad-1" }))).status).toBe(400);
  });
});

describe("GET /api/rops/contact-requests", () => {
  it("lists the requests and filters them by status", async () => {
    await repo.addContact(contact("kt-1"));
    await repo.addContact(contact("kt-2", { status: "przekazane", created_at: "2026-10-03T11:00:00.000Z" }));
    const all = (await body(await getContacts(request("/api/rops/contact-requests")))) as { items: { id: string }[] };
    expect(all.items.map((item) => item.id)).toEqual(["kt-2", "kt-1"]);
    const relayed = (await body(await getContacts(request("/api/rops/contact-requests?status=przekazane")))) as { items: { id: string }[] };
    expect(relayed.items.map((item) => item.id)).toEqual(["kt-2"]);
    // A request without a route matches no gmina.
    const inPlace = (await body(await getContacts(request("/api/rops/contact-requests?gmina=krak")))) as { count: number };
    expect(inPlace.count).toBe(0);
    expect((await getContacts(request("/api/rops/contact-requests?status=nowa"))).status).toBe(422);
  });
});

describe("the moderation queues", () => {
  it("lists one queue or all of them, and refuses an unknown queue", async () => {
    const needs = (await body(await getModeration(request("/api/rops/moderation?queue=needs")))) as { items: { id: string }[] };
    // Only the needs whose authors allowed publication wait for it.
    expect(needs.items.map((item) => item.id)).toEqual(["nd-przyklad-1", "nd-przyklad-3"]);
    const all = (await body(await getModeration(request("/api/rops/moderation")))) as { queues: Record<string, unknown[]> };
    expect(Object.keys(all.queues)).toEqual(["needs", "contacts", "readiness", "reports", "declined"]);
    const unknown = await getModeration(request("/api/rops/moderation?queue=wszystko"));
    expect(unknown.status).toBe(422);
    expect(await body(unknown)).toMatchObject({ field: "queue" });
  });

  it("approves once, logs the reviewer, and answers 409 to a second decision", async () => {
    const first = await patchModeration(patch("/api/rops/moderation/need/nd-przyklad-1", { action: "approve", note: "OK" }), params({ type: "need", id: "nd-przyklad-1" }));
    expect(first.status).toBe(200);
    expect(await body(first)).toMatchObject({ item: { moderation: { status: "zatwierdzone" } }, message: "Opublikowano potrzebę." });
    const second = await patchModeration(patch("/api/rops/moderation/need/nd-przyklad-1", { action: "reject", reason: "spam" }), params({ type: "need", id: "nd-przyklad-1" }));
    expect(second.status).toBe(409);
    expect(await body(second)).toMatchObject({ error: "gone", message: "Ten wpis nie czeka już na decyzję." });
    const [entry] = await repo.listModerationLog(5);
    expect(entry).toMatchObject<Partial<ModerationLogEntry>>({ target_type: "need", target_id: "nd-przyklad-1", action: "zatwierdzone", note_pl: "OK" });
    expect(entry.reviewer).toBeTruthy();
  });

  it("refuses a rejection without a reason from the fixed list, and records the chosen one", async () => {
    await repo.addContact(contact("kt-1"));
    const target = params({ type: "contacts", id: "kt-1" });
    const missing = await patchModeration(patch("/api/rops/moderation/contacts/kt-1", { action: "reject", reason: "bo tak" }), target);
    expect(missing.status).toBe(422);
    expect(await body(missing)).toMatchObject({ error: "reason_missing", field: "reason", message: "Wybierz powód odrzucenia." });
    const rejected = await patchModeration(patch("/api/rops/moderation/contacts/kt-1", { action: "reject", reason: "spam" }), target);
    expect(await body(rejected)).toMatchObject({
      item: { status: "zamkniete", moderation: { status: "odrzucone", reason_pl: "Spam lub reklama" } },
    });
  });

  it("allows only the actions that fit the type", async () => {
    const wrong = await patchModeration(patch("/api/rops/moderation/readiness/gt-1", { action: "approve" }), params({ type: "readiness", id: "gt-1" }));
    expect(wrong.status).toBe(422);
    expect(await body(wrong)).toMatchObject({ error: "action_not_allowed", field: "action" });
    const declined = await patchModeration(patch("/api/rops/moderation/declined/rt-1", { action: "reject", reason: "spam" }), params({ type: "declined", id: "rt-1" }));
    expect(declined.status).toBe(422);
    const unknown = await patchModeration(patch("/api/rops/moderation/innowacja/x", { action: "approve" }), params({ type: "innowacja", id: "x" }));
    expect(unknown.status).toBe(404);
    expect(await body(unknown)).toMatchObject({ error: "unknown_type" });
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

    const queue = (await body(await getModeration(request("/api/rops/moderation?queue=declined")))) as { items: Record<string, unknown>[] };
    expect(queue.items).toMatchObject([
      { id: "sl-2", source: "log", kind: "contact", category: "spam", text: "Kup teraz", reference_code: null },
      { id: "rt-2", source: "route", mild: true, text: null, log_id: null },
      { id: "rt-1", source: "route", mild: false, text: "Tekst do przeglądu.", log_id: "sl-1", reference_code: "HM-2026-1234" },
    ]);

    const reviewed = await patchModeration(patch("/api/rops/moderation/declined/rt-1", { action: "review", note: "Słusznie." }), params({ type: "declined", id: "rt-1" }));
    expect(reviewed.status).toBe(200);
    expect(await body(reviewed)).toMatchObject({ message: "Oznaczono odmowę jako przejrzaną." });
    expect((await repo.listScreeningLog(now)).find((entry) => entry.id === "sl-1")?.reviewed_at).not.toBeNull();
    await patchModeration(patch("/api/rops/moderation/declined/sl-2", { action: "review" }), params({ type: "declined", id: "sl-2" }));

    const left = (await body(await getModeration(request("/api/rops/moderation?queue=declined")))) as { items: { id: string }[] };
    expect(left.items.map((item) => item.id)).toEqual(["rt-2"]);
    const again = await patchModeration(patch("/api/rops/moderation/declined/sl-2", { action: "review" }), params({ type: "declined", id: "sl-2" }));
    expect(again.status).toBe(409);
    const log = await repo.listModerationLog(5);
    expect(log.map((entry) => [entry.target_type, entry.target_id, entry.action])).toEqual([
      ["declined", "sl-2", "przejrzane"],
      ["declined", "rt-1", "przejrzane"],
    ]);
  });
});

describe("GET /api/rops/stats and the CSV exports", () => {
  it("serves the statistics", async () => {
    await repo.countEvent("route_created:route");
    const answer = await getStats(request("/api/rops/stats"));
    expect(answer.status).toBe(200);
    const stats = await body(answer);
    expect(stats).toMatchObject({ routes_by_mode: { route: 1, declined: 0 }, needs: { total: 0 }, llm: { scope: "memory" } });
  });

  it("exports the content reports and the screening log, and refuses an unknown export in Polish", async () => {
    await repo.addReport({
      id: "zg-1",
      created_at: "2026-10-03T10:00:00.000Z",
      target: { type: "route", id: "rt-1" },
      reason: "obrazliwe",
      comment: "Zły opis",
      moderation: { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null },
    });
    const reports = await getExport(request("/api/rops/export.csv?what=reports"));
    expect(reports.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    const bytes = new Uint8Array(await reports.arrayBuffer());
    // The byte order mark for Polish Excel (FR-9.2); text() would drop it.
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder().decode(bytes);
    expect(csv).toContain("zg-1;2026-10-03T10:00:00.000Z;route;rt-1;obrazliwe;Zły opis;do-weryfikacji");
    const screening = await getExport(request("/api/rops/export.csv?what=screening"));
    expect((await screening.text()).split("\r\n")[0]).toContain("skrot_tekstu;tekst;tekst_do");
    const unknown = await getExport(request("/api/rops/export.csv?what=wszystko"));
    expect(unknown.status).toBe(404);
    expect(await body(unknown)).toMatchObject({ error: "unknown_export" });
  });
});
