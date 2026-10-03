import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { applicantLabels, implementerLabels, indicatorLabel, targetGroupLabel } from "@/lib/labels";
import { ropsDepartment } from "@/lib/mock/contacts";
import type { IndicatorKey } from "@/lib/mock/indicators";
import { placeText } from "@/lib/places";
import type { Brief } from "@/lib/server/brief";
import { formatNumber } from "@/lib/text";

/** "Osoby w wieku 65 lat i więcej: 22,1 % mieszkańców (2024; mediana Małopolski: 17,4)." */
export function briefIndicatorLine(item: { key: IndicatorKey; value: number; year: number; median: number }): string {
  const label = indicatorLabel(item.key);
  return t("brief.whom.indicator", {
    name: label.name,
    value: formatNumber(item.value),
    unit: label.unit,
    year: item.year,
    median: formatNumber(item.median),
  });
}

/** The brief as a Markdown file for "Pobierz jako plik tekstowy" (S6), in the order of FR-5.5. */
export function briefToMarkdown(brief: Brief): string {
  const lines: string[] = [`# ${t("brief.eyebrow")}`, "", `## ${t("brief.titleLabel")}`, "", brief.title];

  lines.push("", `## ${t("brief.problem.title")}`, "", brief.problem);

  lines.push("", `## ${t("brief.whom.title")}`, "");
  lines.push(`- ${t("brief.whom.groups")} ${brief.groups.length > 0 ? brief.groups.map(targetGroupLabel).join(", ") : t("brief.whom.noGroups")}`);
  lines.push(`- ${t("route.meta.place")} ${placeText(brief.placeTerc)}`);
  if (brief.indicators.length > 0) {
    for (const item of brief.indicators) lines.push(`- ${briefIndicatorLine(item)}`);
    lines.push("", t("brief.whom.source"));
  } else {
    lines.push("", t("brief.whom.noPlace"));
  }

  lines.push("", `## ${t("brief.existing.title")}`, "", `_${t("brief.existing.question")}_`, "");
  if (brief.matches.length === 0) lines.push(t("brief.existing.none"));
  for (const match of brief.matches) {
    lines.push(`### ${match.title}`, "", match.sourceUrl, "");
    for (const fit of match.fits) lines.push(`- ${t("brief.existing.fits")} ${fit}`);
    for (const lack of match.lacks) lines.push(`- ${t("brief.existing.lacks")} ${lack}`);
    lines.push("");
  }
  lines.push(
    brief.similarNeeds.length > 0
      ? t("brief.existing.similar", { count: brief.similarNeeds.length })
      : t("brief.existing.similarNone"),
  );

  lines.push("", `## ${t("brief.gap.title")}`, "");
  if (brief.gaps.length === 0) lines.push(t("brief.gap.none"));
  for (const gap of brief.gaps) lines.push(`- ${gap}`);

  lines.push("", `## ${t("brief.direction.title")}`, "", t("brief.direction.text"));

  lines.push("", `## ${t("brief.partners.title")}`, "");
  if (brief.implementerTypes.length > 0) lines.push(`- ${t("brief.partners.types")} ${implementerLabels(brief.implementerTypes)}`);
  for (const partner of brief.partnersNearby) {
    lines.push(`- ${t("brief.partners.nearby", { organisation: partner.organisation, place: partner.place_name, km: partner.distance_km })}`);
  }
  lines.push(`- ${t("brief.partners.readiness", { count: brief.readinessCount })}`);
  lines.push(`- ${t("brief.partners.advisor")} ${ropsDepartment.email}, ${ropsDepartment.phone}`);

  lines.push("", `## ${t("brief.paths.title")}`);
  for (const path of brief.paths) {
    lines.push("", `### ${path.name_pl}`, "");
    lines.push(
      `- ${t("path.applicant")}: ${applicantLabels(path.applicant_types)}`,
      `- ${t("path.amount")}: ${path.amount_note_pl}`,
      `- ${t("path.deadline")}: ${path.timing.note_pl}`,
      `- ${t("path.sourceLink")}: ${path.source_url}`,
    );
  }
  lines.push("", `### ${t("brief.paths.advice")}`, "", `${ropsDepartment.name}: ${ropsDepartment.email}, ${ropsDepartment.phone}`);

  lines.push("", `## ${t("brief.sources.title")}`, "");
  for (const source of brief.sources) lines.push(`- ${source.title}: ${source.url}`);

  lines.push("", "---", t("brief.label", { date: formatDate(brief.generatedAt) }), "", `_${t("attribution.note")}_`, "");
  return lines.join("\n");
}
