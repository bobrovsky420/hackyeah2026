import type { CostBand, EvidenceLevel, RoleCode, SourceName, TimeToImplement } from "@/lib/contracts/catalogue";
import type { RouteSolution } from "@/lib/contracts/route";
import { t, type MessageKey } from "@/lib/i18n";

/* Codes of the contracts (data/taxonomies.json, schemas 8.4 and 8.7) mapped to interface strings. */

function listLabel(labels: string[]): string {
  const text = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} ${t("common.or")} ${labels.at(-1)}` : (labels[0] ?? "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const roleKeys = {
  "pracownik-instytucji": "roles.instytucja",
  "organizacja-spoleczna": "roles.organizacja",
  mieszkaniec: "roles.mieszkaniec",
  "urzad-gminy": "roles.gmina",
} as const satisfies Record<RoleCode, MessageKey>;

export const roleCodes = Object.keys(roleKeys) as RoleCode[];

export function isRoleCode(value: unknown): value is RoleCode {
  return typeof value === "string" && value in roleKeys;
}

export function roleLabel(code: RoleCode): string {
  return t(roleKeys[code]);
}

const roleNounKeys = {
  "pracownik-instytucji": "console.role.instytucja",
  "organizacja-spoleczna": "console.role.organizacja",
  mieszkaniec: "console.role.mieszkaniec",
  "urzad-gminy": "console.role.gmina",
} as const satisfies Record<RoleCode, MessageKey>;

/** The role as a noun for the console's tables; the form's labels speak in the first person. */
export function roleNoun(code: RoleCode): string {
  return t(roleNounKeys[code]);
}

const sourceKeys = {
  "baza-krajowa": "source.badge.national",
  "rops-biblioteka": "source.badge.rops",
} as const satisfies Record<SourceName, MessageKey>;

const sourceNameKeys = {
  "baza-krajowa": "source.name.national",
  "rops-biblioteka": "source.name.rops",
} as const satisfies Record<SourceName, MessageKey>;

export function sourceBadge(source: SourceName): string {
  return t(sourceKeys[source]);
}

export function sourceName(source: SourceName): string {
  return t(sourceNameKeys[source]);
}

const costKeys = {
  low: "cost.low",
  medium: "cost.medium",
  high: "cost.high",
  unknown: "cost.unknown",
} as const satisfies Record<CostBand, MessageKey>;

export function costLabel(code: CostBand | null): string {
  return t(costKeys[code ?? "unknown"]);
}

const timeKeys = {
  days: "time.days",
  weeks: "time.weeks",
  months: "time.months",
  "year-plus": "time.yearPlus",
  unknown: "time.unknown",
} as const satisfies Record<TimeToImplement, MessageKey>;

export function timeLabel(code: TimeToImplement | null): string {
  return t(timeKeys[code ?? "unknown"]);
}

const evidenceKeys = {
  described: "evidence.described",
  tested: "evidence.tested",
  "selected-for-dissemination": "evidence.selected",
  "implemented-elsewhere": "evidence.implementedElsewhere",
  "in-regional-model": "evidence.regionalModel",
} as const satisfies Record<EvidenceLevel, MessageKey>;

export function evidenceLabel(code: EvidenceLevel | null): string {
  return code ? t(evidenceKeys[code]) : t("evidence.unknown");
}

const implementerKeys: Record<string, MessageKey> = {
  jst: "implementer.jst",
  "ops-cus-pcpr": "implementer.opsCusPcpr",
  ngo: "implementer.ngo",
  placowka: "implementer.placowka",
  "firma-pes": "implementer.firmaPes",
  osoba: "implementer.osoba",
  "grupa-nieformalna": "implementer.grupa",
};

export function implementerLabels(codes: string[]): string {
  if (codes.length === 0) return t("implementer.unknown");
  return listLabel(codes.map((code) => (implementerKeys[code] ? t(implementerKeys[code]) : code)));
}

/** Who applies for a path (8.7 applicant_types). */
const applicantKeys: Record<string, MessageKey> = {
  jst: "applicant.jst",
  ngo: "applicant.ngo",
  mieszkancy: "applicant.mieszkancy",
  osoby: "applicant.osoby",
  firmy: "applicant.firmy",
};

export function applicantLabels(codes: string[]): string {
  return listLabel(codes.map((code) => (applicantKeys[code] ? t(applicantKeys[code]) : code)));
}

const targetGroupKeys: Record<string, MessageKey> = {
  seniorzy: "targetGroup.seniorzy",
  "dzieci-mlodziez-rodziny": "targetGroup.dzieci",
  "ograniczona-mobilnosc": "targetGroup.mobilnosc",
  "niepelnosprawnosc-sensoryczna": "targetGroup.sensoryczna",
  "niepelnosprawnosc-intelektualna": "targetGroup.intelektualna",
  "spektrum-autyzmu": "targetGroup.autyzm",
  zdrowie: "targetGroup.zdrowie",
  cudzoziemcy: "targetGroup.cudzoziemcy",
  bezdomnosc: "targetGroup.bezdomnosc",
  "rynek-pracy": "targetGroup.rynekPracy",
  inne: "targetGroup.inne",
};

export const targetGroupCodes = Object.keys(targetGroupKeys);

export function targetGroupLabel(code: string): string {
  return targetGroupKeys[code] ? t(targetGroupKeys[code]) : code;
}

/** The source fields a quote may come from (FR-3.4), as the catalogues name them. */
const quoteFieldKeys: Record<string, MessageKey> = {
  problem: "quote.field.problem",
  jak_dziala: "quote.field.jakDziala",
  na_czym_polega: "quote.field.naCzymPolega",
  jakich_problemow_dotyczy: "quote.field.jakichProblemow",
};

export function quoteFieldLabel(field: string): string {
  return quoteFieldKeys[field] ? t(quoteFieldKeys[field]) : field;
}

const knowledgeTypeKeys: Record<string, MessageKey> = {
  pdf: "knowledge.type.pdf",
  doc: "knowledge.type.doc",
  video: "knowledge.type.video",
  zip: "knowledge.type.zip",
  guide: "knowledge.type.guide",
};

export function knowledgeTypeLabel(type: string): string {
  return knowledgeTypeKeys[type] ? t(knowledgeTypeKeys[type]) : type;
}

/** "Gdzie działa" of FR-4.2: the count of known implementations and the nearest one. */
export function whereItRunsLabel(where: RouteSolution["where_it_runs"]): string {
  if (where.count === 0) return t("where.none");
  const nearest = where.nearest[0];
  if (nearest) return t("where.nearest", { count: where.count, name: nearest.name, km: nearest.distance_km });
  return t("where.far", { count: where.count });
}

/** Fit bands of FR-4.2: bardzo dobre 85-100, dobre 70-84, częściowe 45-69. */
export function fitLabel(score: number): string {
  if (score >= 85) return t("fit.veryGood");
  if (score >= 70) return t("fit.good");
  if (score >= 45) return t("fit.partial");
  return t("fit.low");
}

/** "+48 12 422 06 36 wew. 34" to "tel:+48124220636": the extension is said to the operator. */
export function telHref(phone: string): string {
  return `tel:${phone.split(/wew\.?/i)[0].replace(/[^\d+]/g, "")}`;
}
