export type SourceName = "baza-krajowa" | "rops-biblioteka";
export type CostBand = "low" | "medium" | "high" | "unknown";
export type TimeToImplement = "days" | "weeks" | "months" | "year-plus" | "unknown";
export type EvidenceLevel =
  | "described"
  | "tested"
  | "selected-for-dissemination"
  | "implemented-elsewhere"
  | "in-regional-model";

export interface Material {
  type: string;
  title: string;
  url: string;
}

/** The fields of a built innovation record (docs/innovation-record.md) the screens use. */
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

export interface Gmina {
  terc: string;
  name: string;
  powiat: string;
  kind: string;
}

export type RoleCode = "instytucja" | "organizacja" | "mieszkaniec" | "gmina";

/** Outcomes of the screening gate (7.12) and of matching (FR-3.3). */
export type RouteMode = "route" | "partial" | "none" | "redirected" | "declined" | "off_topic";

export interface Quote {
  text: string;
  field: "problem" | "mechanism" | "summary";
}

export interface Solution {
  innovationId: string;
  fit: number;
  /** "Dlaczego pasuje" on a route, "Co pasuje" on a partial match. */
  reasons: Quote[];
  /** "Czego brakuje", partial and none modes only. */
  gaps: string[];
  whereItWorks: string;
}

export interface KnowledgeItem {
  about: string;
  title: string;
  format: string;
  url: string;
}

export interface Person {
  name: string;
  role: string;
  channels: { kind: "email" | "phone" | "hours" | "website"; value: string; href?: string }[];
  contactInnovationId?: string;
}

export interface ImplementationPath {
  id: string;
  name: string;
  applicant: string;
  amount: string;
  deadline: string;
  why: string;
  steps: string[];
  source: { label: string; url: string };
}

export interface NextStep {
  text: string;
  href: string;
}

/** A canned result standing in for the route composer (FR-4.1). */
export interface MockRoute {
  id: string;
  mode: RouteMode;
  needSummary?: string;
  defaultPlaceTerc?: string;
  defaultRole?: RoleCode;
  modeReason?: string;
  summary?: string;
  solutions: Solution[];
  knowledge: KnowledgeItem[];
  people: Person[];
  paths: ImplementationPath[];
  nextSteps: NextStep[];
  unknowns: string[];
  readinessCount?: number;
  referenceCode?: string;
}
