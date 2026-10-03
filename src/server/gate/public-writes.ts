import "server-only";
import { envValue } from "@/lib/env";
import { t } from "@/lib/i18n";
import { memory } from "@/lib/server/store";
import type { ScreeningOutcome } from "@/server/contracts";
import { HONEYPOT_FIELD } from "./honeypot-field";
import { contactRequestsPerDay, LIMIT_WINDOW_MS, readinessRegistrationsPerDay } from "./thresholds";

/*
 * The guards of the public write endpoints (FR-6.4, FR-12.14): the kill
 * switch PUBLIC_WRITES=false, the honeypot field, the daily limits per
 * e-mail address, phone or client address, and the answers the forms get
 * for each. The limits are kept in the server's memory only, gone after a
 * restart; the keys never leave it.
 */

/** 503 when PUBLIC_WRITES=false: every public form is read-only while the tool is flooded. */
export function publicWritesClosed(): Response | null {
  if (envValue("PUBLIC_WRITES")?.trim().toLowerCase() !== "false") return null;
  return Response.json({ error: "public_writes_off", message: t("forms.closed.text") }, { status: 503 });
}

/** True when a bot filled the hidden field; the caller answers like a success and stores nothing. */
export function honeypotFilled(body: Record<string, unknown>): boolean {
  const value = body[HONEYPOT_FIELD];
  return typeof value === "string" ? value.trim() !== "" : value !== undefined && value !== null && value !== false;
}

export type LimitKind = "contact" | "readiness";

const LIMITS: Record<LimitKind, () => number> = {
  contact: contactRequestsPerDay,
  readiness: readinessRegistrationsPerDay,
};

/** The identity keys of one submission; e-mail addresses and phone numbers are evened out first. */
export function limitKeys(kind: LimitKind, identities: { email?: string | null; phone?: string | null; client?: string | null }): string[] {
  const keys: string[] = [];
  if (identities.email) keys.push(`${kind}:email:${identities.email.trim().toLowerCase()}`);
  if (identities.phone) keys.push(`${kind}:phone:${identities.phone.replace(/\D/g, "").replace(/^(?:00)?48(?=\d{9}$)/, "")}`);
  if (identities.client) keys.push(`${kind}:client:${identities.client}`);
  return keys;
}

/**
 * Counts one submission against every key; false (and nothing counted) when
 * any key already used up its day.
 */
export function allowSubmission(kind: LimitKind, keys: string[], now = Date.now()): boolean {
  for (const [key, times] of memory.abuseHits) {
    if (times.every((time) => now - time >= LIMIT_WINDOW_MS)) memory.abuseHits.delete(key);
  }
  const recent = keys.map((key) => (memory.abuseHits.get(key) ?? []).filter((time) => now - time < LIMIT_WINDOW_MS));
  if (recent.some((times) => times.length >= LIMITS[kind]())) return false;
  keys.forEach((key, index) => memory.abuseHits.set(key, [...recent[index], now]));
  return true;
}

/** The polite 429 of the limits. */
export function limitReached(): Response {
  return Response.json({ error: "limit", message: t("forms.limit.text") }, { status: 429 });
}

/**
 * The answer for a text the gate stopped: `redirected` is a 200 with the
 * outcome and nothing stored; `declined` and `off_topic` are a 422 the
 * forms show as a failure.
 */
export function screenedResponse(outcome: Exclude<ScreeningOutcome, "need">): Response {
  if (outcome === "redirected") return Response.json({ outcome }, { status: 200 });
  return Response.json({ error: "screened", outcome }, { status: 422 });
}
