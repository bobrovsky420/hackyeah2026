import type { Implementation } from "@/lib/contracts/catalogue";
import type { Route, RouteSolution } from "@/lib/contracts/route";
import { getGmina, getInnovation } from "./data";
import implementationsData from "./map/implementations.json";

/*
 * Known implementations (8.6) of the prototype's innovations, extracted on
 * 29 September 2026 from data/implementations.yaml and the derived places
 * of origin, each with its gmina's centroid. They feed "Gdzie działa", the
 * implementers nearby (FR-4.4) and the map (S4). Distances run between
 * gmina centroids (8.9).
 */
export type LocatedImplementation = Implementation & { centroid: [number, number] };

const NEARBY_KM = 50;

export const implementations = implementationsData as LocatedImplementation[];

export function implementationsOf(innovationId: string): LocatedImplementation[] {
  return implementations.filter((item) => item.innovation_id === innovationId);
}

export function implementationsIn(terc: string): LocatedImplementation[] {
  return implementations.filter((item) => item.place_terc === terc);
}

/** Great-circle distance in whole kilometres between two [lon, lat] points. */
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

/** "Gdzie działa" of FR-4.2 for a reader in the gmina `terc`: the count and the nearest within 50 km. */
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
  return implementations
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
