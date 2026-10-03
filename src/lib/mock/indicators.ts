import indicatorsData from "./map/indicators.json";

/*
 * The gmina indicators of 8.8 (GUS Bank Danych Lokalnych, CC BY 4.0),
 * extracted on 29 September 2026 from data/indicators.json. Values are
 * compared with the Małopolska median, never ranked as a league (FR-7.4).
 */

export type IndicatorKey = "social-assistance" | "ageing" | "unemployment" | "civic-density";

export interface IndicatorFacts {
  key: IndicatorKey;
  variable_id: number;
  year: number;
  gminas_with_value: number;
  median: number;
  min: number;
  max: number;
}

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

const facts = new Map((indicatorsData.indicators as IndicatorFacts[]).map((item) => [item.key, item]));
const values = indicatorsData.values as Record<string, Partial<Record<IndicatorKey, number>>>;
const needMapping = indicatorsData.need_by_target_group as Record<string, IndicatorKey[]>;

export function indicatorFacts(key: IndicatorKey): IndicatorFacts {
  const item = facts.get(key);
  if (!item) throw new Error(`Unknown indicator ${key}`);
  return item;
}

export function indicatorValue(terc: string, key: IndicatorKey): number | null {
  return values[terc]?.[key] ?? null;
}

/**
 * The indicators of "Gdzie jest najbardziej potrzebna" for an innovation's
 * target groups (8.8). With several groups, the first in the order of the
 * mapping table wins: seniorzy before dzieci-mlodziez-rodziny, and so on.
 */
export function needIndicators(targetGroups: string[]): IndicatorKey[] {
  return needMapping[needGroup(targetGroups) ?? "default"];
}

/** The target group whose mapping chose the indicators; null when the default applies. */
export function needGroup(targetGroups: string[]): string | null {
  return Object.keys(needMapping).find((key) => key !== "default" && targetGroups.includes(key)) ?? null;
}

/** The value against the Małopolska median, as the ratio of FR-7.4 (1 is the median). */
export function toMedian(value: number, key: IndicatorKey): number {
  return value / indicatorFacts(key).median;
}

/** Quintile limits for the five classes of the choropleth (FR-7.3). */
export function classBreaks(key: IndicatorKey): number[] {
  const sorted = Object.values(values)
    .map((entry) => entry[key])
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b);
  return [0.2, 0.4, 0.6, 0.8].map((share) => sorted[Math.floor(share * sorted.length)]);
}

export function classIndex(value: number, breaks: number[]): number {
  return breaks.filter((limit) => value >= limit).length;
}

/** Every gmina's value of one indicator, keyed by TERC. */
export function valuesOf(key: IndicatorKey): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values)
      .map(([terc, entry]) => [terc, entry[key]] as const)
      .filter((pair): pair is readonly [string, number] => pair[1] !== undefined),
  );
}
