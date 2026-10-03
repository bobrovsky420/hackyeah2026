import { t } from "@/lib/i18n";
import { sourceName } from "@/lib/labels";
import type { Innovation } from "@/lib/mock/types";

/** CC BY 4.0 attribution: title, author, source and licence (12.6, R4). */
export function Attribution({ item }: { item: Innovation }) {
  return (
    <p className="border-t border-border pt-3 text-[0.9rem] text-muted-foreground">
      {t("attribution.source")} „{item.title}”{item.organisation ? `, ${item.organisation}` : ""},{" "}
      <a href={item.sourceUrl}>{sourceName(item.source)}</a>, {t("attribution.licence", { licence: item.licence })}
    </p>
  );
}
