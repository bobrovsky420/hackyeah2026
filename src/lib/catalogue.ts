import "server-only";
import type { Gmina, Innovation } from "@/lib/contracts/catalogue";
import type { Department, Helpline } from "@/lib/contracts/contacts";
import type { GminaBoundaries, IndicatorSet } from "@/lib/contracts/map";
import type { ImplementationPath } from "@/lib/contracts/path";
import type { Route, RouteSolution } from "@/lib/contracts/route";
import { DataLoadError, getDataset, loadDataset } from "@/lib/data/load";
import type { Dataset, LocatedImplementation } from "@/lib/data/to-contracts";
import { fixtureCatalogue } from "@/lib/mock/fixtures";

/*
 * The one door to the catalogue data for the screens and the API: the real
 * data of data/ (getDataset(), checked by the loader) when it loads, else
 * the committed fixtures of src/lib/mock/, so a fresh clone runs without
 * the pipeline (decided 29 September 2026). DATA_SOURCE=data|mock forces
 * one; a forced "data" that fails to load throws. Cached per process.
 */

export type { LocatedImplementation } from "@/lib/data/to-contracts";

export type CatalogueSource = "data" | "mock";
type Advisor = Route["people"]["advisor"];
type Innovator = Route["people"]["innovators"][number];

export interface Catalogue {
  source: CatalogueSource;
  /** data-version.json `version`, or the fixtures' stamp. */
  version: string;
  innovations: Innovation[];
  innovationById: Map<string, Innovation>;
  /** The 183 gminas of Małopolska: the picker, the map and every place a reader can choose. */
  gminy: Gmina[];
  gminaByTerc: Map<string, Gmina>;
  /** Implementations with a gmina, in all of Poland, each with its gmina's centroid. */
  implementations: LocatedImplementation[];
  paths: ImplementationPath[];
  pathById: Map<string, ImplementationPath>;
  knowledge: Dataset["knowledge"];
  advisorByCategory: Map<string, Advisor>;
  innovatorByInnovation: Map<string, Innovator>;
  department: Department;
  helplines: { alarm: Helpline[]; support: Helpline[] };
  indicators: IndicatorSet;
  boundaries: GminaBoundaries;
  /** The whole dataset (index cards, vectors, raw records) for the matcher; null on the fixtures. */
  dataset: Dataset | null;
}

export function fromDataset(dataset: Dataset): Catalogue {
  return {
    source: "data",
    version: dataset.version,
    innovations: dataset.innovations,
    innovationById: dataset.innovationById,
    gminy: dataset.gminyMalopolska,
    gminaByTerc: new Map(dataset.gminyMalopolska.map((gmina) => [gmina.terc, gmina])),
    implementations: dataset.locatedImplementations,
    paths: dataset.paths,
    pathById: dataset.pathById,
    knowledge: dataset.knowledge,
    advisorByCategory: dataset.advisorByCategory,
    innovatorByInnovation: dataset.innovatorByInnovation,
    department: dataset.department,
    helplines: dataset.helplines,
    indicators: dataset.indicators,
    boundaries: dataset.boundaries,
    dataset,
  };
}

export interface CatalogueOptions {
  /** "data", "mock" or anything else for automatic; default: DATA_SOURCE. */
  source?: string;
  /** Read another folder than data/ (tests); default: the cached getDataset(). */
  dataDir?: string;
  /** Where the fallback is reported; default: console.warn. */
  warn?: (message: string) => void;
}

/** The catalogue from data/ or, when it is missing or fails the loader's checks, from the fixtures. */
export function loadCatalogue(options: CatalogueOptions = {}): Catalogue {
  const forced = options.source ?? process.env.DATA_SOURCE;
  if (forced === "mock") return fixtureCatalogue();
  try {
    return fromDataset(options.dataDir ? loadDataset({ dataDir: options.dataDir }) : getDataset());
  } catch (error) {
    if (forced === "data" || !(error instanceof DataLoadError)) throw error;
    (options.warn ?? console.warn)(`${error.message}\nServing the prototype's fixtures of src/lib/mock/ instead; DATA_SOURCE=data would stop here.`);
    return fixtureCatalogue();
  }
}

let cached: Catalogue | undefined;

/** loadCatalogue() once per server process, so a fallback is logged once. */
export function catalogue(): Catalogue {
  cached ??= loadCatalogue();
  return cached;
}

/** Which data is live, for /api/health and the "Jak to działa" card. */
export function dataSource(): { source: CatalogueSource; version: string } {
  const { source, version } = catalogue();
  return { source, version };
}

// ---------------------------------------------------------------- lookups

export function getInnovation(id: string | null | undefined): Innovation | undefined {
  return id ? catalogue().innovationById.get(id) : undefined;
}

/** A gmina of Małopolska, the only places a reader can choose. */
export function getGmina(terc: string | null | undefined): Gmina | undefined {
  return terc ? catalogue().gminaByTerc.get(terc) : undefined;
}

export function gminy(): Gmina[] {
  return catalogue().gminy;
}

export function implementations(): LocatedImplementation[] {
  return catalogue().implementations;
}

export function implementationsOf(innovationId: string): LocatedImplementation[] {
  return implementations().filter((item) => item.innovation_id === innovationId);
}

export function allPaths(): ImplementationPath[] {
  return catalogue().paths;
}

export function getPath(id: string): ImplementationPath | undefined {
  return catalogue().pathById.get(id);
}

export function knowledge(): Catalogue["knowledge"] {
  return catalogue().knowledge;
}

/** people.advisor for a target group; the ROPS department when no row names one (OP-10). */
export function advisorFor(category: string): Advisor {
  const { advisorByCategory, department } = catalogue();
  return advisorByCategory.get(category) ?? { category, name: null, role: department.name, email: department.email, phone: department.phone };
}

export function innovatorOf(innovationId: string): Innovator | undefined {
  return catalogue().innovatorByInnovation.get(innovationId);
}

export function ropsDepartment(): Department {
  return catalogue().department;
}

export function helplines(): Catalogue["helplines"] {
  return catalogue().helplines;
}

export function indicators(): IndicatorSet {
  return catalogue().indicators;
}

export function boundaries(): GminaBoundaries {
  return catalogue().boundaries;
}

// ------------------------------------------------------------- place facts

/** Implementers within this distance count as nearby (FR-4.4). */
const NEARBY_KM = 50;

/** Great-circle distance in whole kilometres between two [lon, lat] points; distances run between gmina centroids (8.9). */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}

function placeName(item: LocatedImplementation): string {
  return item.place_name ?? getGmina(item.place_terc)?.name ?? item.place_terc;
}

/** "Gdzie działa" of FR-4.2 for a reader in the gmina `terc`: the count and the nearest three within 50 km. */
export function whereItRuns(innovationId: string, terc: string | null): RouteSolution["where_it_runs"] {
  const all = implementationsOf(innovationId);
  const origin = getGmina(terc)?.centroid;
  const nearest = origin
    ? all
        .map((item) => ({ terc: item.place_terc, name: placeName(item), distance_km: distanceKm(origin, item.centroid) }))
        .filter((item) => item.distance_km <= NEARBY_KM)
        .sort((a, b) => a.distance_km - b.distance_km)
        .slice(0, 3)
    : [];
  return { count: all.length, nearest };
}

/** The implementers of the route's solutions within 50 km, nearest first (FR-4.4). */
export function implementersNearby(innovationIds: string[], terc: string | null): Route["people"]["implementers_nearby"] {
  const origin = getGmina(terc)?.centroid;
  if (!origin) return [];
  return implementations()
    .filter((item) => innovationIds.includes(item.innovation_id))
    .map((item) => ({
      organisation: item.organisation ?? getInnovation(item.innovation_id)?.organisation ?? placeName(item),
      place_name: placeName(item),
      distance_km: distanceKm(origin, item.centroid),
      innovation_id: item.innovation_id,
    }))
    .filter((item) => item.distance_km <= NEARBY_KM)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, 3);
}

/** Fills the place-dependent facts of a route for its own gmina, as the composer does (FR-4.1). */
export function withPlaceFacts(route: Route): Route {
  const terc = route.input.place_terc;
  const ids = route.solutions.map((solution) => solution.innovation_id);
  return {
    ...route,
    solutions: route.solutions.map((solution) => ({ ...solution, where_it_runs: whereItRuns(solution.innovation_id, terc) })),
    people: { ...route.people, implementers_nearby: implementersNearby(ids, terc) },
  };
}
