import "server-only";
import { gminy } from "@/lib/catalogue";
import { placeText } from "@/lib/places";
import { fold } from "@/lib/text";
import type { PlaceFilter } from "@/server/db";

/**
 * The gmina filter of the console (FR-9.2) as the repository takes it: the
 * gminas whose label contains the typed text, case and diacritics folded,
 * and null when "cała Małopolska" matches too. Undefined for an empty field.
 */
export function placesMatching(text: string): PlaceFilter | undefined {
  if (!text) return undefined;
  const wanted = fold(text);
  const places: PlaceFilter = gminy()
    .filter((gmina) => fold(placeText(gmina.terc)).includes(wanted))
    .map((gmina) => gmina.terc);
  if (fold(placeText(null)).includes(wanted)) places.push(null);
  return places;
}
