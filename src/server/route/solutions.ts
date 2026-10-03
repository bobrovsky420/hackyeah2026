import type { Route, RouteSolution, Assessment } from "@/lib/contracts";
import { isShownMaterial, materialToKnowledgeLink, toContact, toMaterial, toWhatItTakes, type Dataset } from "@/lib/data/to-contracts";
import type { TargetGroup } from "@/lib/data/types";
import { fitLabel } from "@/lib/labels";
import { distanceKm, indexesOf, originOf } from "./data";

/*
 * The solutions block (FR-4.2) and the knowledge block (FR-4.3), assembled
 * from the data and the validated assessments; the model's only share is
 * the fit reasons and the adaptation note it wrote in stage 2.
 */

/** "Czego nie wiemy" names this radius (FR-4.6), and "Gdzie działa" and the implementers nearby use it. */
export const NEARBY_KM = 50;
/** Nearest implementations per solution and implementers nearby per route, as the prototype shows. */
export const MAX_NEAREST = 3;
/** Materials per solution in the knowledge block; the solution card keeps them all. */
export const MAX_MATERIALS_PER_SOLUTION = 5;

type Nearest = RouteSolution["where_it_runs"]["nearest"][number];

/** The known implementations of an innovation with their distance from the reader's gmina, nearest first. */
export function implementationsNear(dataset: Dataset, innovationId: string, placeTerc: string | null) {
  const origin = originOf(dataset, placeTerc);
  const located = dataset.locatedImplementations.filter((item) => item.innovation_id === innovationId);
  if (!origin) return { count: countOf(dataset, innovationId), near: [] };
  const near = located
    .map((item) => ({ item, distance_km: distanceKm(origin.centroid, item.centroid) }))
    .filter((entry) => entry.distance_km <= NEARBY_KM)
    .sort((a, b) => a.distance_km - b.distance_km || a.item.place_terc.localeCompare(b.item.place_terc));
  return { count: countOf(dataset, innovationId), near };
}

function countOf(dataset: Dataset, innovationId: string): number {
  return dataset.implementations.filter((item) => item.innovation_id === innovationId).length;
}

function placeName(dataset: Dataset, terc: string, name: string | null): string {
  return name ?? dataset.gminaByTerc.get(terc)?.name ?? terc;
}

export function whereItRuns(dataset: Dataset, innovationId: string, placeTerc: string | null): RouteSolution["where_it_runs"] {
  const { count, near } = implementationsNear(dataset, innovationId, placeTerc);
  const nearest: Nearest[] = [];
  for (const { item, distance_km } of near) {
    if (nearest.some((entry) => entry.terc === item.place_terc)) continue;
    nearest.push({ terc: item.place_terc, name: placeName(dataset, item.place_terc, item.place_name), distance_km });
    if (nearest.length === MAX_NEAREST) break;
  }
  return { count, nearest };
}

export function buildSolution(
  dataset: Dataset,
  assessment: Assessment,
  placeTerc: string | null,
): RouteSolution | null {
  const record = indexesOf(dataset).records.get(assessment.id);
  if (!record) return null;
  const { orgs } = indexesOf(dataset);
  return {
    innovation_id: record.id,
    fit_score: assessment.fit_score,
    fit_label_pl: fitLabel(assessment.fit_score),
    fit_reasons: assessment.fit_reasons.slice(0, 3),
    gaps_pl: assessment.gaps_pl,
    adaptation_note_pl: assessment.adaptation_note_pl,
    what_it_takes: toWhatItTakes(record),
    where_it_runs: whereItRuns(dataset, record.id, placeTerc),
    materials: record.materials.filter(isShownMaterial).map(toMaterial),
    contact: toContact(record, orgs),
  };
}

/**
 * FR-4.3: the materials of each solution, then the regional service model of
 * the route's target groups, then the items shown on every route (the ROPS
 * guide "ABC Diagnozy"). One entry per URL.
 */
export function buildKnowledge(dataset: Dataset, solutionIds: string[], targetGroups: string[]): Route["knowledge"] {
  const { records } = indexesOf(dataset);
  const links: Route["knowledge"] = [];
  const seen = new Set<string>();
  const add = (link: Route["knowledge"][number]) => {
    if (seen.has(link.url)) return;
    seen.add(link.url);
    links.push(link);
  };
  for (const id of solutionIds) {
    const materials = records.get(id)?.materials.filter(isShownMaterial) ?? [];
    for (const material of materials.slice(0, MAX_MATERIALS_PER_SOLUTION)) add(materialToKnowledgeLink(material, id));
  }
  for (const group of targetGroups) {
    for (const link of dataset.knowledge.byTargetGroup.get(group as TargetGroup) ?? []) add(link);
  }
  for (const link of dataset.knowledge.always) add(link);
  return links;
}
