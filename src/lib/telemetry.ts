import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { envValue } from "@/lib/env";

/*
 * The request log of 12.8: one JSON line per event, with the trace id of
 * the request it belongs to, so the model calls, the matching and the
 * route of one request read together. A trace starts at the API entry
 * (traced()) or in a server action (withTrace()); everything awaited
 * inside it, the model chain included, finds it through AsyncLocalStorage.
 *
 * Lines go to stdout and, when LOG_DIR is set, to
 * <LOG_DIR>/events-YYYY-MM-DD.jsonl; files older than 14 days go when the
 * day turns (12.6). A request with the header x-simulation-run comes from
 * the simulated users of scripts/simulate-users.ts and is marked
 * synthetic, so the analysis can keep it apart. Nothing here ever carries
 * user text, a client address or a key: callers pass ids, codes and
 * numbers only.
 */

export interface TraceContext {
  traceId: string;
  /** The API path or action name the trace started at. */
  entry: string;
  /** Set once the route of the request has its id. */
  routeId: string | null;
  synthetic: boolean;
  /** The simulation run and persona, from the request headers. */
  runId: string | null;
  persona: string | null;
}

export type EventFields = Record<string, unknown>;

// On globalThis, like the server's memory (src/server/ephemeral.ts), so route handlers, pages and actions share one store.
const holder = globalThis as typeof globalThis & { __traceStorage?: AsyncLocalStorage<TraceContext> };
const storage = (holder.__traceStorage ??= new AsyncLocalStorage<TraceContext>());
const LOG_RETENTION_DAYS = 14;
const HEADER_VALUE = /^[A-Za-z0-9._:-]{1,80}$/;

export function newTraceId(): string {
  return `tr-${randomBytes(6).toString("hex")}`;
}

/** The context of the request being served, if any. */
export function currentTrace(): TraceContext | undefined {
  return storage.getStore();
}

/** A header value safe to log: ids only, anything else is dropped. */
function headerId(headers: Headers, name: string): string | null {
  const value = headers.get(name)?.trim();
  return value && HEADER_VALUE.test(value) ? value : null;
}

/** A new context for one request; the simulation headers mark it synthetic. */
export function traceFromHeaders(entry: string, headers: Headers): TraceContext {
  const runId = headerId(headers, "x-simulation-run");
  return { traceId: newTraceId(), entry, routeId: null, synthetic: runId !== null, runId, persona: runId ? headerId(headers, "x-simulation-persona") : null };
}

export function withTrace<T>(context: TraceContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

/** Names the route of the current trace, so the lines after carry it. */
export function setTraceRoute(routeId: string): void {
  const context = storage.getStore();
  if (context) context.routeId = routeId;
}

/**
 * Wraps an API handler: a trace per request and one http_request line with
 * the status and the duration (unless `logRequest: false`, for the page
 * events, which are their own line). An exception is logged and thrown on.
 */
export function traced<Rest extends unknown[]>(
  entry: string,
  handler: (request: Request, ...rest: Rest) => Promise<Response>,
  options: { logRequest?: boolean } = {},
): (request: Request, ...rest: Rest) => Promise<Response> {
  const logRequest = options.logRequest ?? true;
  return (request, ...rest) => {
    const context = traceFromHeaders(entry, request.headers);
    return withTrace(context, async () => {
      const started = performance.now();
      try {
        const response = await handler(request, ...rest);
        if (logRequest) emit("http_request", { method: request.method, status: response.status, duration_ms: Math.round(performance.now() - started) });
        return response;
      } catch (error) {
        emit("http_request", { method: request.method, status: 500, duration_ms: Math.round(performance.now() - started), error: error instanceof Error ? error.name : "Error" });
        throw error;
      }
    });
  };
}

// ------------------------------------------------------------------ sink

export interface EventLine extends EventFields {
  ts: string;
  event: string;
  trace_id: string | null;
  entry: string | null;
  route_id: string | null;
  synthetic: boolean;
  run_id: string | null;
  persona: string | null;
}

type Sink = (line: EventLine) => void;

let sink: Sink | null = null;

/** For tests: catches the lines instead of stdout and the file; null restores the default. */
export function setEventSink(next: Sink | null): void {
  sink = next;
}

/** Writes one event line with the current trace. `fields` never holds user text. */
export function emit(event: string, fields: EventFields = {}): EventLine {
  const context = storage.getStore();
  const line: EventLine = {
    ts: new Date().toISOString(),
    event,
    trace_id: context?.traceId ?? null,
    entry: context?.entry ?? null,
    route_id: context?.routeId ?? null,
    synthetic: context?.synthetic ?? false,
    run_id: context?.runId ?? null,
    persona: context?.persona ?? null,
    ...fields,
  };
  if (sink) {
    sink(line);
    return line;
  }
  const json = JSON.stringify(line);
  console.info(json);
  writeToFile(line.ts.slice(0, 10), json);
  return line;
}

let pending: Promise<unknown> = Promise.resolve();
let lastDay: string | null = null;

function writeToFile(day: string, json: string): void {
  const dir = envValue("LOG_DIR");
  if (!dir) return;
  const root = path.resolve(/* turbopackIgnore: true */ process.cwd(), dir);
  const turned = day !== lastDay;
  lastDay = day;
  // One chain keeps the lines in order; a failed write loses its line, never the request.
  pending = pending
    .then(async () => {
      if (turned) {
        await mkdir(root, { recursive: true });
        await removeOldLogs(root, day);
      }
      await appendFile(path.join(root, `events-${day}.jsonl`), `${json}\n`, "utf8");
    })
    .catch((error: unknown) => {
      console.warn(`[telemetry] not written to ${root}: ${(error as Error).message}`);
    });
}

async function removeOldLogs(root: string, today: string): Promise<void> {
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - LOG_RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);
  for (const name of await readdir(root)) {
    const day = /^events-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name)?.[1];
    if (day && day < cutoff) await unlink(path.join(root, name));
  }
}

/** Resolves once every line handed to the file so far is written. For tests and the simulator's end. */
export function flushEvents(): Promise<void> {
  return pending.then(() => undefined);
}
