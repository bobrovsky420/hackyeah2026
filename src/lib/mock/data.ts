import gminyData from "./gminy.json";
import innovationsData from "./innovations.json";
import type { Gmina, Innovation } from "./types";

/*
 * Prototype fixtures, extracted from the local data
 * build (data/places/pl-register.json and data/innovations/, CC BY 4.0
 * records only), so the prototype runs on a fresh clone without the
 * pipeline. The real app reads data/ at start instead.
 */
export const gminy: Gmina[] = gminyData;
export const innovations = innovationsData as Innovation[];

const innovationsById = new Map(innovations.map((item) => [item.id, item]));
const gminyByTerc = new Map(gminy.map((item) => [item.terc, item]));

export function getInnovation(id: string): Innovation | undefined {
  return innovationsById.get(id);
}

export function getGmina(terc: string | null | undefined): Gmina | undefined {
  return terc ? gminyByTerc.get(terc) : undefined;
}
