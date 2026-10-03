import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/* The places ranking of FR-7.4 and the suppression of small counts, on the fixtures and on data/. */

const hasData = fs.existsSync(path.join(process.cwd(), "data", "data-version.json"));

/** The map module over a fresh catalogue of the given source. */
async function mapOn(source: "data" | "mock") {
  vi.resetModules();
  vi.stubEnv("DATA_SOURCE", source);
  const map = await import("@/lib/server/map");
  const catalogue = await import("@/lib/catalogue");
  return { ...map, ...catalogue };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("suppression (FR-7.4)", () => {
  it("hides counts of one to four, never zero or five", async () => {
    const { isSuppressed } = await mapOn("mock");
    expect([0, 1, 4, 5, 12].map(isSuppressed)).toEqual([false, true, true, false, false]);
  });
});

describe.each(["mock", ...(hasData ? ["data"] : [])] as ("data" | "mock")[])("places ranking on %s", (source) => {
  it("lists ten gminas by need, where the innovation does not run", async () => {
    const { getInnovation, implementationsOf, indicatorValue, needPlaces, whereMostNeeded } = await mapOn(source);
    const item = getInnovation("inn-nat-649");
    expect(item).toBeDefined();
    const ranking = whereMostNeeded(item!);
    expect(ranking.indicators).toEqual(["ageing"]);

    const places = needPlaces(item!);
    expect(places).toHaveLength(10);
    expect(places.map((place) => place.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const values = places.map((place) => place.indicator_value);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    for (const place of places) expect(indicatorValue(place.terc, "ageing")).toBe(place.indicator_value);

    const running = new Set(implementationsOf(item!.id).map((row) => row.place_terc));
    expect(places.some((place) => running.has(place.terc))).toBe(false);
    expect(places.some((place) => place.terc === "1207132")).toBe(false);
  });

  it("serves the table and the panel of Proszowice (J5)", async () => {
    const { gminaPanel, gminaRows } = await mapOn(source);
    const rows = gminaRows("social-assistance", "wartosc", new Map([["1214053", 2]]));
    expect(rows).toHaveLength(183);
    expect(rows[0].value).toBe(1074);
    expect(rows.find((row) => row.gmina.terc === "1207132")?.value).toBeNull();
    const panel = gminaPanel("1214053", new Map([["1214053", 2]]));
    expect(panel?.needs).toBe(2);
    expect(rows.find((row) => row.gmina.terc === "1214053")?.needs).toBe(2);
    expect(panel?.running.map((entry) => entry.innovation?.title)).toContain("Mobilna pomoc terapeutyczna");
    expect(panel?.peers.length).toBeGreaterThan(0);
  });
});
