import { briefIndicatorLine } from "@/lib/brief-markdown";
import { BRIEF_SECTION_KEYS, type Brief, type BriefSection, type BriefSectionKey } from "@/lib/contracts/brief";
import type { Department } from "@/lib/contracts/contacts";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { applicantLabels, implementerLabels, targetGroupLabel } from "@/lib/labels";
import { placeText } from "@/lib/places";

/*
 * The one renderer of the brief (8.5): `sections`, keyed in the order of
 * FR-5.5, each a Polish string in a small Markdown subset, from which both
 * the page (src/components/brief/section-text.tsx) and the downloaded file
 * are made. The order follows the application form of Inkubator Włączenia
 * Społecznego 2.0, so the brief can be pasted into it section by section.
 * The model's prose and the templated facts meet here; a null prose part
 * falls back to its template.
 */

export { BRIEF_SECTION_KEYS, type BriefSection, type BriefSectionKey } from "@/lib/contracts/brief";

const list = (lines: string[]) => lines.map((line) => `- ${line}`).join("\n");
/** A Markdown link; brackets in the text would end it early. */
const link = (text: string, url: string) => (url ? `[${text.replace(/[[\]]/g, "")}](${url})` : text);

export function briefSections(brief: Brief, department: Department): BriefSection[] {
  const whom = [
    list([
      `${t("brief.whom.groups")} ${brief.groups.length > 0 ? brief.groups.map(targetGroupLabel).join(", ") : t("brief.whom.noGroups")}`,
      `${t("route.meta.place")} ${placeText(brief.placeTerc)}`,
      ...brief.indicators.map(briefIndicatorLine),
    ]),
    brief.indicators.length > 0 ? t("brief.whom.source") : t("brief.whom.noPlace"),
  ];

  const existing = [`_${t("brief.existing.question")}_`, t("brief.existing.scope")];
  if (brief.matches.length === 0) existing.push(t("brief.existing.none"));
  for (const match of brief.matches) {
    existing.push(
      `### ${link(match.title, match.sourceUrl)}`,
      list([...match.fits.map((fit) => `${t("brief.existing.fits")} ${fit}`), ...match.lacks.map((lack) => `${t("brief.existing.lacks")} ${lack}`)]),
    );
  }
  existing.push(
    brief.similarNeeds.length > 0 ? t("brief.existing.similar", { count: brief.similarNeeds.length }) : t("brief.existing.similarNone"),
  );

  const gap = [
    ...(brief.gapText ? [brief.gapText] : []),
    ...(brief.gaps.length > 0 ? [list(brief.gaps)] : brief.gapText ? [] : [t("brief.gap.none")]),
  ];

  const partners = list([
    ...(brief.implementerTypes.length > 0 ? [`${t("brief.partners.types")} ${implementerLabels(brief.implementerTypes)}`] : []),
    ...brief.partnersNearby.map((partner) =>
      t("brief.partners.nearby", { organisation: partner.organisation, place: partner.place_name, km: partner.distance_km }),
    ),
    t("brief.partners.readiness", { count: brief.readinessCount }),
    `${t("brief.partners.advisor")} ${department.email}, ${department.phone}`,
  ]);

  const paths = [
    ...brief.paths.flatMap((path) => [
      `### ${path.name_pl}`,
      list([
        `${t("path.applicant")}: ${applicantLabels(path.applicant_types)}`,
        `${t("path.amount")}: ${path.amount_note_pl}`,
        `${t("path.deadline")}: ${path.timing.note_pl}`,
        link(t("path.sourceLink"), path.source_url),
      ]),
    ]),
    `### ${t("brief.paths.advice")}`,
    `${department.name}: ${department.email}, ${department.phone}`,
  ];

  const sections: Record<BriefSectionKey, { heading: string | null; parts: string[] }> = {
    "tytul-roboczy": { heading: t("brief.titleLabel"), parts: [brief.title] },
    problem: { heading: t("brief.problem.title"), parts: [brief.problem, ...(brief.helplines ? [brief.helplines] : [])] },
    "kogo-dotyczy-i-skala": { heading: t("brief.whom.title"), parts: whom },
    "co-juz-istnieje": { heading: t("brief.existing.title"), parts: existing },
    luka: { heading: t("brief.gap.title"), parts: gap },
    "kierunek-rozwiazania": { heading: t("brief.direction.title"), parts: [brief.direction ?? t("brief.direction.text")] },
    "potencjalni-partnerzy": { heading: t("brief.partners.title"), parts: [partners] },
    "mozliwe-sciezki": { heading: t("brief.paths.title"), parts: paths },
    zrodla: { heading: t("brief.sources.title"), parts: [list(brief.sources.map((source) => link(source.title, source.url)))] },
    stopka: { heading: null, parts: [t("brief.label", { date: formatDate(brief.generatedAt) }), `_${t("attribution.note")}_`] },
  };
  return BRIEF_SECTION_KEYS.map((key) => ({ key, heading: sections[key].heading, text: sections[key].parts.join("\n\n") }));
}

/** The Markdown file of "Pobierz jako plik tekstowy" (S6) from the sections. */
export function sectionsToMarkdown(sections: BriefSection[]): string {
  const body = sections.map((section) => (section.heading ? `## ${section.heading}\n\n${section.text}` : `---\n\n${section.text}`));
  return `# ${t("brief.eyebrow")}\n\n${body.join("\n\n")}\n`;
}
