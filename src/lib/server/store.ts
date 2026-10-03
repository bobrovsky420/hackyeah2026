import "server-only";
import { randomBytes } from "node:crypto";
import { repository } from "@/server/db";

export { CONSENT_VERSION } from "@/server/db/examples";

/*
 * What the server remembers between requests. Everything that must last is
 * in the repository of src/server/db/ (PostgreSQL, or memory without
 * DATABASE_URL). Only the short-lived guards stay here, in the server's
 * memory, in both cases: the rate limiter's request times per client
 * address, which 12.5 and FR-10.2 allow nowhere else, and the gate's
 * hashed repeat and abuse keys (FR-12.1, FR-6.4, FR-12.14), which live for
 * an hour or a day and must not outlive a restart as identities. They sit
 * on globalThis so that pages, route handlers and server actions share one
 * copy.
 */
export interface EphemeralMemory {
  /** The rate limiter's memory (12.5): request times per client address, never written elsewhere. */
  rateHits: Map<string, number[]>;
  /** The gate's memory of repeated texts (FR-12.1): hashes only, for one hour. */
  gateRepeats: Map<string, { times: number[]; redirected: boolean }>;
  /** Identical route requests of one client (FR-12.14): the hash of the request and the route it got, for one hour. */
  routeRepeats: Map<string, { routeId: string; at: number }>;
  /** The abuse limits of FR-6.4 and FR-12.14: submission times per e-mail, phone or client address, for one day. */
  abuseHits: Map<string, number[]>;
}

const holder = globalThis as typeof globalThis & { __ephemeralMemory?: EphemeralMemory };
export const memory: EphemeralMemory = (holder.__ephemeralMemory ??= {
  rateHits: new Map(),
  gateRepeats: new Map(),
  routeRepeats: new Map(),
  abuseHits: new Map(),
});

/** Ids in the style of the specification: rt-2026-10-03-7f3a. */
export function newId(prefix: "rt" | "nd" | "kt" | "gt" | "zg"): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}-${date}-${randomBytes(3).toString("hex")}`;
}

/** Event counters of FR-10.2, without cookies or personal data. */
export async function countEvent(name: string): Promise<void> {
  await repository().countEvent(name);
}

export function nowIso(): string {
  return new Date().toISOString();
}
