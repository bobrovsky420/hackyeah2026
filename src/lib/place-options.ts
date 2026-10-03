import { t } from "@/lib/i18n";

/*
 * The place labels of the picker (FR-2.2), safe for client components: the
 * server passes the gminas as PlaceOption props (src/lib/places.ts), and
 * the label is built here on both sides from the same list.
 */

/** What the picker needs of a gmina: 183 of these travel to the browser. */
export interface PlaceOption {
  terc: string;
  name: string;
  powiat: string;
  kind: string;
}

/** Names that occur twice in one powiat, such as the town and the rural gmina of Nowy Targ. */
export function ambiguousNames(places: PlaceOption[]): Set<string> {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const place of places) {
    const key = `${place.name}|${place.powiat}`;
    if (seen.has(key)) twice.add(key);
    seen.add(key);
  }
  return twice;
}

/** "Laskowa, powiat limanowski"; adds the kind of gmina only where the name is ambiguous. */
export function formatPlaceLabel(place: PlaceOption, ambiguous: Set<string>): string {
  if (place.name === place.powiat) return t("place.label.city", { name: place.name });
  if (ambiguous.has(`${place.name}|${place.powiat}`)) {
    return t("place.label.withKind", { name: place.name, kind: place.kind, powiat: place.powiat });
  }
  return t("place.label", { name: place.name, powiat: place.powiat });
}

/** A labeller over one list of places, for the picker's options and its prefilled value. */
export function placeLabeller(places: PlaceOption[]): (place: PlaceOption) => string {
  const ambiguous = ambiguousNames(places);
  return (place) => formatPlaceLabel(place, ambiguous);
}
