import { catalogue, distanceKm, getInnovation, type Catalogue, type LocatedImplementation } from "@/lib/catalogue";
import type { Gmina, Innovation } from "@/lib/contracts/catalogue";
import type { IndicatorFacts, IndicatorKey, IndicatorValue } from "@/lib/contracts/map";
import { repository } from "@/server/db";

/*
 * The data behind S4 (FR-7.1 to FR-7.6): rows for the table, the view
 * "Gdzie jest najbardziej potrzebna" and the gmina panel. Only sorting and
 * filtering of 183 rows per request (FR-7.6); what depends on the data
 * alone is computed once per catalogue. The map shows need, never blame
 * (E7): values stand against the Małopolska median, not as places in a
 * league, and counts under five are suppressed.
 */

/** Five sequential blues, each at least 3:1 against the white map (12.2), one hue for colour-blind readers. */
export const MAP_COLORS = ["#5b8ed1", "#3c6fb6", "#2a5799", "#1c3f78", "#102a55"];

/** Fewer than five cases are not shown as a number (FR-7.4). */
export const SUPPRESS_BELOW = 5;

const RANKED = 10;
const PEERS = 5;

/** A count of 1 to 4 is shown as "mniej niż 5"; zero stays a number (FR-7.4). */
export function isSuppressed(count: number): boolean {
  return count > 0 && count < SUPPRESS_BELOW;
}

const memo = new WeakMap<Catalogue, Map<string, unknown>>();

/** A value computed once per catalogue (FR-7.6). */
function once<T>(key: string, build: (data: Catalogue) => T): T {
  const data = catalogue();
  let entries = memo.get(data);
  if (!entries) memo.set(data, (entries = new Map()));
  if (!entries.has(key)) entries.set(key, build(data));
  return entries.get(key) as T;
}

// ------------------------------------------------------------- indicators

/** The three need indicators first; civic density is the optional fourth (OP-25). */
export const indicatorKeys: IndicatorKey[] = ["social-assistance", "ageing", "unemployment", "civic-density"];

/** Slugs for the address of S4 (?wskaznik=...). */
export const indicatorSlugs: Record<IndicatorKey, string> = {
  "social-assistance": "pomoc-spoleczna",
  ageing: "seniorzy",
  unemployment: "bezrobocie",
  "civic-density": "organizacje",
};

export function indicatorFromSlug(slug: unknown): IndicatorKey | null {
  const entry = Object.entries(indicatorSlugs).find(([, value]) => value === slug);
  return entry ? (entry[0] as IndicatorKey) : null;
}

export function indicatorFacts(key: IndicatorKey): IndicatorFacts {
  const item = catalogue().indicators.indicators.find((entry) => entry.key === key);
  if (!item) throw new Error(`Unknown indicator ${key}`);
  return item;
}

/** A gmina's value with its year and BDL flag; null for "brak danych" (Szczawa, 1207132). */
export function indicatorEntry(terc: string, key: IndicatorKey): IndicatorValue | null {
  return catalogue().indicators.values[terc]?.[key] ?? null;
}

export function indicatorValue(terc: string, key: IndicatorKey): number | null {
  return indicatorEntry(terc, key)?.value ?? null;
}

/** The value against the Małopolska median, as the ratio of FR-7.4 (1 is the median); null without a median. */
export function toMedian(value: number, key: IndicatorKey): number | null {
  const { median } = indicatorFacts(key);
  return median ? value / median : null;
}

/** The target group whose mapping chose the need indicators; null when the default applies. */
export function needGroup(targetGroups: string[]): string | null {
  const mapping = catalogue().indicators.needByTargetGroup;
  return Object.keys(mapping).find((key) => key !== "default" && targetGroups.includes(key)) ?? null;
}

/**
 * The indicators of "Gdzie jest najbardziej potrzebna" for an innovation's
 * target groups (8.8). With several groups, the first in the order of the
 * mapping table wins: seniorzy before dzieci-mlodziez-rodziny, and so on.
 */
export function needIndicators(targetGroups: string[]): IndicatorKey[] {
  const mapping = catalogue().indicators.needByTargetGroup;
  return mapping[needGroup(targetGroups) ?? "default"] ?? mapping.default;
}

/** Every gmina's value of one indicator, keyed by TERC; gminas without a value are absent. */
export function valuesOf(key: IndicatorKey): Record<string, number> {
  return once(`values:${key}`, (data) =>
    Object.fromEntries(
      Object.entries(data.indicators.values).flatMap(([terc, entry]) => (entry[key] ? [[terc, entry[key].value]] : [])),
    ),
  );
}

/** Quintile limits for the five classes of the choropleth (FR-7.3); empty when no gmina has a value. */
export function classBreaks(key: IndicatorKey): number[] {
  return once(`breaks:${key}`, () => {
    const sorted = Object.values(valuesOf(key)).sort((a, b) => a - b);
    return sorted.length === 0 ? [] : [0.2, 0.4, 0.6, 0.8].map((share) => sorted[Math.floor(share * sorted.length)]);
  });
}

export function classIndex(value: number, breaks: number[]): number {
  return breaks.filter((limit) => value >= limit).length;
}

// ------------------------------------------------------------ boundaries

/** The box around Małopolska, [west, south, east, north]. */
export function malopolskaBounds(): [number, number, number, number] {
  return once("bounds", (data) => {
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
    for (const feature of data.boundaries.features) visit(feature.geometry.coordinates);
    return box;
  });
}

// -------------------------------------------------------- implementations

/** The implementations in Małopolska, the ones the map shows. */
function inRegion(): LocatedImplementation[] {
  return once("inRegion", (data) => data.implementations.filter((item) => item.place_terc.startsWith("12")));
}

function implementationCounts(): Map<string, number> {
  return once("counts", () => {
    const counts = new Map<string, number>();
    for (const item of inRegion()) counts.set(item.place_terc, (counts.get(item.place_terc) ?? 0) + 1);
    return counts;
  });
}

/** Saved needs per gmina TERC (FR-7.2), read once per page from the repository. */
export function needCounts(): Promise<ReadonlyMap<string, number>> {
  return repository().needCountsByPlace();
}

export interface GminaRow {
  gmina: Gmina;
  value: number | null;
  ratio: number | null;
  implementations: number;
  needs: number;
}

export function gminaRows(key: IndicatorKey, sort: "nazwa" | "wartosc", needs: ReadonlyMap<string, number>): GminaRow[] {
  const counts = implementationCounts();
  const rows = catalogue().gminy.map((gmina) => {
    const value = indicatorValue(gmina.terc, key);
    return {
      gmina,
      value,
      ratio: value === null ? null : toMedian(value, key),
      implementations: counts.get(gmina.terc) ?? 0,
      needs: needs.get(gmina.terc) ?? 0,
    };
  });
  return sort === "wartosc"
    ? rows.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
    : rows.sort((a, b) => a.gmina.name.localeCompare(b.gmina.name, "pl"));
}

/** The implementation marks of FR-7.3: one per gmina, with the count. */
export function implementationMarks(innovationId?: string): { terc: string; lon: number; lat: number; count: number }[] {
  const counts = new Map<string, { item: LocatedImplementation; count: number }>();
  for (const item of inRegion()) {
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

// ------------------------------------------------------------- the views

export interface RankedGmina {
  gmina: Gmina;
  values: { key: IndicatorKey; value: number; ratio: number }[];
  /** The mean of the values against their medians; 1 is the median of Małopolska. */
  score: number;
}

/**
 * "Gdzie jest najbardziej potrzebna" (J4, FR-7.4): the ten gminas where the
 * need indicators of the innovation's target group stand highest against
 * the median and where the innovation does not run yet. A gmina without
 * every value (Szczawa) is left out, never ranked as zero.
 */
export function whereMostNeeded(innovation: Innovation): {
  indicators: IndicatorKey[];
  group: string | null;
  ranked: RankedGmina[];
  runningIn: Gmina[];
} {
  const indicators = needIndicators(innovation.targetGroups);
  const running = new Set(inRegion().filter((item) => item.innovation_id === innovation.id).map((item) => item.place_terc));
  const { gminy } = catalogue();
  const ranked = gminy
    .filter((gmina) => !running.has(gmina.terc))
    .flatMap((gmina) => {
      const values = indicators.flatMap((key) => {
        const value = indicatorValue(gmina.terc, key);
        const ratio = value === null ? null : toMedian(value, key);
        return value === null || ratio === null ? [] : [{ key, value, ratio }];
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

/** GET /api/innovations/{id}/places (9.2): the ranking above as rows; the value is that of the first need indicator. */
export function needPlaces(innovation: Innovation): { terc: string; name: string; indicator_value: number; rank: number }[] {
  return whereMostNeeded(innovation).ranked.map((row, index) => ({
    terc: row.gmina.terc,
    name: row.gmina.name,
    indicator_value: row.values[0].value,
    rank: index + 1,
  }));
}

export interface GminaPanel {
  gmina: Gmina;
  running: { implementation: LocatedImplementation; innovation: Innovation | undefined }[];
  needs: number;
  /** Nearby gminas running an innovation this gmina does not have (J5). */
  peers: { gmina: Gmina; km: number; innovation: Innovation }[];
}

export function gminaPanel(terc: string, needs: ReadonlyMap<string, number>): GminaPanel | null {
  const { gminaByTerc } = catalogue();
  const gmina = gminaByTerc.get(terc);
  if (!gmina) return null;
  const here = inRegion().filter((item) => item.place_terc === terc);
  const present = new Set(here.map((item) => item.innovation_id));
  const seen = new Set<string>();
  const peers = inRegion()
    .filter((item) => item.place_terc !== terc && !present.has(item.innovation_id))
    .map((item) => ({ item, km: distanceKm(gmina.centroid, item.centroid) }))
    .sort((a, b) => a.km - b.km)
    .flatMap(({ item, km }) => {
      const key = `${item.place_terc}-${item.innovation_id}`;
      const peer = gminaByTerc.get(item.place_terc);
      const innovation = getInnovation(item.innovation_id);
      if (seen.has(key) || !peer || !innovation) return [];
      seen.add(key);
      return [{ gmina: peer, km, innovation }];
    })
    .slice(0, PEERS);
  return {
    gmina,
    running: here.map((implementation) => ({ implementation, innovation: getInnovation(implementation.innovation_id) })),
    needs: needs.get(terc) ?? 0,
    peers,
  };
}
