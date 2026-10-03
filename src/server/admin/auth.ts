import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { envValue } from "@/lib/env";

/*
 * The panel's door (module VI, specification FR-9.1): one shared code from
 * ROPS_TOKEN, no accounts. A production server without the variable keeps
 * the panel locked; development alone accepts the prototype's code. The
 * session cookie holds a keyed hash of the code, never the code, so a
 * changed code ends every session. The reviewer's name, asked at the door,
 * goes into the moderation log with every action (FR-12.8).
 */

/** The prototype's code, accepted only outside production when ROPS_TOKEN is not set. */
export const DEV_CODE = "rops-demo";

export const SESSION_COOKIE = "rops_sesja";
export const REVIEWER_COOKIE = "rops_osoba";
/** When the reviewer last opened the dashboard: "nowe od ostatniej wizyty". */
export const LAST_VISIT_COOKIE = "rops_ostatnio";
const SESSION_HOURS = 12;

/** The code that opens the panel, or null when it stays locked. */
export function adminCode(): string | null {
  const configured = envValue("ROPS_TOKEN")?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? null : DEV_CODE;
}

function sessionValue(code: string): string {
  return createHmac("sha256", code).update("hubmi-rops-session-v1").digest("hex");
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Whether a typed code opens the panel. */
export function codeMatches(typed: string, code: string | null = adminCode()): boolean {
  return code !== null && sameText(typed.trim(), code);
}

/** Whether a session cookie still belongs to the current code. */
export function sessionMatches(value: string | undefined, code: string | null = adminCode()): boolean {
  return code !== null && value !== undefined && sameText(value, sessionValue(code));
}

export interface AdminSession {
  reviewer: string;
  lastVisit: string | null;
}

/** The reviewer of a valid session, or null. */
export async function adminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  if (!sessionMatches(store.get(SESSION_COOKIE)?.value)) return null;
  return { reviewer: store.get(REVIEWER_COOKIE)?.value || "ROPS", lastVisit: store.get(LAST_VISIT_COOKIE)?.value ?? null };
}

/** For every server action of the panel: the session, or back to the door. */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await adminSession();
  if (!session) redirect("/rops");
  return session;
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

/** Opens a session for the reviewer; false when the code is wrong or the panel is locked. */
export async function openSession(typed: string, reviewer: string): Promise<boolean> {
  const code = adminCode();
  if (!codeMatches(typed, code) || code === null) return false;
  const store = await cookies();
  const maxAge = SESSION_HOURS * 60 * 60;
  store.set(SESSION_COOKIE, sessionValue(code), { ...cookieOptions, maxAge });
  store.set(REVIEWER_COOKIE, reviewer.trim().slice(0, 80), { ...cookieOptions, maxAge });
  return true;
}

export async function closeSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(REVIEWER_COOKIE);
}

/** Remembers the dashboard visit, for the next one's "nowe" counts. */
export async function markVisit(at: string): Promise<void> {
  (await cookies()).set(LAST_VISIT_COOKIE, at, { ...cookieOptions, maxAge: 60 * 60 * 24 * 90 });
}
