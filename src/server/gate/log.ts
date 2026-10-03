import "server-only";
import { createHash } from "node:crypto";
import { memory } from "@/lib/server/store";
import type { GateTextKind } from "@/server/contracts";
import { repository, type ScreeningLogEntry } from "@/server/db";
import { LOG_TEXT_RETENTION_MS, REPEAT_WINDOW_MS, repeatLimit } from "./thresholds";

export type { ScreeningLogEntry } from "@/server/db";

/*
 * The screening log of FR-12.7, kept by the store (src/server/db/), and
 * the memory of repeated texts (FR-12.1, FR-12.14), which stays in the
 * server's memory. A log entry never holds the requester's
 * identity; it holds the text only for `declined` and for spam, with
 * personal data already removed, for seven days of review, and never the
 * text of a `redirected` case. Logs themselves go after 14 days (12.6).
 * The repeat memory keeps hashes only, for one hour.
 */

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Writes one entry; the repository drops old entries and texts past their seven days on the way. */
export async function writeScreeningLog(
  entry: Omit<ScreeningLogEntry, "at" | "text" | "text_until" | "text_sha256">,
  submittedText: string,
  redactedText: string,
  now = Date.now(),
): Promise<ScreeningLogEntry> {
  const keep = entry.outcome === "declined" || entry.category === "spam";
  const logged: ScreeningLogEntry = {
    ...entry,
    at: new Date(now).toISOString(),
    text_sha256: sha256(submittedText),
    text: keep && entry.outcome !== "redirected" ? redactedText : null,
    text_until: keep && entry.outcome !== "redirected" ? new Date(now + LOG_TEXT_RETENTION_MS).toISOString() : null,
  };
  await repository().writeScreeningLog(logged, now);
  return logged;
}

/** The key of the repeat memory: kind, client and the text with case and spacing evened out. */
export function repeatKey(kind: GateTextKind, client: string | null | undefined, text: string): string {
  return sha256(`${kind}\n${client ?? ""}\n${text.toLocaleLowerCase("pl-PL").replace(/\s+/g, " ").trim()}`);
}

/** How often the same text came within the hour before this one, and whether one of them was redirected. */
export function seenBefore(key: string, now = Date.now()): { count: number; redirected: boolean } {
  const seen = memory.gateRepeats.get(key);
  if (!seen) return { count: 0, redirected: false };
  const times = seen.times.filter((time) => now - time < REPEAT_WINDOW_MS);
  return { count: times.length, redirected: times.length > 0 && seen.redirected };
}

/** Remembers one submission; old hashes go on the way. */
export function rememberText(key: string, redirected: boolean, now = Date.now()) {
  for (const [other, seen] of memory.gateRepeats) {
    if (seen.times.every((time) => now - time >= REPEAT_WINDOW_MS)) memory.gateRepeats.delete(other);
  }
  const seen = memory.gateRepeats.get(key) ?? { times: [], redirected: false };
  seen.times = [...seen.times.filter((time) => now - time < REPEAT_WINDOW_MS), now];
  seen.redirected ||= redirected;
  memory.gateRepeats.set(key, seen);
}

/** True when the text was already sent as often as the repeat limit allows. */
export function isRepeat(count: number): boolean {
  return count >= repeatLimit();
}
