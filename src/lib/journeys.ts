/**
 * The four journeys of the start page (decision U.10): a need, an idea,
 * help and a question to ROPS. Each has a colour of the Małopolska
 * pictogram, shown on its tile, its menu item, its pages' headers and the
 * route's sections; a page of none (the map, "Jak to działa", "Moje
 * sprawy") keeps the accent blue. The colour never carries meaning alone:
 * the tile, the item and the heading say it in words.
 */
export type Journey = "need" | "idea" | "help" | "ask";

/** The journey of a public path, or null. */
export function journeyOf(path: string): Journey | null {
  if (path === "/" || path.startsWith("/droga/") || path.startsWith("/zapisz-potrzebe") || path.startsWith("/potrzeba/")) return "need";
  if (path.startsWith("/zglos-pomysl") || path.startsWith("/pomysl/")) return "idea";
  if (path.startsWith("/chce-pomoc") || path.startsWith("/partnerstwa")) return "help";
  if (path.startsWith("/zapytaj") || path.startsWith("/rozmowa/")) return "ask";
  return null;
}
