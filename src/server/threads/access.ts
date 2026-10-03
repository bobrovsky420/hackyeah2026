import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { MessageAuthor, Thread } from "@/lib/contracts";

/*
 * The private links of module V: a conversation is opened by its id and a
 * key, 24 random bytes in base64url. The store keeps only the sha256 of
 * each key, the author's and the mentor's, so a copy of the store opens no
 * conversation. Whoever holds a link speaks in the conversation as its
 * author or as its mentor.
 */

export function newKey(): string {
  return randomBytes(24).toString("base64url");
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

/** Who a key opens the conversation as, or null. */
export function roleFor(thread: Pick<Thread, "access_hash" | "mentor">, key: string | null | undefined): Exclude<MessageAuthor, "rops"> | null {
  if (!key || key.length > 100) return null;
  const hash = hashKey(key);
  if (sameHash(hash, thread.access_hash)) return "uzytkownik";
  if (thread.mentor && sameHash(hash, thread.mentor.key_hash)) return "mentor";
  return null;
}

/** The Polish URL of a conversation for one key. */
export function threadPath(id: string, key: string): string {
  return `/rozmowa/${id}?klucz=${encodeURIComponent(key)}`;
}

/** A conversation waits for ROPS while it is open and its last word is not ROPS's. */
export function waitsForRops(thread: Pick<Thread, "status" | "messages">): boolean {
  return thread.status !== "zamknieta" && thread.messages.at(-1)?.author !== "rops";
}

/** A conversation is kept for 12 months after its last message. */
export function retentionFrom(at: Date): string {
  const until = new Date(at);
  until.setFullYear(until.getFullYear() + 1);
  return until.toISOString().slice(0, 10);
}
