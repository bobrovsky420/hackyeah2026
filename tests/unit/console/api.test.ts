import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getExport } from "@/app/api/rops/export.csv/route";
import { GET as getStats } from "@/app/api/rops/stats/route";
import { requestAuthorized } from "@/server/console/auth";
import { setRepository } from "@/server/db";
import { createMemoryRepository } from "@/server/db/memory";
import type { Repository } from "@/server/db/repository";

/*
 * The console's two HTTP endpoints (9.2), the statistics and the CSV
 * export, on the memory repository: the access code, the Polish errors and
 * no-store on every answer. The console's changes are tested in
 * decisions.test.ts, as the server actions call them.
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

  it("answers both endpoints without the code with a Polish 401 and no-store", async () => {
    const anonymous = (path: string) => request(path, { token: null });
    const answers = [await getStats(anonymous("/api/rops/stats")), await getExport(anonymous("/api/rops/export.csv?what=needs"))];
    for (const answer of answers) {
      expect(answer.status).toBe(401);
      expect(answer.headers.get("cache-control")).toBe("no-store");
      expect(await body(answer)).toMatchObject({ error: "unauthorized", message: expect.stringContaining("Brak dostępu") });
    }
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
