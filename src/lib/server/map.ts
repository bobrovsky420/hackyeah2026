import "server-only";
import type { Gmina, Innovation } from "@/lib/contracts/catalogue";
import { getInnovation, gminy } from "@/lib/mock/data";
import { distanceKm, implementations, type LocatedImplementation } from "@/lib/mock/implementations";
import { indicatorValue, needGroup, needIndicators, toMedian, type IndicatorKey } from "@/lib/mock/indicators";
import boundaries from "@/lib/mock/map/boundaries.json";
import { store } from "./store";

/*
 * The data behind S4 (FR-7.1 to FR-7.6): rows for the table, the view
 * "Gdzie jest najbardziej potrzebna" and the gmina panel. Only sorting and
 * filtering of 183 rows per request (FR-7.6). The map shows need, never
 * blame (E7): values stand against the Małopolska median, not as places in
 * a league, and counts under five are suppressed.
 */

/** Five sequential blues, each at least 3:1 against the white map (12.2), one hue for colour-blind readers. */
export const MAP_COLORS = ["#5b8ed1", "#3c6fb6", "#2a5799", "#1c3f78", "#102a55"];

/** Fewer than five cases are not shown as a number (FR-7.4). */
export const SUPPRESS_BELOW = 5;

const RANKED = 10;
const PEERS = 5;

const inRegion = implementations.filter((item) => item.place_terc.startsWith("12"));

/** The box around Małopolska, [west, south, east, north]. */
export const malopolskaBounds: [number, number, number, number] = (() => {
  const box: [number, number, number, number] = [180, 90, -180, -90];
  const visit = (value: unknown): void => {
    if (Array.isArray(value) && typeof value[0] === "number") {
      const [lon, lat] = value as [number, number];
      box[0] = Math.min(box[0], lon);
      box[1] = Math.min(box[1], lat);
      box[2] = Math.max(box[2], lon);
      box[3] = Math.max(box[3], lat);
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    }
  };
  for (const feature of boundaries.features) visit(feature.geometry.coordinates);
  return box;
})();

export function needsIn(terc: string): number {
  return store.needs.filter((need) => need.place_terc === terc).length;
}

export interface GminaRow {
  gmina: Gmina;
  value: number | null;
  ratio: number | null;
  implementations: number;
  needs: number;
}

export function gminaRows(key: IndicatorKey, sort: "nazwa" | "wartosc"): GminaRow[] {
  const rows = gminy.map((gmina) => {
    const value = indicatorValue(gmina.terc, key);
    return {
      gmina,
      value,
      ratio: value === null ? null : toMedian(value, key),
      implementations: inRegion.filter((item) => item.place_terc === gmina.terc).length,
      needs: needsIn(gmina.terc),
    };
  });
  return sort === "wartosc"
    ? rows.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
    : rows.sort((a, b) => a.gmina.name.localeCompare(b.gmina.name, "pl"));
}

/** The implementation marks of FR-7.3: one per gmina, with the count. */
export function implementationMarks(innovationId?: string): { terc: string; lon: number; lat: number; count: number }[] {
  const counts = new Map<string, { item: LocatedImplementation; count: number }>();
  for (const item of inRegion) {
    if (innovationId && item.innovation_id !== innovationId) continue;
    const entry = counts.get(item.place_terc);
    counts.set(item.place_terc, { item, count: (entry?.count ?? 0) + 1 });
  }
  return [...counts.values()].map(({ item, count }) => ({
    terc: item.place_terc,
    lon: item.centroid[0],
    lat: item.centroid[1],
    count,
  }));
}

export interface RankedGmina {
  gmina: Gmina;
  values: { key: IndicatorKey; value: number; ratio: number }[];
  /** The mean of the values against their medians; 1 is the median of Małopolska. */
  score: number;
}

/**
 * "Gdzie jest najbardziej potrzebna" (J4, FR-7.4): the ten gminas where the
 * need indicators of the innovation's target group stand highest against
 * the median and where the innovation does not run yet.
 */
export function whereMostNeeded(innovation: Innovation): {
  indicators: IndicatorKey[];
  group: string | null;
  ranked: RankedGmina[];
  runningIn: Gmina[];
} {
  const indicators = needIndicators(innovation.targetGroups);
  const running = new Set(inRegion.filter((item) => item.innovation_id === innovation.id).map((item) => item.place_terc));
  const ranked = gminy
    .filter((gmina) => !running.has(gmina.terc))
    .flatMap((gmina) => {
      const values = indicators.flatMap((key) => {
        const value = indicatorValue(gmina.terc, key);
        return value === null ? [] : [{ key, value, ratio: toMedian(value, key) }];
      });
      if (values.length < indicators.length) return [];
      return [{ gmina, values, score: values.reduce((sum, item) => sum + item.ratio, 0) / values.length }];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, RANKED);
  return {
    indicators,
    group: needGroup(innovation.targetGroups),
    ranked,
    runningIn: gminy.filter((gmina) => running.has(gmina.terc)),
  };
}

export interface GminaPanel {
  gmina: Gmina;
  running: { implementation: LocatedImplementation; innovation: Innovation | undefined }[];
  needs: number;
  /** Nearby gminas running an innovation this gmina does not have (J5). */
  peers: { gmina: Gmina; km: number; innovation: Innovation }[];
}

export function gminaPanel(terc: string): GminaPanel | null {
  const gmina = gminy.find((item) => item.terc === terc);
  if (!gmina) return null;
  const here = inRegion.filter((item) => item.place_terc === terc);
  const present = new Set(here.map((item) => item.innovation_id));
  const seen = new Set<string>();
  const peers = inRegion
    .filter((item) => item.place_terc !== terc && !present.has(item.innovation_id))
    .map((item) => ({ item, km: distanceKm(gmina.centroid, item.centroid) }))
    .sort((a, b) => a.km - b.km)
    .flatMap(({ item, km }) => {
      const key = `${item.place_terc}-${item.innovation_id}`;
      const peer = gminy.find((entry) => entry.terc === item.place_terc);
      const innovation = getInnovation(item.innovation_id);
      if (seen.has(key) || !peer || !innovation) return [];
      seen.add(key);
      return [{ gmina: peer, km, innovation }];
    })
    .slice(0, PEERS);
  return {
    gmina,
    running: here.map((implementation) => ({ implementation, innovation: getInnovation(implementation.innovation_id) })),
    needs: needsIn(terc),
    peers,
  };
}
