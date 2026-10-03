import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { attributionText, CC_BY_DEED, licenceOf, MIIS_TERMS } from "@/lib/attribution";
import { loadCatalogue } from "@/lib/catalogue";
import type { Innovation } from "@/lib/contracts";
import { toBoundaries, toHelplines, toIndicatorSet } from "@/lib/data/to-contracts";
import type { GminaBoundaries, HelplinesFile, IndicatorsFile } from "@/lib/data/types";
import { sourceBadge, sourceName } from "@/lib/labels";

/* The mappings of the gaps in docs/data-to-contracts.md: indicators, boundaries, helplines, attribution. */

const hasData = fs.existsSync(path.join(process.cwd(), "data", "built", "data-version.json"));

function indicatorsFile(overrides: Partial<IndicatorsFile> = {}): IndicatorsFile {
  return {
    source: { name: "GUS BDL", url: "https://bdl.stat.gov.pl/", licence: "CC BY 4.0", retrieved_at: "2026-10-03", unit_parent_id: "0", unit_level: 6 },
    note: "",
    indicators: [
      { key: "ageing", variable_id: 634989, name_pl: null, unit_pl: null, subject_id: null, year: 2024, years_used: [2024], gminas_with_value: 2, median: 17, min: 11, max: 26 },
      { key: "unemployment", variable_id: 79214, name_pl: null, unit_pl: null, subject_id: null, year: null, years_used: [], gminas_with_value: 0, median: null, min: null, max: null },
    ],
    need_by_target_group: { seniorzy: ["ageing"], default: ["ageing"] },
    gminas: {
      "1201011": { terc: "1201011", name: "Bochnia", kind: "gmina miejska", powiat: "bocheński", values: { ageing: { value: 22.1, year: 2024 } } },
      "1201022": {
        terc: "1201022",
        name: "Bochnia",
        kind: "gmina wiejska",
        powiat: "bocheński",
        values: {
          ageing: { value: 16.6, year: 2023, flag: "s", flag_pl: "Szacunki wstępne" },
          unemployment: { value: 0, year: 2024, flag: "x", flag_pl: "Brak informacji, konieczność zachowania tajemnicy statystycznej" },
        },
      },
      "1207132": { terc: "1207132", name: "Szczawa", kind: "gmina wiejska", powiat: "limanowski", values: {} },
    },
    missing: { "1207132": ["ageing", "unemployment"] },
    ...overrides,
  };
}

describe("indicators", () => {
  const set = toIndicatorSet(indicatorsFile());

  it("keeps a null median, min and max", () => {
    const unemployment = set.indicators.find((item) => item.key === "unemployment");
    expect(unemployment).toMatchObject({ year: null, median: null, min: null, max: null });
  });

  it("carries a flag with its text and drops a value BDL marks as no information", () => {
    expect(set.values["1201022"].ageing).toEqual({ value: 16.6, year: 2023, flag: "s", flagText: "Szacunki wstępne" });
    expect(set.values["1201022"].unemployment).toBeUndefined();
    expect(set.values["1201011"].ageing).toEqual({ value: 22.1, year: 2024, flag: null, flagText: null });
  });

  it("leaves Szczawa without values: brak danych", () => {
    expect(set.values["1207132"]).toEqual({});
  });

  it.skipIf(!hasData)("gives 182 of the 183 gminas three values in the real data (FR-7.2)", () => {
    const { indicators } = loadCatalogue({ source: "data" });
    const tercs = Object.keys(indicators.values);
    expect(tercs).toHaveLength(183);
    const full = tercs.filter((terc) => ["social-assistance", "ageing", "unemployment"].every((key) => key in indicators.values[terc]));
    expect(full).toHaveLength(182);
    expect(indicators.values["1207132"]).toEqual({});
  });
});

describe("boundaries", () => {
  it("keys every feature by terc, from JPT_KOD_JE", () => {
    const file: GminaBoundaries = {
      type: "FeatureCollection",
      source: "PRG",
      features: [
        {
          type: "Feature",
          properties: { JPT_KOD_JE: "1201011", JPT_NAZWA_: "Bochnia", kind: "gmina miejska", powiat: "bocheński" },
          geometry: { type: "Polygon", coordinates: [[[20.4, 49.9], [20.5, 49.9], [20.4, 50]]] },
        },
      ],
    };
    const mapped = toBoundaries(file);
    expect(mapped.features[0].properties).toEqual({ terc: "1201011", name: "Bochnia", powiat: "bocheński", kind: "gmina miejska" });
    expect(mapped.features[0].geometry).toBe(file.features[0].geometry);
  });

  it("gives the fixtures the same key", () => {
    const { boundaries, gminy } = loadCatalogue({ source: "mock" });
    const tercs = new Set(gminy.map((gmina) => gmina.terc));
    expect(boundaries.features.every((feature) => tercs.has(feature.properties.terc) && feature.properties.name)).toBe(true);
  });
});

describe("helplines", () => {
  const file: HelplinesFile = {
    version: "1",
    verified_on: "2026-10-03",
    note_pl: "",
    reviewer: null,
    helplines: [
      { id: "hl-116123", order: 2, group: "support", name_pl: "Kryzysowy Telefon Zaufania", number: "116 123", hours_pl: "całą dobę", who_for_pl: "Dla dorosłych.", free: true, url: "", source_url: "", verified_on: "" },
      { id: "hl-112", order: 1, group: "alarm", name_pl: "Numer alarmowy 112", number: "112", hours_pl: "całą dobę", who_for_pl: "Dla każdego.", free: true, url: "", source_url: "", verified_on: "" },
      { id: "hl-new", order: 3, group: "support", name_pl: "Nowa linia", number: "800 000 000", hours_pl: "w dni robocze", who_for_pl: "Dla wszystkich.", free: true, url: "", source_url: "", verified_on: "" },
    ],
  };
  const { alarm, support } = toHelplines(file);

  it("splits the groups of FR-12.5 in their order, with a tel: link and the hours", () => {
    expect(alarm.map((line) => line.id)).toEqual(["hl-112"]);
    expect(support.map((line) => line.id)).toEqual(["hl-116123", "hl-new"]);
    expect(support[0]).toMatchObject({ href: "tel:116123", hours: "całą dobę", forWhom: "self", short: "dla dorosłych w kryzysie emocjonalnym" });
  });

  it("shows an unknown line by its full name in both entry paths", () => {
    expect(support[1]).toMatchObject({ short: "Nowa linia", forWhom: "both" });
  });
});

describe("attribution (FR-1.8)", () => {
  const item: Innovation = {
    id: "inn-rops-senior-cuder",
    title: "Senior CUDER",
    organisation: null,
    website: null,
    source: "rops-biblioteka",
    sourceUrl: "https://rops.krakow.pl/",
    licence: "MIIS-agreement",
    retrievedAt: "2026-10-03",
    summary: "",
    problem: "",
    mechanism: "",
    requires: [],
    targetGroups: [],
    implementerTypes: [],
    costBand: null,
    timeToImplement: null,
    evidenceLevel: null,
    originPlace: null,
    incubator: { name: null, years: null, programme: null },
    materials: [],
  };

  it("names the MIIS licence by its terms, like every ROPS item", () => {
    expect(licenceOf(item)).toEqual({ label: "zasady wykorzystania innowacji MIIS", href: MIIS_TERMS });
  });

  it("links CC BY to its deed", () => {
    expect(licenceOf({ ...item, licence: "CC BY 4.0" })).toEqual({ label: "CC BY 4.0", href: CC_BY_DEED });
  });

  it("labels a partner record", () => {
    const partner = { ...item, source: "partner-rops" as const, sourceUrl: "" };
    expect(sourceBadge("partner-rops")).toBe("Partner ROPS");
    expect(attributionText(partner)).toContain(sourceName("partner-rops"));
  });
});
