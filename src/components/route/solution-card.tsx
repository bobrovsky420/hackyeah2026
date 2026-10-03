import Link from "next/link";
import { Attribution } from "@/components/innovation/attribution";
import { buttonVariants } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { costLabel, evidenceLabel, fitLabel, implementerLabels, quoteFieldLabel, sourceBadge, timeLabel } from "@/lib/labels";
import { getInnovation } from "@/lib/mock/data";
import type { Solution } from "@/lib/mock/types";

/** A solution on S2 (FR-4.2) or a nearest partial match on S3. */
export function SolutionCard({ solution, routeId, partial }: { solution: Solution; routeId: string; partial: boolean }) {
  const item = getInnovation(solution.innovationId);
  if (!item) return null;
  const headingId = `rozwiazanie-${item.id}`;
  const detailsHref = `/innowacja/${item.id}?droga=${routeId}`;

  return (
    <article aria-labelledby={headingId} className="grid gap-4 rounded-lg border border-border bg-background p-5">
      <div className="grid gap-1.5">
        <p className="justify-self-start rounded-sm border border-input px-2 text-[0.9rem] font-bold text-muted-foreground">
          {sourceBadge(item.source)}
        </p>
        <h3 id={headingId} className="text-[1.25rem] leading-snug font-bold">
          <Link href={detailsHref}>{item.title}</Link>
        </h3>
        {item.organisation && <p>{item.organisation}</p>}
      </div>

      <p className="flex flex-wrap items-baseline gap-x-3 font-bold">
        {fitLabel(solution.fit)}
        <span className="font-normal text-muted-foreground tabular-nums">{t("fit.score", { score: solution.fit })}</span>
      </p>

      <div className="grid gap-2">
        <h4 className="font-bold">{t(partial ? "s3.card.matches" : "s2.card.why")}</h4>
        <ul className="grid list-disc gap-2 pl-6">
          {solution.reasons.map((quote) => (
            <li key={quote.text}>
              „{quote.text}”
              <span className="block text-[0.9rem] text-muted-foreground">
                {t("quote.from", { field: quoteFieldLabel(quote.field) })}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {partial && solution.gaps.length > 0 && (
        <div className="grid gap-2">
          <h4 className="font-bold">{t("s3.card.missing")}</h4>
          <ul className="grid list-disc gap-1 pl-6">
            {solution.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      )}

      {!partial && (
        <div className="grid gap-2">
          <h4 className="font-bold">{t("s2.card.needs")}</h4>
          <dl className="grid gap-x-5 gap-y-1 @xl:grid-cols-[max-content_minmax(0,1fr)]">
            <dt className="font-bold">{t("facts.implementer")}</dt>
            <dd>{implementerLabels(item.implementerTypes)}</dd>
            <dt className="font-bold">{t("facts.cost")}</dt>
            <dd>{costLabel(item.costBand)}</dd>
            <dt className="font-bold">{t("facts.time")}</dt>
            <dd>{timeLabel(item.timeToImplement)}</dd>
            <dt className="font-bold">{t("facts.evidence")}</dt>
            <dd>{evidenceLabel(item.evidenceLevel)}</dd>
            {item.requires.length > 0 && (
              <>
                <dt className="font-bold">{t("facts.requires")}</dt>
                <dd>{item.requires.slice(0, 3).join(", ")}</dd>
              </>
            )}
          </dl>
        </div>
      )}

      <p>
        <span className="font-bold">{t("s2.card.where")}</span> {solution.whereItWorks}
      </p>

      <div className="no-print flex flex-wrap gap-3">
        <Link href={detailsHref} className={buttonVariants({ variant: "secondary" })}>
          {t("s2.card.details")}
        </Link>
        <Link href={`/kontakt?innowacja=${item.id}&droga=${routeId}`} className={buttonVariants({ variant: "secondary" })}>
          {t("s2.card.contact")}
        </Link>
      </div>

      <Attribution item={item} />
    </article>
  );
}
