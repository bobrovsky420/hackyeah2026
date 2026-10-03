import type { Innovation } from "@/lib/contracts/catalogue";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { sourceName } from "@/lib/labels";

export const CC_BY_DEED = "https://creativecommons.org/licenses/by/4.0/deed.pl";

/** The retrieval date in the interface format of section 11, such as "28.09.2026". */
export function retrievedDate(item: Innovation): string | null {
  return item.retrievedAt ? formatDate(item.retrievedAt) : null;
}

/**
 * FR-1.8 as plain text: "Źródło: {tytuł}, {organizacja}. {nazwa źródła},
 * {licencja}. Pobrano {data}." For the downloaded route file.
 */
export function attributionText(item: Innovation): string {
  const author = item.organisation ? `, ${item.organisation}` : "";
  const date = retrievedDate(item);
  const retrieved = date ? ` ${t("attribution.retrieved", { date })}` : "";
  return `${t("attribution.source")} ${item.title}${author}. ${sourceName(item.source)}, ${item.licence}.${retrieved}`;
}
