import { t } from "@/lib/i18n";
import type { ImplementationPath } from "@/lib/mock/types";

/** A legal or funding path (FR-4.5); the id is the target of the next steps' links. */
export function PathCard({ path }: { path: ImplementationPath }) {
  const headingId = `sciezka-${path.id}-tytul`;
  return (
    <article id={`sciezka-${path.id}`} aria-labelledby={headingId} className="grid scroll-mt-6 gap-4 rounded-lg border border-border bg-background p-5">
      <h3 id={headingId} className="text-[1.25rem] leading-snug font-bold">
        {path.name}
      </h3>
      <dl className="grid gap-x-5 gap-y-1 @xl:grid-cols-[max-content_minmax(0,1fr)]">
        <dt className="font-bold">{t("path.applicant")}</dt>
        <dd>{path.applicant}</dd>
        <dt className="font-bold">{t("path.amount")}</dt>
        <dd>{path.amount}</dd>
        <dt className="font-bold">{t("path.deadline")}</dt>
        <dd>{path.deadline}</dd>
        <dt className="font-bold">{t("path.why")}</dt>
        <dd>{path.why}</dd>
      </dl>
      <div className="grid gap-2">
        <h4 className="font-bold">{t("path.steps")}</h4>
        <ol className="grid list-decimal gap-1 pl-6">
          {path.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      <p className="border-t border-border pt-3 text-[0.9rem] text-muted-foreground">
        {t("path.source")} <a href={path.source.url}>{path.source.label}</a>
      </p>
    </article>
  );
}
