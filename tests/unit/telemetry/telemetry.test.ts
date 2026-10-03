import { afterEach, describe, expect, it } from "vitest";
import { emit, setEventSink, setTraceRoute, traced, traceFromHeaders, withTrace, type EventLine } from "@/lib/telemetry";

function capture(): EventLine[] {
  const lines: EventLine[] = [];
  setEventSink((line) => lines.push(line));
  return lines;
}

afterEach(() => setEventSink(null));

describe("telemetry", () => {
  it("writes a line without a trace outside a request", () => {
    const lines = capture();
    emit("count", { name: "need_saved" });
    expect(lines).toEqual([expect.objectContaining({ event: "count", name: "need_saved", trace_id: null, synthetic: false })]);
  });

  it("gives every line of one request the same trace, and the route once it is known", async () => {
    const lines = capture();
    await withTrace(traceFromHeaders("POST /api/routes", new Headers()), async () => {
      emit("gate_screened");
      await Promise.resolve();
      setTraceRoute("rt-2026-10-03-abc123");
      emit("route_completed");
    });
    expect(lines[0].trace_id).toMatch(/^tr-[0-9a-f]{12}$/);
    expect(lines[1].trace_id).toBe(lines[0].trace_id);
    expect(lines[0].route_id).toBeNull();
    expect(lines[1].route_id).toBe("rt-2026-10-03-abc123");
    expect(lines[1].entry).toBe("POST /api/routes");
  });

  it("marks a simulated request as synthetic and keeps only id-like header values", () => {
    const run = traceFromHeaders("x", new Headers({ "x-simulation-run": "sim-2026-10-03", "x-simulation-persona": "D03" }));
    expect(run).toMatchObject({ synthetic: true, runId: "sim-2026-10-03", persona: "D03" });
    const odd = traceFromHeaders("x", new Headers({ "x-simulation-run": "Jan Kowalski, ul. Dluga 5" }));
    expect(odd).toMatchObject({ synthetic: false, runId: null, persona: null });
  });

  it("logs the status and duration of a traced handler, and a thrown error as 500", async () => {
    const lines = capture();
    const ok = traced("POST /api/x", async () => new Response(null, { status: 204 }));
    await ok(new Request("http://localhost/api/x", { method: "POST" }));
    const failing = traced("POST /api/y", async () => {
      throw new TypeError("boom");
    });
    await expect(failing(new Request("http://localhost/api/y", { method: "POST" }))).rejects.toThrow("boom");
    expect(lines.map((line) => [line.event, line.entry, line.status])).toEqual([
      ["http_request", "POST /api/x", 204],
      ["http_request", "POST /api/y", 500],
    ]);
    expect(lines[1].error).toBe("TypeError");
  });
});
