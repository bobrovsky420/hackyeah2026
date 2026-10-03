import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/*
 * The ROPS console's access code (S7): ROPS_TOKEN from the environment
 * (FR-9.1, 12.9). The console token is the only cookie the specification
 * allows (12.6). Without ROPS_TOKEN, `next dev` accepts the prototype's code
 * of AGENTS.md, and a production server keeps the console locked: that code
 * is public, so it must never open a deployed console.
 */
export const TOKEN_COOKIE = "rops_token";

const DEVELOPMENT_TOKEN = "rops-prototyp";

/** The name every moderation action is logged with (FR-12.8). */
export const REVIEWER_NAME = process.env.ROPS_REVIEWER ?? "Dział Innowacji Społecznych";

function consoleToken(): string | null {
  const token = process.env.ROPS_TOKEN?.trim();
  if (token) return token;
  return process.env.NODE_ENV === "production" ? null : DEVELOPMENT_TOKEN;
}

/** True on a production server without ROPS_TOKEN: no code opens the console. */
export function consoleLocked(): boolean {
  return consoleToken() === null;
}

export function tokenMatches(value: string): boolean {
  const token = consoleToken();
  if (token === null) return false;
  const given = Buffer.from(value);
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function isAuthenticated(): Promise<boolean> {
  const value = (await cookies()).get(TOKEN_COOKIE)?.value;
  return value !== undefined && tokenMatches(value);
}
