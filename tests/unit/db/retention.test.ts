import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Repository, RetentionCounts } from "@/server/db/repository";
import { applyRetentionDefaults, retentionCutoffs } from "@/server/retention";

/* The cut-offs of the store's daily run (12.6); the deletion itself is in the repository contract suite. */

describe("retentionCutoffs", () => {
  it("keeps the routes until the routes' day, and then takes everything created before it", () => {
    expect(retentionCutoffs(new Date("2026-11-03T23:59:59.000Z")).routesBefore).toBeNull();
    expect(retentionCutoffs(new Date("2026-11-04T00:00:00.000Z")).routesBefore).toBe("2026-11-04T00:00:00.000Z");
    expect(retentionCutoffs(new Date("2027-01-10T08:00:00.000Z")).routesBefore).toBe("2026-11-04T00:00:00.000Z");
    expect(retentionCutoffs(new Date("2026-12-01T08:00:00.000Z"), { routesUntil: "2026-12-31" }).routesBefore).toBeNull();
  });

  it("takes contact requests after 90 days, readiness after its date, and the screening log as of now", () => {
    const now = new Date("2027-01-10T23:30:00.000Z");
    expect(retentionCutoffs(now)).toMatchObject({
      contactsBefore: "2026-10-12T23:30:00.000Z",
      // Midnight has passed in Kraków: the Polish day counts.
      readinessBefore: "2027-01-11",
      screeningAt: "2027-01-10T23:30:00.000Z",
    });
  });

  it("refuses a routes' day that is not a date", () => {
    expect(() => retentionCutoffs(new Date(), { routesUntil: "4.11.2026" })).toThrow(/YYYY-MM-DD/);
  });
});

describe("applyRetentionDefaults", () => {
  const now = new Date("2027-01-10T08:00:00.000Z");
  const counts: RetentionCounts = { routes: 0, feedback: 0, contacts: 2, readiness: 0, ideas: 0, screeningEntries: 0, screeningTexts: 0 };
  const applyRetention = vi.fn(async () => counts);
  const repo = { applyRetention } as unknown as Repository;
  let log: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = vi.spyOn(console, "log").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.RETENTION_ROUTES_UNTIL;
    vi.restoreAllMocks();
  });

  it("runs the defaults as of now, deleting, and says what went", async () => {
    expect(await applyRetentionDefaults(repo, now)).toEqual(counts);
    expect(applyRetention).toHaveBeenLastCalledWith(retentionCutoffs(now), { dryRun: false });
    expect(log).toHaveBeenCalledWith("[store] retention removed contacts 2");
    expect(error).not.toHaveBeenCalled();
  });

  it("takes the routes' day from RETENTION_ROUTES_UNTIL, and reports and ignores one that is not a date", async () => {
    process.env.RETENTION_ROUTES_UNTIL = "2027-12-31";
    await applyRetentionDefaults(repo, now);
    expect(applyRetention).toHaveBeenLastCalledWith(retentionCutoffs(now, { routesUntil: "2027-12-31" }), { dryRun: false });

    process.env.RETENTION_ROUTES_UNTIL = "31.12.2027";
    await applyRetentionDefaults(repo, now);
    expect(applyRetention).toHaveBeenLastCalledWith(retentionCutoffs(now), { dryRun: false });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("31.12.2027"));
  });
});
