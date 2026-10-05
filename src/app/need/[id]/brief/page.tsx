import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BriefPending } from "@/components/brief/brief-pending";
import { SectionText } from "@/components/brief/section-text";
import { DocumentActions } from "@/components/document-actions";
import { ReportLink } from "@/components/report/report-link";
import { FocusOnMount } from "@/components/route/focus-on-mount";
import { Notice } from "@/components/ui/notice";
import { JourneyMark } from "@/components/ui/journey-mark";
import { t } from "@/lib/i18n";
import { INCUBATOR_PAGE } from "@/server/needs/brief-template";
import { repository } from "@/server/db";
import { storedBrief } from "@/server/needs";

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

/**
 * S6: "Fiszka potrzeby dla inkubatora" (FR-5.3, FR-5.5), printable and
 * downloadable. The page and the file come from the stored sections (8.5);
 * before the brief exists, the page asks for it and waits.
 */
export default async function BriefPage({ params }: PageProps<"/need/[id]/brief">) {
  const { id } = await params;
  const need = await repository().getNeed(id);
  if (!need) notFound();
  const stored = await storedBrief(need.id);
  if (!stored) return <BriefPending needId={need.id} />;

  const footer = stored.sections.find((section) => section.key === "stopka");
  const body = stored.sections.filter((section) => section.heading !== null && section.key !== "tytul-roboczy");

  return (
    <article aria-labelledby="naglowek-fiszki" className="grid max-w-[48rem] gap-8">
      <FocusOnMount targetId="naglowek-fiszki" />
      <header className="grid gap-2">
        <p className="flex items-center gap-2 font-bold text-muted-foreground">
          <JourneyMark journey="need" size="sm" />
          {t("brief.eyebrow")}
        </p>
        <p className="text-muted-foreground">{t("brief.titleLabel")}</p>
        <h1 id="naglowek-fiszki" tabIndex={-1} className="text-[1.75rem] leading-tight font-bold @3xl:text-[2.2rem]">
          {stored.brief.title}
        </h1>
      </header>

      {footer && (
        <Notice title={t("brief.generated.title")}>
          <SectionText text={footer.text} />
        </Notice>
      )}

      <DocumentActions markdown={stored.markdown} filename={`fiszka-${need.id}.md`} />

      {body.map((section) => (
        <Section key={section.key} id={section.key} title={section.heading ?? ""}>
          <SectionText text={section.text} />
        </Section>
      ))}

      <p className="no-print border-t border-border pt-6">
        {t("brief.paste")} <a href={INCUBATOR_PAGE}>{t("brief.pasteLink")}</a>.
      </p>
      <ReportLink target={{ fiszka: need.id }} />
    </article>
  );
}
