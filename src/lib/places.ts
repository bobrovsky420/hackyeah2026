import type { Gmina } from "@/lib/contracts/catalogue";
import { t } from "@/lib/i18n";
import { getGmina, gminy } from "@/lib/mock/data";

/** Names that occur twice in one powiat, such as the town and the rural gmina of Nowy Targ. */
const ambiguous = new Set(
  gminy
    .map((g) => `${g.name}|${g.powiat}`)
    .filter((key, index, all) => all.indexOf(key) !== index),
);

/** "Laskowa, powiat limanowski"; adds the kind of gmina only where the name is ambiguous. */
export function placeLabel(gmina: Gmina): string {
  if (gmina.name === gmina.powiat) return t("place.label.city", { name: gmina.name });
  if (ambiguous.has(`${gmina.name}|${gmina.powiat}`)) {
    return t("place.label.withKind", { name: gmina.name, kind: gmina.kind, powiat: gmina.powiat });
  }
  return t("place.label", { name: gmina.name, powiat: gmina.powiat });
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
