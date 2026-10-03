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

/** The console cookie's value in a Cookie header, or undefined. */
function cookieValue(header: string | null, name: string): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const [key, ...rest] = part.split("=");
    if (key.trim() !== name) continue;
    try {
      return decodeURIComponent(rest.join("=").trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * The console's JSON API (9.2): the same code as the console, from its
 * cookie (the console's own pages) or from `Authorization: Bearer <code>`
 * (scripts). Reads the request itself, so route handlers and tests need no
 * request scope.
 */
export function requestAuthorized(request: Request): boolean {
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim();
  if (bearer !== undefined && tokenMatches(bearer)) return true;
  const cookie = cookieValue(request.headers.get("cookie"), TOKEN_COOKIE);
  return cookie !== undefined && tokenMatches(cookie);
}

export async function isAuthenticated(): Promise<boolean> {
  const value = (await cookies()).get(TOKEN_COOKIE)?.value;
  return value !== undefined && tokenMatches(value);
}
