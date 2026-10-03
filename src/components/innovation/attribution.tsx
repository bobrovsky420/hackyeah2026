import { licenceOf, retrievedDate } from "@/lib/attribution";
import { t } from "@/lib/i18n";
import { sourceName } from "@/lib/labels";
import type { Innovation } from "@/lib/contracts/catalogue";

/**
 * The attribution line of FR-1.8, with the source entry and the licence
 * linked (the CC BY deed, or the MIIS terms), followed everywhere by the
 * same prototype note.
 */
export function Attribution({ item }: { item: Innovation }) {
  const date = retrievedDate(item);
  const licence = licenceOf(item);
  return (
    <div className="grid gap-1 border-t border-border pt-3 text-[0.9rem] text-muted-foreground">
      <p>
        {t("attribution.source")} {item.title}
        {item.organisation ? `, ${item.organisation}` : ""}. <a href={item.sourceUrl}>{sourceName(item.source)}</a>,{" "}
        {licence.href ? <a href={licence.href}>{licence.label}</a> : licence.label}.
        {date && ` ${t("attribution.retrieved", { date })}`}
      </p>
      <p>{t("attribution.note")}</p>
    </div>
  );
}
