import type { ImplementationPath } from "@/lib/contracts/path";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { applicantLabels } from "@/lib/labels";

/**
 * A legal or funding path (FR-4.5): the facts come from the path data
 * (8.7), only "Dlaczego ta ścieżka" from the route. The id is the target of
 * the next steps' links.
 */
export function PathCard({ path, why }: { path: ImplementationPath; why: string }) {
  const headingId = `sciezka-${path.id}-tytul`;
  return (
    <article id={`sciezka-${path.id}`} aria-labelledby={headingId} className="grid scroll-mt-6 gap-4 rounded-lg border border-border bg-background p-5">
      <h3 id={headingId} className="text-[1.25rem] leading-snug font-bold">
        {path.name_pl}
      </h3>
      <dl className="grid gap-x-5 gap-y-1 @xl:grid-cols-[max-content_minmax(0,1fr)]">
        <dt className="font-bold">{t("path.applicant")}</dt>
        <dd>{applicantLabels(path.applicant_types)}</dd>
        <dt className="font-bold">{t("path.amount")}</dt>
        <dd>{path.amount_note_pl}</dd>
        <dt className="font-bold">{t("path.deadline")}</dt>
        <dd>{path.timing.note_pl}</dd>
        <dt className="font-bold">{t("path.decides")}</dt>
        <dd>{path.decision_maker_pl}</dd>
        <dt className="font-bold">{t("path.why")}</dt>
        <dd>{why}</dd>
      </dl>
      <div className="grid gap-2">
        <h4 className="font-bold">{t("path.steps")}</h4>
        <ol className="grid list-decimal gap-1 pl-6">
          {path.steps_pl.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      <div className="grid gap-1 border-t border-border pt-3 text-[0.9rem] text-muted-foreground">
        <p>
          {t("path.basis")} {path.legal_basis_pl}. <a href={path.source_url}>{t("path.sourceLink")}</a>.{" "}
          {t("path.verified", { date: formatDate(path.verified_on) })}
        </p>
        <p>{path.notes_pl}</p>
      </div>
    </article>
  );
}
