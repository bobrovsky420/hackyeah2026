import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { DocumentActions } from "@/components/document-actions";
import { CanvasAnswers } from "@/components/idea/canvas-answers";
import { SimilarPending } from "@/components/idea/similar-pending";
import { FocusOnMount } from "@/components/route/focus-on-mount";
import { buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { getGmina, getInnovation } from "@/lib/catalogue";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { ideaStageLabel, targetGroupLabel } from "@/lib/labels";
import { repository } from "@/server/db";
import { ideaStatusLabel } from "@/server/admin/labels";
import { ideaMarkdown } from "@/server/ideas";

export const metadata: Metadata = { title: t("card.meta.title") };

/** The needs bank's text for an assessment without gaps; it speaks of a need, so the card leaves the line out. */
const NO_GAPS = t("brief.existing.lacksNone");

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
 * The idea card of module III ("Kreator pomysłów"), printable and
 * downloadable, with the similar innovations of the catalogue: computed on
 * the first visit, stored, then shown as stored. The author's contact is
 * never shown; the card waits for ROPS before anyone else sees it.
 */
export default async function IdeaPage({ params }: PageProps<"/idea/[id]">) {
  const { id } = await params;
  const idea = await repository().getIdea(id);
  // The panel's demonstration data has no public card.
  if (!idea || idea.demo) notFound();
  const gmina = getGmina(idea.place_terc);
  const similar = idea.similar?.flatMap((match) => {
    const innovation = getInnovation(match.innovation_id);
    return innovation ? [{ match, innovation }] : [];
  });

  return (
    <article aria-labelledby="naglowek-fiszki" className="grid max-w-[48rem] gap-8">
      <FocusOnMount targetId="naglowek-fiszki" />
      <header className="grid gap-2">
        <p className="font-bold text-muted-foreground">{t(idea.kind === "pomysl" ? "card.eyebrow.pomysl" : "card.eyebrow.praktyka")}</p>
        <h1 id="naglowek-fiszki" tabIndex={-1} className="text-[1.75rem] leading-tight font-bold @3xl:text-[2.2rem]">
          {idea.title}
        </h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="font-bold">{t("card.stage")}</dt>
          <dd>{ideaStageLabel(idea.stage)}</dd>
          {gmina && (
            <>
              <dt className="font-bold">{t("card.place")}</dt>
              <dd>{gmina.name}</dd>
            </>
          )}
          <dt className="font-bold">{t("card.author")}</dt>
          <dd>{idea.author.display_name}</dd>
        </dl>
      </header>

      <section aria-labelledby="status-fiszki" className="grid gap-3">
        <h2 id="status-fiszki" className={sectionTitle}>
          {t("card.reply.title")}
        </h2>
        <p>
          <span className="font-bold">{t("card.reply.status")}</span> {ideaStatusLabel(idea.status)}
        </p>
        {idea.reply ? (
          <Notice tone="success" title={t("card.reply.from", { date: formatDate(idea.reply.at) })}>
            <p className="whitespace-pre-line">{idea.reply.text_pl}</p>
          </Notice>
        ) : (
          <Notice title={t("card.status.title")}>
            <p>{t("card.status.text")}</p>
          </Notice>
        )}
      </section>

      <DocumentActions markdown={ideaMarkdown(idea)} filename={`zgloszenie-pomyslu-${idea.id}.md`} />

      <Section id="opis" title={t("card.description")}>
        <p className="whitespace-pre-line">{idea.description}</p>
      </Section>
      <Section id="istota" title={t("card.essence")}>
        <p className="whitespace-pre-line">{idea.essence}</p>
      </Section>
      <Section id="dla-kogo" title={t("card.forWhom")}>
        <p className="whitespace-pre-line">{idea.for_whom}</p>
        {idea.target_groups.length > 0 && (
          <p>
            <span className="font-bold">{t("card.groups")}</span> {idea.target_groups.map(targetGroupLabel).join(", ")}
          </p>
        )}
      </Section>

      {idea.canvas && (
        <Section id="canvas" title={t("card.canvas.title")}>
          <p>{t("card.canvas.lead")}</p>
          <CanvasAnswers canvas={idea.canvas} />
        </Section>
      )}

      <Section id="podobne" title={t("card.similar.title")}>
        <p>{t("card.similar.lead")}</p>
        {!similar ? (
          <SimilarPending ideaId={idea.id} />
        ) : similar.length === 0 ? (
          <p>{t("card.similar.none")}</p>
        ) : (
          <>
            <ul className="grid gap-4">
              {similar.map(({ match, innovation }) => (
                <li key={innovation.id} className="grid gap-1 rounded-md border border-border p-4">
                  <h3 className="text-[1.1rem] font-bold">
                    <Link href={`/innowacja/${innovation.id}`}>{innovation.title}</Link>
                  </h3>
                  <p className="text-muted-foreground">{t("card.similar.score", { score: match.fit_score })}</p>
                  <p>
                    <span className="font-bold">{t("card.similar.fits")}</span> {match.what_fits_pl}
                  </p>
                  {match.what_lacks_pl !== NO_GAPS && (
                    <p>
                      <span className="font-bold">{t("card.similar.lacks")}</span> {match.what_lacks_pl}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">{t("card.similar.generated")}</p>
          </>
        )}
      </Section>

      <Section id="co-dalej" title={t("card.next.title")}>
        <p>{t("card.next.text")}</p>
        <div className="no-print flex flex-wrap gap-3">
          <Link href={`/zapytaj?pomysl=${idea.id}`} className={buttonVariants()}>
            {t("card.next.contact")}
          </Link>
          <Link href="/zglos-pomysl" className={buttonVariants({ variant: "secondary" })}>
            {t("card.next.another")}
          </Link>
        </div>
      </Section>
    </article>
  );
}
