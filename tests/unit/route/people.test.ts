import { describe, expect, test } from "vitest";
import type { Readiness } from "@/lib/contracts/records";
import { loadDataset } from "@/lib/data/load";
import { buildAdvisor, buildImplementersNearby, buildInnovators, buildReadiness } from "@/server/route/people";
import { NEARBY_KM, whereItRuns } from "@/server/route/solutions";

/* The people block (FR-4.4, FR-6.5): the readiness privacy rules, the implementers nearby, the advisor. */

const KRAKOW = "1261011";
const LASKOWA = "1207062";

function registration(id: string, over: Partial<Readiness> = {}): Readiness {
  return {
    id,
    created_at: "2026-09-29T10:00:00+02:00",
    display_name: `Osoba ${id}`,
    is_organisation: false,
    place_terc: KRAKOW,
    topics: ["rynek-pracy"],
    channel: { type: "email", value: `${id}@example.org` },
    consent_display_name: true,
    consent: { text_version: "zgoda-prototyp-v1", timestamp: "2026-09-29T10:00:00+02:00" },
    verification: { status: "zweryfikowane", reviewer: "rops", decided_at: "2026-09-29T11:00:00+02:00" },
    retention_until: "2027-09-29",
    note_pl: null,
    ...over,
  } as Readiness;
}

describe("readiness (FR-6.5)", () => {
  test("counted at once, named only when verified and consented", () => {
    const entries = [
      registration("a"),
      registration("b", { verification: { status: "niezweryfikowane", reviewer: null, decided_at: null } }),
      registration("c", { consent_display_name: false }),
      registration("d", { verification: { status: "odrzucone", reviewer: "rops", decided_at: null } }),
    ];
    expect(buildReadiness(entries, KRAKOW, ["rynek-pracy"])).toEqual({ count: 3, names_with_consent: ["Osoba a"] });
  });

  test("only the route's gmina and topics; without them every gmina and topic", () => {
    const entries = [registration("a"), registration("b", { place_terc: LASKOWA }), registration("c", { topics: ["bezdomnosc"] })];
    expect(buildReadiness(entries, KRAKOW, ["rynek-pracy"]).count).toBe(1);
    expect(buildReadiness(entries, null, ["rynek-pracy"]).count).toBe(2);
    expect(buildReadiness(entries, KRAKOW, []).count).toBe(2);
  });

  test("children or dependent adults: only organisations are named", () => {
    const entries = [
      registration("person", { topics: ["dzieci-mlodziez-rodziny"] }),
      registration("org", { topics: ["dzieci-mlodziez-rodziny"], is_organisation: true, display_name: "Stowarzyszenie X" }),
    ];
    expect(buildReadiness(entries, KRAKOW, ["dzieci-mlodziez-rodziny"])).toEqual({ count: 2, names_with_consent: ["Stowarzyszenie X"] });
    expect(buildReadiness(entries, KRAKOW, []).names_with_consent).toEqual(["Stowarzyszenie X"]);
    const senior = registration("senior", { topics: ["seniorzy"] });
    expect(buildReadiness([senior], KRAKOW, ["seniorzy"]).names_with_consent).toEqual([]);
  });

  test("a contact channel never leaves the store", () => {
    const result = JSON.stringify(buildReadiness([registration("a")], KRAKOW, ["rynek-pracy"]));
    expect(result).not.toContain("@example.org");
  });
});

describe("implementers, innovators, advisor (FR-4.4)", () => {
  const dataset = loadDataset({ today: "2026-09-29" });
  const bathrooms = "inn-rops-przenosne-modularne-lazienki";

  test("implementers within 50 km, nearest first", () => {
    const nearby = buildImplementersNearby(dataset, [bathrooms], KRAKOW);
    expect(nearby.length).toBeGreaterThan(0);
    const distances = nearby.map((item) => item.distance_km);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    expect(distances.every((km) => km <= NEARBY_KM)).toBe(true);
    expect(nearby.every((item) => item.innovation_id === bathrooms && item.organisation.length > 0)).toBe(true);
  });

  test("no place, no distance", () => {
    expect(buildImplementersNearby(dataset, [bathrooms], null)).toEqual([]);
    const where = whereItRuns(dataset, bathrooms, null);
    expect(where.count).toBeGreaterThanOrEqual(4);
    expect(where.nearest).toEqual([]);
  });

  test("where it runs counts every implementation and lists the nearest", () => {
    const where = whereItRuns(dataset, bathrooms, KRAKOW);
    expect(where.nearest.length).toBeGreaterThan(0);
    expect(where.nearest.length).toBeLessThanOrEqual(3);
  });

  test("one innovator per organisation, none for a natural person", () => {
    const natural = dataset.raw.organisations.natural_person_innovations[0]?.innovation_id;
    const innovators = buildInnovators(dataset, [bathrooms, ...(natural ? [natural] : [])]);
    expect(innovators.map((item) => item.innovation_id)).toEqual([bathrooms]);
  });

  test("the advisor of the route's group, else the row for other groups", () => {
    expect(buildAdvisor(dataset, ["seniorzy"]).category).toBe("seniorzy");
    expect(buildAdvisor(dataset, ["unknown-group", "bezdomnosc"]).category).toBe("bezdomnosc");
    expect(buildAdvisor(dataset, []).category).toBe("inne");
  });
});
