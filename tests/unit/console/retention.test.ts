import { describe, expect, it } from "vitest";
import { retentionCutoffs } from "@/server/retention";

/* The cut-offs of `pnpm retention` (12.6, OP-18); the deletion itself is in the repository contract suite. */

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
