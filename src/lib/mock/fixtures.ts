import type { Catalogue } from "@/lib/catalogue";
import type { GminaBoundaries, IndicatorKey, IndicatorSet } from "@/lib/contracts";
import type { LocatedImplementation } from "@/lib/data/to-contracts";
import { helplines, ropsDepartment } from "./contacts";
import { gminy, innovations, localities } from "./data";
import boundariesData from "./map/boundaries.json";
import implementationsData from "./map/implementations.json";
import indicatorsData from "./map/indicators.json";
import { allPaths } from "./paths";

/*
 * The catalogue from the committed fixtures, for a clone without data/ or
 * with DATA_SOURCE=mock (decided 29 September 2026). The fixtures were
 * extracted from the data build of that day in their own shapes; this
 * module turns them into the contracts the facade (src/lib/catalogue.ts)
 * serves. No knowledge links and no named advisors: the facade falls back
 * to the ROPS department.
 */

export const FIXTURES_VERSION = "fixtures-2026-09-29";

function indicatorSet(): IndicatorSet {
  const facts = indicatorsData.indicators.map((item) => ({ ...item, key: item.key as IndicatorKey }));
  const yearOf = new Map(facts.map((item) => [item.key, item.year]));
  const raw = indicatorsData.values as Record<string, Partial<Record<IndicatorKey, number>>>;
  const values: IndicatorSet["values"] = {};
  for (const [terc, entry] of Object.entries(raw)) {
    values[terc] = Object.fromEntries(
      (Object.entries(entry) as [IndicatorKey, number][]).map(([key, value]) => [
        key,
        { value, year: yearOf.get(key) ?? 0, flag: null, flagText: null },
      ]),
    );
  }
  const { name, url, licence, retrieved_at } = indicatorsData.source;
  return {
    source: { name, url, licence, retrieved_at },
    indicators: facts,
    needByTargetGroup: indicatorsData.need_by_target_group as IndicatorSet["needByTargetGroup"],
    values,
  };
}

function boundaries(): GminaBoundaries {
  const byTerc = new Map(gminy.map((gmina) => [gmina.terc, gmina]));
  return {
    type: "FeatureCollection",
    features: boundariesData.features.map((feature) => {
      const gmina = byTerc.get(feature.properties.terc);
      return {
        type: "Feature",
        properties: { terc: feature.properties.terc, name: gmina?.name ?? "", powiat: gmina?.powiat ?? "", kind: gmina?.kind ?? "" },
        geometry: feature.geometry as GminaBoundaries["features"][number]["geometry"],
      };
    }),
  };
}

export function fixtureCatalogue(): Catalogue {
  const paths = allPaths();
  return {
    source: "mock",
    version: FIXTURES_VERSION,
    innovations,
    innovationById: new Map(innovations.map((item) => [item.id, item])),
    gminy,
    gminaByTerc: new Map(gminy.map((gmina) => [gmina.terc, gmina])),
    localities,
    implementations: implementationsData as LocatedImplementation[],
    paths,
    pathById: new Map(paths.map((path) => [path.id, path])),
    knowledge: { always: [], byId: new Map(), byTargetGroup: new Map() },
    advisorByCategory: new Map(),
    innovatorByInnovation: new Map(
      innovations.flatMap((item) =>
        item.organisation
          ? [
              [
                item.id,
                {
                  organisation: item.organisation,
                  channels: item.website ? [{ type: "www" as const, value: item.website }] : [],
                  persons_public: [],
                  innovation_id: item.id,
                },
              ] as const,
            ]
          : [],
      ),
    ),
    department: ropsDepartment,
    helplines,
    indicators: indicatorSet(),
    boundaries: boundaries(),
    dataset: null,
  };
}
