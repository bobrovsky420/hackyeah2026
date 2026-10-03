import { memory } from "./store";

/*
 * The route limit of FR-2.4 and 12.5: 10 route requests per minute per
 * client address, kept only in the server's memory. RATE_LIMIT_ROUTES_PER_MINUTE
 * raises it for the test runs, which create many routes from one address.
 */
const WINDOW_MS = 60_000;

function limit(): number {
  const value = Number(process.env.RATE_LIMIT_ROUTES_PER_MINUTE);
  return Number.isFinite(value) && value > 0 ? value : 10;
}

/** The client's address as the proxy (Caddy, 12.9) reports it. */
export function clientAddress(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}

/** Counts a route request; false when the address used up its minute. */
export function allowRouteRequest(address: string): boolean {
  const now = Date.now();
  const recent = (memory.rateHits.get(address) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= limit()) {
    memory.rateHits.set(address, recent);
    return false;
  }
  recent.push(now);
  memory.rateHits.set(address, recent);
  return true;
}
