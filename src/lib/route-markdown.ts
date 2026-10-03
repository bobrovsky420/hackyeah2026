import { t } from "@/lib/i18n";
import { costLabel, fitLabel, quoteFieldLabel, timeLabel } from "@/lib/labels";
import { getInnovation } from "@/lib/mock/data";
import type { MockRoute } from "@/lib/mock/types";

/** The route as a Markdown file for "Pobierz jako plik tekstowy" (FR-4.7). */
export function routeToMarkdown(route: MockRoute, placeText: string, roleText: string | null): string {
  const isRoute = route.mode === "route";
  const title = isRoute ? route.needSummary : t(route.mode === "partial" ? "s3.title.partial" : "s3.title.none");
  const lines: string[] = [`# ${t("route.eyebrow")}: ${title ?? ""}`, ""];

  if (!isRoute && route.needSummary) lines.push(`${t("route.need")} ${route.needSummary}`, "");
  if (route.modeReason) lines.push(route.modeReason, "");
  lines.push(`${t("route.meta.place")} ${placeText}`);
  if (roleText) lines.push(`${t("route.meta.role")} ${roleText}`);
  if (route.summary) lines.push("", route.summary);
  lines.push("", `_${t("route.generated.label")}_`);

  if (route.solutions.length > 0) {
    lines.push("", `## ${t(isRoute ? "s2.block.solutions.title" : "s3.block.nearest.title")}`);
    for (const solution of route.solutions) {
      const item = getInnovation(solution.innovationId);
      if (!item) continue;
      lines.push("", `### ${item.title}`, "");
      if (item.organisation) lines.push(item.organisation, "");
      lines.push(`${fitLabel(solution.fit)}, ${t("fit.score", { score: solution.fit })}`, "");
      for (const quote of solution.reasons) {
        lines.push(`- „${quote.text}”, ${t("quote.from", { field: quoteFieldLabel(quote.field) })}`);
      }
      for (const gap of solution.gaps) lines.push(`- ${t("s3.card.missing")}: ${gap}`);
      if (isRoute) {
        lines.push("", `${t("facts.cost")}: ${costLabel(item.costBand)}. ${t("facts.time")}: ${timeLabel(item.timeToImplement)}.`);
      }
      lines.push("", `${t("attribution.source")} ${item.sourceUrl}, ${t("attribution.licence", { licence: item.licence })}`);
    }
  }

  if (isRoute && route.knowledge.length > 0) {
    lines.push("", `## ${t("s2.block.knowledge.title")}`, "");
    for (const item of route.knowledge) lines.push(`- ${item.about}: ${item.title}, ${item.url}`);
  }

  lines.push("", `## ${t("s2.block.people.title")}`, "");
  for (const person of route.people) {
    const channels = person.channels.map((channel) => channel.value).join(", ");
    lines.push(`- ${person.name}, ${person.role}${channels ? `: ${channels}` : ""}`);
  }

  lines.push("", `## ${t("s2.block.paths.title")}`);
  for (const path of route.paths) {
    lines.push("", `### ${path.name}`, "");
    lines.push(`- ${t("path.applicant")} ${path.applicant}`, `- ${t("path.amount")} ${path.amount}`, `- ${t("path.deadline")} ${path.deadline}`);
    lines.push(`- ${t("path.source")} ${path.source.label}, ${path.source.url}`);
  }

  lines.push("", `## ${t("s2.next.title")}`, "");
  route.nextSteps.forEach((step, index) => lines.push(`${index + 1}. ${step.text}`));
  if (route.unknowns.length > 0) {
    lines.push("", `## ${t("s2.unknowns.title")}`, "");
    for (const item of route.unknowns) lines.push(`- ${item}`);
  }
  lines.push("", "---", t("route.markdown.footer"), "");
  return lines.join("\n");
}
