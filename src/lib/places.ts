import { getGmina, gminy } from "@/lib/catalogue";
import type { Gmina } from "@/lib/contracts/catalogue";
import { t } from "@/lib/i18n";
import { ambiguousNames, formatPlaceLabel, type PlaceOption } from "@/lib/place-options";

/*
 * Place labels on the server. Client components get the gminas as props
 * (placeOptions) and label them with src/lib/place-options.ts.
 */

let ambiguous: { list: Gmina[]; names: Set<string> } | undefined;

function ambiguousOf(list: Gmina[]): Set<string> {
  if (ambiguous?.list !== list) ambiguous = { list, names: ambiguousNames(list) };
  return ambiguous.names;
}

/** "Laskowa, powiat limanowski"; adds the kind of gmina only where the name is ambiguous. */
export function placeLabel(gmina: Gmina): string {
  return formatPlaceLabel(gmina, ambiguousOf(gminy()));
}

/** The 183 gminas of Małopolska for the picker, without the centroids. */
export function placeOptions(): PlaceOption[] {
  return gminy().map(({ terc, name, powiat, kind }) => ({ terc, name, powiat, kind }));
}

/** The place of a route or a need as a label, "cała Małopolska" when none was chosen. */
export function placeText(terc: string | null | undefined): string {
  const gmina = getGmina(terc);
  return gmina ? placeLabel(gmina) : t("place.wholeRegion");
}

/** The place inside a sentence: "w gminie Laskowa" or "w Małopolsce". */
export function placeWhere(terc: string | null | undefined): string {
  const gmina = getGmina(terc);
  return gmina ? t("place.inGmina", { name: gmina.name }) : t("place.inRegion");
}
