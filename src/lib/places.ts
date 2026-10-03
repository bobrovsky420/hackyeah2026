import { t } from "@/lib/i18n";
import { gminy } from "@/lib/mock/data";
import type { Gmina } from "@/lib/mock/types";

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
