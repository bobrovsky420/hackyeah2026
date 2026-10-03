import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/*
 * The ROPS console's access code (S7): ROPS_TOKEN from the environment
 * (12.9). The console token is the only cookie the specification allows
 * (12.6). The prototype's default code is written in AGENTS.md.
 */
export const TOKEN_COOKIE = "rops_token";

/** The name every moderation action is logged with (FR-12.8). */
export const REVIEWER_NAME = process.env.ROPS_REVIEWER ?? "Dział Innowacji Społecznych";

function consoleToken(): string {
  return process.env.ROPS_TOKEN || "rops-prototyp";
}

export function tokenMatches(value: string): boolean {
  const given = Buffer.from(value);
  const expected = Buffer.from(consoleToken());
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function isAuthenticated(): Promise<boolean> {
  const value = (await cookies()).get(TOKEN_COOKIE)?.value;
  return value !== undefined && tokenMatches(value);
}
