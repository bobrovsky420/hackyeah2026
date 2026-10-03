/*
 * The map data of S4 (8.8, FR-7.1 to FR-7.4): the GUS indicators per gmina
 * and the gmina boundaries as the app serves them. src/lib/data/to-contracts.ts
 * maps data/indicators.json and data/map/malopolska-gminy.geojson onto these.
 */

export type IndicatorKey = "social-assistance" | "ageing" | "unemployment" | "civic-density";

/** One gmina's value of one indicator, with the year it comes from. */
export interface IndicatorValue {
  value: number;
  year: number;
  /** The BDL attribute symbol and its Polish text when the value is not plain; null otherwise. */
  flag: string | null;
  flagText: string | null;
}

/** An indicator over Małopolska; year, median, min and max are null when no gmina has a value. */
export interface IndicatorFacts {
  key: IndicatorKey;
  variable_id: number;
  year: number | null;
  gminas_with_value: number;
  median: number | null;
  min: number | null;
  max: number | null;
}

export interface IndicatorSet {
  source: { name: string; url: string; licence: string; retrieved_at: string };
  indicators: IndicatorFacts[];
  /** The need indicators per target group, "default" for every other group (8.8). */
  needByTargetGroup: Record<string, IndicatorKey[]> & { default: IndicatorKey[] };
  /** Keyed by the seven-digit TERC; a gmina without data (Szczawa, 1207132) has no entry or an empty one. */
  values: Record<string, Partial<Record<IndicatorKey, IndicatorValue>>>;
}

/** The properties of a boundary feature; the map reads `terc` (FR-7.1). */
export interface GminaBoundaryProperties {
  terc: string;
  name: string;
  powiat: string;
  kind: string;
}

export type BoundaryGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

/** The gminas of Małopolska as GeoJSON, keyed by the seven-digit TERC. */
export interface GminaBoundaries {
  type: "FeatureCollection";
  features: { type: "Feature"; properties: GminaBoundaryProperties; geometry: BoundaryGeometry }[];
}
