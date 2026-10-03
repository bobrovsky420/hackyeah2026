import { envValue } from "@/lib/env";
import type { Repository, RetentionCounts, RetentionCutoffs } from "@/server/db/repository";

/*
 * The retention defaults of 12.6 (OP-18, the lawyer's call by 1 October
 * 2026) as the cut-offs of one run, which the store makes when it opens
 * and once a day after that (src/server/db/file.ts):
 * - routes: 30 days after the event (HackYeah ends on 4 October 2026), so
 *   from ROUTES_UNTIL on, every route created before it goes with its
 *   feedback; routes created later stay until ROPS sets a later date;
 * - contact requests: 90 days after they were sent;
 * - readiness registrations: after their `retention_until` (12 months,
 *   set at registration, FR-6.5);
 * - the screening log: entries after 14 days ("logs 14 days"), the kept
 *   texts of `declined` and spam after their seven days (FR-12.7).
 * Needs stay until ROPS decides (12.6); the moderation log and the content
 * reports have no period in 12.6 and are left alone.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The day from which the routes of the event go: 30 days after 4 October 2026, the day after. */
export const DEFAULT_ROUTES_UNTIL = "2026-11-04";
export const CONTACT_RETENTION_DAYS = 90;

export interface RetentionOptions {
  /** YYYY-MM-DD, read as 00:00 UTC. */
  routesUntil?: string;
}

export function isDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** The cut-offs of a run at `now`. */
export function retentionCutoffs(now: Date, options: RetentionOptions = {}): RetentionCutoffs {
  const routesUntil = options.routesUntil ?? DEFAULT_ROUTES_UNTIL;
  if (!isDay(routesUntil)) throw new Error(`routes cut-off is not a date (YYYY-MM-DD): ${routesUntil}`);
  const routesStart = new Date(`${routesUntil}T00:00:00Z`);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(now);
  return {
    routesBefore: now >= routesStart ? routesStart.toISOString() : null,
    contactsBefore: new Date(now.getTime() - CONTACT_RETENTION_DAYS * DAY_MS).toISOString(),
    readinessBefore: today,
    screeningAt: now.toISOString(),
  };
}

/**
 * One run of the defaults at `now`: `RETENTION_ROUTES_UNTIL` moves the
 * routes' day (a value that is not a date is reported and ignored, so a
 * typo never keeps the store from opening); what went is logged.
 */
export async function applyRetentionDefaults(repo: Repository, now: Date): Promise<RetentionCounts> {
  let routesUntil = envValue("RETENTION_ROUTES_UNTIL");
  if (routesUntil !== undefined && !isDay(routesUntil)) {
    console.error(`[store] RETENTION_ROUTES_UNTIL is not a date (YYYY-MM-DD): ${routesUntil}; the routes' day stays ${DEFAULT_ROUTES_UNTIL}`);
    routesUntil = undefined;
  }
  const counts = await repo.applyRetention(retentionCutoffs(now, { routesUntil }), { dryRun: false });
  const removed = Object.entries(counts).filter(([, count]) => count > 0);
  if (removed.length > 0) console.log(`[store] retention removed ${removed.map(([name, count]) => `${name} ${count}`).join(", ")}`);
  return counts;
}
