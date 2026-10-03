import type { Innovation } from "@/lib/contracts/catalogue";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { sourceName } from "@/lib/labels";

export const CC_BY_DEED = "https://creativecommons.org/licenses/by/4.0/deed.pl";
export const MIIS_TERMS = "https://rops.krakow.pl/mpliki/IS/BIBLIOTEKA_INNOWACJI_SPOECZNYCH/Zasady_wykorzystania_innowacji_MIIS.pdf";
/** The library has no index page; this one lists its nine categories. */
export const ROPS_LIBRARY = "https://rops.krakow.pl/innowacje-spoleczne/biblioteka-innowacji-spolecznych/kategorie";

/**
 * The licence of the attribution line (FR-1.8) as a reader sees it. The MIIS
 * items are shown like every ROPS item (decided 29 September 2026); their
 * licence value is provenance, named here by its terms.
 */
export function licenceOf(item: Innovation): { label: string; href: string | null } {
  if (item.licence === "CC BY 4.0") return { label: item.licence, href: CC_BY_DEED };
  if (item.licence === "MIIS-agreement") return { label: t("attribution.licence.miis"), href: MIIS_TERMS };
  return { label: item.licence, href: null };
}

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
  return `${t("attribution.source")} ${item.title}${author}. ${sourceName(item.source)}, ${licenceOf(item).label}.${retrieved}`;
}
