import { t } from "@/lib/i18n";
import { REVIEWER_NAME, requestAuthorized } from "@/lib/server/auth";
import { nowIso } from "@/lib/server/store";
import { repository } from "@/server/db";
import type { ConsoleContext } from "./decisions";

/*
 * The frame of the console's JSON API (9.2): the access code of the
 * console (its cookie, or `Authorization: Bearer`), JSON with Polish error
 * messages, and `Cache-Control: no-store` on every answer.
 */

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/** `{error, message}` with the Polish message; `extra` adds fields such as the one in error. */
export function apiError(status: number, error: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ error, message, ...extra }, status);
}

export function invalidField(field: string): Response {
  return apiError(422, "invalid", t("api.rops.invalid", { field }), { field });
}

/** Runs the handler for a request with the console's code; 401 without it. */
export async function withConsole(request: Request, handler: () => Promise<Response>): Promise<Response> {
  if (!requestAuthorized(request)) return apiError(401, "unauthorized", t("api.rops.unauthorized"));
  return handler();
}

export function consoleContext(): ConsoleContext {
  return { repo: repository(), reviewer: REVIEWER_NAME, now: nowIso };
}

/** The JSON object of a PATCH body, or null for anything else. */
export async function readObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function invalidJson(): Response {
  return apiError(400, "invalid_json", t("api.rops.invalidJson"));
}

/** An optional note: a string up to 2 000 characters, empty meaning none; undefined when it is not one. */
export function noteOf(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > 2000) return undefined;
  return value.trim() || null;
}
