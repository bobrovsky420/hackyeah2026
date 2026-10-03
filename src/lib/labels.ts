import { t, type MessageKey } from "@/lib/i18n";
import type { CostBand, EvidenceLevel, Quote, RoleCode, SourceName, TimeToImplement } from "@/lib/mock/types";

/* Codes of the record contract (data/taxonomies.json) mapped to interface strings. */

const roleKeys = {
  instytucja: "roles.instytucja",
  organizacja: "roles.organizacja",
  mieszkaniec: "roles.mieszkaniec",
  gmina: "roles.gmina",
} as const satisfies Record<RoleCode, MessageKey>;

export const roleCodes = Object.keys(roleKeys) as RoleCode[];

export function isRoleCode(value: unknown): value is RoleCode {
  return typeof value === "string" && value in roleKeys;
}

export function roleLabel(code: RoleCode): string {
  return t(roleKeys[code]);
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
  const labels = codes.map((code) => (implementerKeys[code] ? t(implementerKeys[code]) : code));
  if (labels.length === 0) return t("implementer.unknown");
  const text = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} ${t("common.or")} ${labels.at(-1)}` : labels[0];
  return text.charAt(0).toUpperCase() + text.slice(1);
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

const quoteFieldKeys = {
  problem: "quote.field.problem",
  mechanism: "quote.field.mechanism",
  summary: "quote.field.summary",
} as const satisfies Record<Quote["field"], MessageKey>;

export function quoteFieldLabel(field: Quote["field"]): string {
  return t(quoteFieldKeys[field]);
}

/** Fit bands of FR-4.2: bardzo dobre 85-100, dobre 70-84, częściowe 45-69. */
export function fitLabel(score: number): string {
  if (score >= 85) return t("fit.veryGood");
  if (score >= 70) return t("fit.good");
  if (score >= 45) return t("fit.partial");
  return t("fit.low");
}
