/*
 * Codes of the record contract (docs/innovation-record.md, data/taxonomies.json)
 * and the parts of the built records and the place register the screens use.
 */

/** The two public catalogues and a partner hand-over from ROPS (FR-1.6). */
export type SourceName = "baza-krajowa" | "rops-biblioteka" | "partner-rops";
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
  /** Empty when the record has no web page (a partner spreadsheet row): then no source link. */
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

/** A town or village of Małopolska (GUS SIMC) that the place picker resolves to its gmina (FR-2.2). */
export interface Locality {
  simc: string;
  name: string;
  /** The TERC of its gmina: the only place passed on. */
  terc: string;
}

/** A gmina of the place register (8.9), with its area-weighted centroid as [lon, lat]. */
export interface Gmina {
  terc: string;
  name: string;
  powiat: string;
  kind: string;
  centroid: [number, number];
}

/** An implementation of an innovation in a gmina (8.6). */
export interface Implementation {
  id: string;
  innovation_id: string;
  place_terc: string;
  place_name: string | null;
  organisation: string | null;
  year: number | null;
  status: "running" | "completed" | "planned";
  source: string;
  source_url: string | null;
  note_pl: string | null;
}
