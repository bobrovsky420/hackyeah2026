import { describe, expect, it } from "vitest";
import type { Thread } from "@/lib/contracts";
import { hashKey, newKey, retentionFrom, roleFor, threadPath, waitsForRops } from "@/server/threads/access";

const thread = (over: Partial<Thread> = {}) =>
  ({ access_hash: hashKey("klucz-autora"), mentor: { id: "mt-1", name: "M", key_hash: hashKey("klucz-mentora") }, status: "nowa", messages: [], ...over }) as Thread;

describe("the private links of module V", () => {
  it("makes long random keys, and stores only their hashes", () => {
    const key = newKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(newKey()).not.toBe(key);
    expect(hashKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashKey(key)).not.toContain(key);
  });

  it("opens a conversation as its author or its mentor, and as nobody with any other key", () => {
    expect(roleFor(thread(), "klucz-autora")).toBe("uzytkownik");
    expect(roleFor(thread(), "klucz-mentora")).toBe("mentor");
    expect(roleFor(thread(), "klucz-autor")).toBeNull();
    expect(roleFor(thread(), "")).toBeNull();
    expect(roleFor(thread(), null)).toBeNull();
    expect(roleFor(thread(), "x".repeat(101))).toBeNull();
    expect(roleFor(thread({ mentor: null }), "klucz-mentora")).toBeNull();
  });

  it("builds the Polish URL with the key encoded", () => {
    expect(threadPath("rz-1", "a+b/c")).toBe("/rozmowa/rz-1?klucz=a%2Bb%2Fc");
  });

  it("waits for ROPS while the conversation is open and its last word is not ROPS's", () => {
    const at = "2026-10-03T10:00:00.000Z";
    const said = (author: "uzytkownik" | "rops" | "mentor") => ({ id: "wd", at, author, name: null, text: "x" });
    expect(waitsForRops(thread({ messages: [said("uzytkownik")] }))).toBe(true);
    expect(waitsForRops(thread({ messages: [said("uzytkownik"), said("rops")] }))).toBe(false);
    expect(waitsForRops(thread({ messages: [said("rops"), said("mentor")] }))).toBe(true);
    expect(waitsForRops(thread({ status: "zamknieta", messages: [said("uzytkownik")] }))).toBe(false);
  });

  it("keeps a conversation for 12 months after its last message", () => {
    expect(retentionFrom(new Date("2026-10-03T10:00:00.000Z"))).toBe("2027-10-03");
  });
});
