import gminyData from "./gminy.json";
import innovationsData from "./innovations.json";
import type { Gmina, Innovation } from "@/lib/contracts/catalogue";

/*
 * Prototype fixtures, extracted on 29 September 2026 from the local data
 * build (data/places/pl-register.json with the centroids, and
 * data/innovations/), so the prototype runs on a fresh clone without the
 * pipeline. The MIIS records are shown like every ROPS record (decided
 * 29 September 2026). The real app reads data/ at start.
 */
export const gminy = gminyData as Gmina[];
export const innovations = innovationsData as Innovation[];

const innovationsById = new Map(innovations.map((item) => [item.id, item]));
const gminyByTerc = new Map(gminy.map((item) => [item.terc, item]));

export function getInnovation(id: string): Innovation | undefined {
  return innovationsById.get(id);
}

export function getGmina(terc: string | null | undefined): Gmina | undefined {
  return terc ? gminyByTerc.get(terc) : undefined;
}
