import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memory } from "@/server/ephemeral";
import {
  allowSubmission,
  HONEYPOT_FIELD,
  honeypotFilled,
  limitKeys,
  limitReached,
  publicWritesClosed,
  screenedResponse,
} from "@/server/gate";

beforeEach(() => memory.abuseHits.clear());
afterEach(() => {
  delete process.env.PUBLIC_WRITES;
  delete process.env.ABUSE_LIMIT_CONTACTS_PER_DAY;
});

describe("the kill switch PUBLIC_WRITES", () => {
  it("answers 503 with a Polish message only when set to false", async () => {
    expect(publicWritesClosed()).toBeNull();
    process.env.PUBLIC_WRITES = "true";
    expect(publicWritesClosed()).toBeNull();
    process.env.PUBLIC_WRITES = "false";
    const response = publicWritesClosed()!;
    expect(response.status).toBe(503);
    expect((await response.json()).message).toMatch(/wyłączone/);
  });
});

describe("the honeypot", () => {
  it("is filled only by a non-empty value", () => {
    expect(honeypotFilled({})).toBe(false);
    expect(honeypotFilled({ [HONEYPOT_FIELD]: "" })).toBe(false);
    expect(honeypotFilled({ [HONEYPOT_FIELD]: "  " })).toBe(false);
    expect(honeypotFilled({ [HONEYPOT_FIELD]: "https://spam.example" })).toBe(true);
  });
});

describe("the abuse limits (FR-6.4, FR-12.14)", () => {
  it("five contact requests per e-mail address a day, whatever the case of the address", () => {
    const results = [];
    for (let i = 0; i < 6; i += 1) {
      results.push(allowSubmission("contact", limitKeys("contact", { email: i % 2 ? "Ala@Example.pl" : "ala@example.pl ", client: `10.0.0.${i}` })));
    }
    expect(results).toEqual([true, true, true, true, true, false]);
  });

  it("five contact requests per client address a day, and a refused one is not counted", () => {
    const results = [];
    for (let i = 0; i < 7; i += 1) results.push(allowSubmission("contact", limitKeys("contact", { email: `a${i}@x.pl`, client: "10.0.0.9" })));
    expect(results).toEqual([true, true, true, true, true, false, false]);
    expect(memory.abuseHits.get("contact:client:10.0.0.9")).toHaveLength(5);
  });

  it("two readiness registrations per phone a day, in any notation", () => {
    const phones = ["600 100 200", "+48 600-100-200", "0048600100200"];
    expect(phones.map((phone) => allowSubmission("readiness", limitKeys("readiness", { phone })))).toEqual([true, true, false]);
  });

  it("forgets after a day", () => {
    const keys = limitKeys("readiness", { email: "b@x.pl" });
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000 - 1;
    expect(allowSubmission("readiness", keys, dayAgo)).toBe(true);
    expect(allowSubmission("readiness", keys, dayAgo)).toBe(true);
    expect(allowSubmission("readiness", keys)).toBe(true);
  });

  it("the limit can be raised for the test runs", () => {
    process.env.ABUSE_LIMIT_CONTACTS_PER_DAY = "100";
    for (let i = 0; i < 50; i += 1) expect(allowSubmission("contact", limitKeys("contact", { client: "local" }))).toBe(true);
  });

  it("answers a polite 429 with a Polish message", async () => {
    const response = limitReached();
    expect(response.status).toBe(429);
    expect((await response.json()).message).toMatch(/Spróbuj ponownie jutro/);
  });
});

describe("answers for screened texts", () => {
  it("redirected is a 200 with the outcome; declined and off_topic are a 422", async () => {
    const redirected = screenedResponse("redirected");
    expect(redirected.status).toBe(200);
    expect(await redirected.json()).toEqual({ outcome: "redirected" });
    for (const outcome of ["declined", "off_topic"] as const) {
      const response = screenedResponse(outcome);
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "screened", outcome });
    }
  });
});
