/*
 * Codes of the record contract (docs/innovation-record.md, data/taxonomies.json)
 * and the parts of the built records and the place register the screens use.
 */

export type SourceName = "baza-krajowa" | "rops-biblioteka";
export type CostBand = "low" | "medium" | "high" | "unknown";
export type TimeToImplement = "days" | "weeks" | "months" | "year-plus" | "unknown";
export type EvidenceLevel =
  | "described"
  | "tested"
  | "selected-for-dissemination"
  | "implemented-elsewhere"
  | "in-regional-model";

/** The role asked on S1 (FR-2.1), with the codes of the test problems. */
export type RoleCode = "pracownik-instytucji" | "organizacja-spoleczna" | "mieszkaniec" | "urzad-gminy";

export interface Material {
  type: string;
  title: string;
  url: string;
}

/** A built innovation record (8.1): the fields the screens show. */
export interface Innovation {
  id: string;
  title: string;
  organisation: string | null;
  website: string | null;
  source: SourceName;
  sourceUrl: string;
  licence: string;
  retrievedAt: string | null;
  summary: string;
  problem: string;
  mechanism: string;
  requires: string[];
  targetGroups: string[];
  implementerTypes: string[];
  costBand: CostBand | null;
  timeToImplement: TimeToImplement | null;
  evidenceLevel: EvidenceLevel | null;
  originPlace: string | null;
  incubator: { name: string | null; years: string | null; programme: string | null };
  materials: Material[];
}

/** A gmina of the place register (8.9). */
export interface Gmina {
  terc: string;
  name: string;
  powiat: string;
  kind: string;
}
