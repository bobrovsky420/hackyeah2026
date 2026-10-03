import type { Gmina } from "@/lib/contracts/catalogue";
import { indexOrganisations, type Dataset, type OrganisationIndex } from "@/lib/data/to-contracts";
import type { BuiltInnovation } from "@/lib/data/types";
import type { ComposeInput } from "@/server/contracts";

/*
 * What the composer reads from the dataset beyond its contracts: the built
 * records by id and the organisation index the mappers of to-contracts.ts
 * take, built once per dataset. Distances run between gmina centroids (8.9),
 * as in src/lib/mock/implementations.ts.
 */

interface Indexes {
  records: Map<string, BuiltInnovation>;
  orgs: OrganisationIndex;
}

const cache = new WeakMap<Dataset, Indexes>();

export function indexesOf(dataset: Dataset): Indexes {
  let indexes = cache.get(dataset);
  if (!indexes) {
    indexes = {
      records: new Map(dataset.raw.records.map((record) => [record.id, record])),
      orgs: indexOrganisations(dataset.raw.organisations),
    };
    cache.set(dataset, indexes);
  }
  return indexes;
}

/** Great-circle distance in whole kilometres between two [lon, lat] points. */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}

/** The reader's gmina with a real centroid, or null (no place, or the register's [0, 0] fallback). */
export function originOf(dataset: Dataset, terc: string | null): Gmina | null {
  const gmina = terc ? dataset.gminaByTerc.get(terc) : undefined;
  if (!gmina || (gmina.centroid[0] === 0 && gmina.centroid[1] === 0)) return null;
  return gmina;
}

/** The ids the route shows: the top ids; for partial and none without them, the best assessments (S3). */
export function solutionIds(input: ComposeInput, dataset: Dataset): string[] {
  const { match } = input;
  const ids = match.top_ids.length > 0 || match.mode === "route" ? match.top_ids : match.assessments.map((item) => item.id);
  return [...new Set(ids)].filter((id) => dataset.innovationById.has(id)).slice(0, 3);
}

/**
 * The route's target groups: the reader's answer (FR-2.3), else the groups
 * stage 1 detected, else those of the best solution.
 */
export function routeTargetGroups(input: ComposeInput, dataset: Dataset, bestId: string | null): string[] {
  if (input.input.target_groups.length > 0) return input.input.target_groups;
  if (input.match.detected_target_groups.length > 0) return input.match.detected_target_groups;
  return bestId ? (dataset.innovationById.get(bestId)?.targetGroups ?? []) : [];
}
