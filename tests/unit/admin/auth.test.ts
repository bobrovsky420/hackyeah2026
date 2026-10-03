import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { adminCode, codeMatches, DEV_CODE, sessionMatches } = await import("@/server/admin/auth");
const { createHmac } = await import("node:crypto");

const session = (code: string) => createHmac("sha256", code).update("hubmi-rops-session-v1").digest("hex");

describe("the panel's door (module VI, FR-9.1)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("takes the code of ROPS_TOKEN, and the prototype's code only outside production", () => {
    vi.stubEnv("ROPS_TOKEN", " tajny-kod ");
    expect(adminCode()).toBe("tajny-kod");
    vi.stubEnv("ROPS_TOKEN", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(adminCode()).toBe(DEV_CODE);
    vi.stubEnv("NODE_ENV", "production");
    expect(adminCode()).toBeNull();
  });

  it("compares the typed code exactly, trimmed, and never opens a locked panel", () => {
    expect(codeMatches(" tajny-kod ", "tajny-kod")).toBe(true);
    expect(codeMatches("tajny-ko", "tajny-kod")).toBe(false);
    expect(codeMatches("TAJNY-KOD", "tajny-kod")).toBe(false);
    expect(codeMatches("", null)).toBe(false);
  });

  it("keeps a session only while the code stays the same, and never holds the code itself", () => {
    expect(sessionMatches(session("tajny-kod"), "tajny-kod")).toBe(true);
    expect(sessionMatches(session("tajny-kod"), "nowy-kod")).toBe(false);
    expect(sessionMatches("tajny-kod", "tajny-kod")).toBe(false);
    expect(sessionMatches(undefined, "tajny-kod")).toBe(false);
    expect(sessionMatches(session("tajny-kod"), null)).toBe(false);
  });
});
