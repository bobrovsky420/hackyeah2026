import { t } from "@/lib/i18n";
import { requestAuthorized } from "@/server/console/auth";

/*
 * The frame of the console's two HTTP endpoints (9.2), the CSV export and
 * the statistics: the access code of the console (its cookie, or
 * `Authorization: Bearer`), JSON errors in Polish and `Cache-Control:
 * no-store` on every answer. Everything else the console does is a server
 * action of its pages (src/app/rops/actions.ts).
 */

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/** `{error, message}` with the Polish message; `extra` adds fields such as the one in error. */
export function apiError(status: number, error: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ error, message, ...extra }, status);
}

/** Runs the handler for a request with the console's code; 401 without it. */
export async function withConsole(request: Request, handler: () => Promise<Response>): Promise<Response> {
  if (!requestAuthorized(request)) return apiError(401, "unauthorized", t("api.rops.unauthorized"));
  return handler();
}
