import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { DocumentActions } from "@/components/document-actions";
import { ReportLink } from "@/components/report/report-link";
import { FocusOnMount } from "@/components/route/focus-on-mount";
import { Notice } from "@/components/ui/notice";
import { briefIndicatorLine, briefToMarkdown } from "@/lib/brief-markdown";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { applicantLabels, implementerLabels, targetGroupLabel } from "@/lib/labels";
import { ropsDepartment } from "@/lib/mock/contacts";
import { placeText } from "@/lib/places";
import { getBrief, INCUBATOR_PAGE } from "@/lib/server/brief";

export const metadata: Metadata = { title: t("brief.meta.title") };

const sectionTitle = "text-[1.3rem] font-bold @3xl:text-[1.45rem]";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-3 border-t border-border pt-6">
      <h2 id={id} className={sectionTitle}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** S6: "Fiszka potrzeby dla inkubatora" (FR-5.3, FR-5.5), printable and downloadable. */
export default async function BriefPage({ params }: PageProps<"/potrzeba/[id]/fiszka">) {
  const { id } = await params;
  const brief = getBrief(id);
  if (!brief) notFound();

  return (
    <article aria-labelledby="naglowek-fiszki" className="grid max-w-[48rem] gap-8">
      <FocusOnMount targetId="naglowek-fiszki" />
      <header className="grid gap-2">
        <p className="font-bold text-muted-foreground">{t("brief.eyebrow")}</p>
        <p className="text-muted-foreground">{t("brief.titleLabel")}</p>
        <h1 id="naglowek-fiszki" tabIndex={-1} className="text-[1.75rem] leading-tight font-bold @3xl:text-[2.2rem]">
          {brief.title}
        </h1>
      </header>

      <Notice title={t("brief.generated.title")}>
        <p>{t("brief.label", { date: formatDate(brief.generatedAt) })}</p>
        <p className="text-[0.95rem] text-muted-foreground">{t("attribution.note")}</p>
      </Notice>

      <DocumentActions markdown={briefToMarkdown(brief)} filename={`fiszka-${brief.needId}.md`} />

      <Section id="problem" title={t("brief.problem.title")}>
        <p className="whitespace-pre-line">{brief.problem}</p>
      </Section>

      <Section id="kogo-dotyczy" title={t("brief.whom.title")}>
        <dl className="grid gap-x-4 gap-y-1 @xl:grid-cols-[max-content_minmax(0,1fr)]">
          <dt className="font-bold">{t("brief.whom.groups")}</dt>
          <dd>{brief.groups.length > 0 ? brief.groups.map(targetGroupLabel).join(", ") : t("brief.whom.noGroups")}</dd>
          <dt className="font-bold">{t("route.meta.place")}</dt>
          <dd>{placeText(brief.placeTerc)}</dd>
        </dl>
        {brief.indicators.length > 0 ? (
          <>
            <ul className="grid list-disc gap-1 pl-6">
              {brief.indicators.map((item) => (
                <li key={item.key}>{briefIndicatorLine(item)}</li>
              ))}
            </ul>
            <p className="text-muted-foreground">{t("brief.whom.source")}</p>
          </>
        ) : (
          <p>
            {t("brief.whom.noPlace")} <Link href="/mapa">{t("brief.whom.map")}</Link>
          </p>
        )}
      </Section>

      <Section id="co-istnieje" title={t("brief.existing.title")}>
        <p className="italic">{t("brief.existing.question")}</p>
        {brief.matches.length === 0 && <p>{t("brief.existing.none")}</p>}
        {brief.matches.map((match) => (
          <div key={match.id} className="grid gap-1.5 rounded-lg border border-border p-4">
            <h3 className="text-[1.15rem] font-bold">
              <a href={match.sourceUrl}>{match.title}</a>
            </h3>
            {match.fits.length > 0 && (
              <p>
                <span className="font-bold">{t("brief.existing.fits")}</span> {match.fits.join(" ")}
              </p>
            )}
            {match.lacks.length > 0 && (
              <p>
                <span className="font-bold">{t("brief.existing.lacks")}</span> {match.lacks.join(" ")}
              </p>
            )}
          </div>
        ))}
        <p>
          {brief.similarNeeds.length > 0
            ? t("brief.existing.similar", { count: brief.similarNeeds.length })
            : t("brief.existing.similarNone")}
        </p>
      </Section>

      <Section id="luka" title={t("brief.gap.title")}>
        {brief.gaps.length === 0 ? (
          <p>{t("brief.gap.none")}</p>
        ) : (
          <ul className="grid list-disc gap-1 pl-6">
            {brief.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="kierunek" title={t("brief.direction.title")}>
        <p>{t("brief.direction.text")}</p>
      </Section>

      <Section id="partnerzy" title={t("brief.partners.title")}>
        <ul className="grid list-disc gap-1 pl-6">
          {brief.implementerTypes.length > 0 && (
            <li>
              {t("brief.partners.types")} {implementerLabels(brief.implementerTypes)}
            </li>
          )}
          {brief.partnersNearby.map((partner) => (
            <li key={`${partner.organisation}-${partner.innovation_id}`}>
              {t("brief.partners.nearby", { organisation: partner.organisation, place: partner.place_name, km: partner.distance_km })}
            </li>
          ))}
          <li>{t("brief.partners.readiness", { count: brief.readinessCount })}</li>
          <li>
            {t("brief.partners.advisor")} <a href={`mailto:${ropsDepartment.email}`}>{ropsDepartment.email}</a>
          </li>
        </ul>
      </Section>

      <Section id="sciezki" title={t("brief.paths.title")}>
        <ul className="grid gap-3">
          {brief.paths.map((path) => (
            <li key={path.id} className="grid gap-1 rounded-lg border border-border p-4">
              <h3 className="text-[1.15rem] font-bold">{path.name_pl}</h3>
              <p>
                {t("path.applicant")}: {applicantLabels(path.applicant_types)}. {path.amount_note_pl}
              </p>
              <p>{path.timing.note_pl}</p>
              <p>
                <a href={path.source_url}>{t("path.sourceLink")}</a>
              </p>
            </li>
          ))}
          <li className="grid gap-1 rounded-lg border border-border p-4">
            <h3 className="text-[1.15rem] font-bold">{t("brief.paths.advice")}</h3>
            <p>
              {ropsDepartment.name}: <a href={`mailto:${ropsDepartment.email}`}>{ropsDepartment.email}</a>, {ropsDepartment.phone}
            </p>
          </li>
        </ul>
      </Section>

      <Section id="zrodla" title={t("brief.sources.title")}>
        <ul className="grid list-disc gap-1 pl-6">
          {brief.sources.map((source) => (
            <li key={`${source.title}-${source.url}`}>
              <a href={source.url}>{source.title}</a>
            </li>
          ))}
        </ul>
      </Section>

      <p className="no-print border-t border-border pt-6">
        {t("brief.paste")} <a href={INCUBATOR_PAGE}>{t("brief.pasteLink")}</a>.
      </p>
      <ReportLink target={{ fiszka: brief.needId }} />
    </article>
  );
}
