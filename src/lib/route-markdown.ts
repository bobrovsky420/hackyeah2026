import { attributionText } from "@/lib/attribution";
import type { Route } from "@/lib/contracts";
import { t } from "@/lib/i18n";
import { applicantLabels, costLabel, fitLabel, quoteFieldLabel, roleLabel, timeLabel } from "@/lib/labels";
import { getInnovation, getPath } from "@/lib/catalogue";
import { placeText } from "@/lib/places";

/** The route as a Markdown file for "Pobierz jako plik tekstowy" (FR-4.7). */
export function routeToMarkdown(route: Route): string {
  const isRoute = route.mode === "route";
  const title = isRoute ? (route.need_summary_pl ?? t("s2.title.fallback")) : t(route.mode === "partial" ? "s3.title.partial" : "s3.title.none");
  const lines: string[] = [`# ${t("route.eyebrow")}: ${title ?? ""}`, ""];

  if (!isRoute && route.need_summary_pl) lines.push(`${t("route.need")} ${route.need_summary_pl}`, "");
  if (!isRoute && route.mode_reason_pl) lines.push(route.mode_reason_pl, "");
  lines.push(`${t("route.meta.place")} ${placeText(route.input.place_terc)}`);
  if (route.input.role) lines.push(`${t("route.meta.role")} ${roleLabel(route.input.role)}`);
  if (route.summary_pl) lines.push("", route.summary_pl);
  lines.push("", `_${route.label_pl}_`);

  if (route.solutions.length > 0) {
    lines.push("", `## ${t(isRoute ? "s2.block.solutions.title" : "s3.block.nearest.title")}`);
    for (const solution of route.solutions) {
      const item = getInnovation(solution.innovation_id);
      if (!item) continue;
      lines.push("", `### ${item.title}`, "");
      if (item.organisation) lines.push(item.organisation, "");
      lines.push(`${fitLabel(solution.fit_score)}, ${t("fit.score", { score: solution.fit_score })}`, "");
      for (const reason of solution.fit_reasons) {
        lines.push(`- ${reason.why_pl} „${reason.quote}”, ${t("quote.from", { field: quoteFieldLabel(reason.field) })}`);
      }
      for (const gap of solution.gaps_pl) lines.push(`- ${t("s3.card.missing")}: ${gap}`);
      if (isRoute) {
        const needs = solution.what_it_takes;
        lines.push("", `${t("facts.cost")}: ${costLabel(needs.cost_band)}. ${t("facts.time")}: ${timeLabel(needs.time_to_implement)}.`);
      }
      lines.push("", `${attributionText(item)}${item.sourceUrl ? ` ${item.sourceUrl}` : ""}`, "", `_${t("attribution.note")}_`);
    }
  }

  if (isRoute && route.knowledge.length > 0) {
    lines.push("", `## ${t("s2.block.knowledge.title")}`, "");
    for (const item of route.knowledge) lines.push(`- ${item.title}: ${item.url}`);
  }

  const { innovators, advisor } = route.people;
  lines.push("", `## ${t("s2.block.people.title")}`, "");
  for (const person of innovators) lines.push(`- ${person.organisation}`);
  lines.push(`- ${advisor.name ?? advisor.role}: ${advisor.email}, ${advisor.phone}`);

  lines.push("", `## ${t("s2.block.paths.title")}`);
  for (const { path_id, why_pl } of route.path.paths) {
    const path = getPath(path_id);
    if (!path) continue;
    lines.push("", `### ${path.name_pl}`, "", why_pl, "");
    lines.push(
      `- ${t("path.applicant")}: ${applicantLabels(path.applicant_types)}`,
      `- ${t("path.amount")}: ${path.amount_note_pl}`,
      `- ${t("path.deadline")}: ${path.timing.note_pl}`,
      `- ${t("path.sourceLink")}: ${path.source_url}`,
      "",
      `_${path.notes_pl}_`,
    );
  }

  lines.push("", `## ${t("s2.next.title")}`, "");
  route.next_steps.forEach((step, index) => lines.push(`${index + 1}. ${step.text_pl}`));
  if (route.unknowns_pl.length > 0) {
    lines.push("", `## ${t("s2.unknowns.title")}`, "");
    for (const item of route.unknowns_pl) lines.push(`- ${item}`);
  }
  lines.push("", "---", t("route.markdown.footer"), "");
  return lines.join("\n");
}
