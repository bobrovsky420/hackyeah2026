import { t } from "@/lib/i18n";

/*
 * The place labels of the picker (FR-2.2), safe for client components: the
 * server passes the gminas as PlaceOption props and the towns and villages
 * as LocalityOption props (src/lib/places.ts), and the label is built here
 * on both sides from the same lists. A locality only leads to its gmina:
 * the picker passes on the gmina's TERC, never the locality.
 */

/** What the picker needs of a gmina: 183 of these travel to the browser. */
export interface PlaceOption {
  terc: string;
  name: string;
  powiat: string;
  kind: string;
}

/** What the picker needs of a town or village: its name and its gmina's TERC. */
export interface LocalityOption {
  name: string;
  terc: string;
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

/** "Mszana Górna, gmina Mszana Dolna, powiat limanowski"; undefined when its gmina is not in the list. */
export function localityLabeller(places: PlaceOption[]): (locality: LocalityOption) => string | undefined {
  const ambiguous = ambiguousNames(places);
  const byTerc = new Map(places.map((place) => [place.terc, place]));
  return (locality) => {
    const gmina = byTerc.get(locality.terc);
    if (!gmina) return undefined;
    if (gmina.name === gmina.powiat) return t("place.label.localityInCity", { name: locality.name, gmina: gmina.name });
    if (ambiguous.has(`${gmina.name}|${gmina.powiat}`)) {
      return t("place.label.localityWithKind", { name: locality.name, kind: gmina.kind, gmina: gmina.name, powiat: gmina.powiat });
    }
    return t("place.label.locality", { name: locality.name, gmina: gmina.name, powiat: gmina.powiat });
  };
}
