import { pageEventsEnabled } from "@/lib/env";
import { emit, setTraceRoute, traced } from "@/lib/telemetry";
import { memory } from "@/server/ephemeral";
import { clientAddress } from "@/server/rate-limit";
import { readJson } from "@/server/validate";

const EVENTS = ["page_viewed", "page_left", "link_clicked", "button_clicked"] as const;
/** A path, a host or a code: no spaces, no query, nothing a reader typed. */
const SAFE = /^[A-Za-z0-9/_.:@-]{1,200}$/;
const VISIT = /^v-[0-9a-f]{12}$/;
const PER_MINUTE = 120;

function safe(value: unknown): string | null {
  return typeof value === "string" && SAFE.test(value) ? value : null;
}

/** 120 events a minute per address, in the rate limiter's memory. */
function allow(client: string): boolean {
  const key = `events|${client}`;
  const now = Date.now();
  const recent = (memory.rateHits.get(key) ?? []).filter((time) => now - time < 60_000);
  const allowed = recent.length < PER_MINUTE;
  if (allowed) recent.push(now);
  memory.rateHits.set(key, recent);
  return allowed;
}

/**
 * POST /api/events: one page event of src/components/shell/page-events.tsx
 * into the request log as `ui_<event>`. Without PAGE_EVENTS=on every event
 * is dropped. Always 204, so the page never waits on it or shows an error.
 */
async function post(request: Request) {
  const done = new Response(null, { status: 204 });
  if (!pageEventsEnabled() || !allow(clientAddress(request.headers))) return done;
  const body = await readJson(request);
  const event = EVENTS.find((name) => name === body?.event);
  const path = safe(body?.path);
  if (!body || !event || !path) return done;

  const routeId = /^\/droga\/(rt-[A-Za-z0-9-]+)$/.exec(path)?.[1];
  if (routeId) setTraceRoute(routeId);
  const duration = Number(body.duration_ms);
  emit(`ui_${event}`, {
    path,
    visit_id: typeof body.visit_id === "string" && VISIT.test(body.visit_id) ? body.visit_id : null,
    target: safe(body.target),
    target_id: safe(body.target_id),
    section: safe(body.section),
    duration_ms: Number.isFinite(duration) && duration >= 0 ? Math.min(Math.round(duration), 86_400_000) : null,
  });
  return done;
}

export const POST = traced("POST /api/events", post, { logRequest: false });
