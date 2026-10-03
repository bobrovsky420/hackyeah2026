import "server-only";

/* Small checks for the JSON bodies of the prototype's API routes. */

export type Body = Record<string, unknown>;

export async function readJson(request: Request): Promise<Body | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Body) : null;
  } catch {
    return null;
  }
}

/** A required string, trimmed, between min and max characters; otherwise null. */
export function requiredText(value: unknown, max: number, min = 1): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length >= min && text.length <= max ? text : null;
}

/** An optional string: null when empty or missing, undefined when too long. */
export function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text.length === 0) return null;
  return text.length <= max ? text : undefined;
}

export function stringList(value: unknown, allowed: readonly string[]): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && allowed.includes(item)) : [];
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function invalid(field: string): Response {
  return Response.json({ error: "invalid", field }, { status: 422 });
}
