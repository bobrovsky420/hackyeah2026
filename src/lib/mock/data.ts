import gminyData from "./gminy.json";
import innovationsData from "./innovations.json";
import localitiesData from "./localities.json";
import type { Gmina, Innovation, Locality } from "@/lib/contracts";

/*
 * Prototype fixtures, extracted from the local data
 * build (data/built/places/pl-register.json with the centroids,
 * data/built/places/malopolska-localities.json and data/built/innovations/), so the
 * prototype runs on a fresh clone without the pipeline. The MIIS records are shown like every ROPS record (decision
 * D.4). The app reads them only through src/lib/catalogue.ts,
 * when data/ is missing or fails the loader's checks, or with DATA_SOURCE=mock.
 */
export const gminy = gminyData as Gmina[];
export const innovations = innovationsData as Innovation[];
export const localities = localitiesData as Locality[];

const innovationsById = new Map(innovations.map((item) => [item.id, item]));
const gminyByTerc = new Map(gminy.map((item) => [item.terc, item]));

export function getInnovation(id: string): Innovation | undefined {
  return innovationsById.get(id);
}

export function getGmina(terc: string | null | undefined): Gmina | undefined {
  return terc ? gminyByTerc.get(terc) : undefined;
}
