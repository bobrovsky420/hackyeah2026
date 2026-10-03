import type { Readiness, Route } from "@/lib/contracts";
import type { Dataset } from "@/lib/data/to-contracts";
import type { TargetGroup } from "@/lib/data/types";
import { MAX_NEAREST, implementationsNear } from "./solutions";

/*
 * The people block (FR-4.4, FR-6.1 to FR-6.6), assembled by the server from
 * the data and the store; nothing here ever enters a prompt (FR-6.6). Only
 * public channels of organisations are shown, never a private person's.
 */

type People = Route["people"];

/** The advisor's category when neither the reader nor the matcher named a group: the row for every other group. */
export const DEFAULT_ADVISOR_CATEGORY: TargetGroup = "inne";

/**
 * Topics about children or dependent adults (FR-6.5): a readiness
 * registration is named on such a route only when it is an organisation.
 * Dependent adults are read broadly (older people and people with
 * disabilities), so the rule errs on the protective side; the lawyer
 * confirms the list.
 */
export const PROTECTED_TOPICS: ReadonlySet<string> = new Set<TargetGroup>([
  "dzieci-mlodziez-rodziny",
  "seniorzy",
  "ograniczona-mobilnosc",
  "niepelnosprawnosc-sensoryczna",
  "niepelnosprawnosc-intelektualna",
  "spektrum-autyzmu",
]);

/** One innovator per organisation, in the order of the solutions (the screen keys the rows by organisation). */
export function buildInnovators(dataset: Dataset, solutionIds: string[]): People["innovators"] {
  const innovators: People["innovators"] = [];
  for (const id of solutionIds) {
    const innovator = dataset.innovatorByInnovation.get(id);
    if (innovator && !innovators.some((item) => item.organisation === innovator.organisation)) innovators.push(innovator);
  }
  return innovators;
}

/**
 * Implementers of the route's solutions within NEARBY_KM of the reader's
 * gmina, nearest first (FR-4.4). An implementation without a named
 * organisation shows its place, as the prototype does.
 */
export function buildImplementersNearby(
  dataset: Dataset,
  solutionIds: string[],
  placeTerc: string | null,
): People["implementers_nearby"] {
  const rows: People["implementers_nearby"] = [];
  for (const id of solutionIds) {
    const innovation = dataset.innovationById.get(id);
    for (const { item, distance_km } of implementationsNear(dataset, id, placeTerc).near) {
      const place = item.place_name ?? dataset.gminaByTerc.get(item.place_terc)?.name ?? item.place_terc;
      rows.push({ organisation: item.organisation ?? innovation?.organisation ?? place, place_name: place, distance_km, innovation_id: id });
    }
  }
  const unique = rows
    .sort((a, b) => a.distance_km - b.distance_km)
    .filter((row, index, all) => all.findIndex((other) => other.organisation === row.organisation && other.innovation_id === row.innovation_id) === index);
  return unique.slice(0, MAX_NEAREST);
}

/** The ROPS advisor of the first route group that has one (FR-6.2), else the row for other groups. */
export function buildAdvisor(dataset: Dataset, targetGroups: string[]): People["advisor"] {
  for (const group of targetGroups) {
    const advisor = dataset.advisorByCategory.get(group as TargetGroup);
    if (advisor) return advisor;
  }
  const fallback = dataset.advisorByCategory.get(DEFAULT_ADVISOR_CATEGORY) ?? dataset.advisorByCategory.values().next().value;
  if (fallback) return fallback;
  const department = dataset.raw.advisors.department;
  return {
    category: DEFAULT_ADVISOR_CATEGORY,
    name: null,
    role: department.name_pl,
    email: department.email,
    phone: department.phones[0] ?? "",
  };
}

/**
 * Readiness to act for the route's gmina and topics (FR-6.5): every
 * registration not rejected counts at once; a name is shown only after ROPS
 * verified it and the person consented, and on a route about children or
 * dependent adults only organisations are named. The contact channel never
 * leaves the store. Without a place (all of Małopolska) every gmina counts;
 * without a topic every topic does.
 */
export function buildReadiness(
  registrations: readonly Readiness[],
  placeTerc: string | null,
  targetGroups: string[],
): People["readiness"] {
  const matching = registrations.filter(
    (entry) =>
      entry.verification.status !== "odrzucone" &&
      (placeTerc === null || entry.place_terc === placeTerc) &&
      (targetGroups.length === 0 || entry.topics.some((topic) => targetGroups.includes(topic))),
  );
  const names: string[] = [];
  for (const entry of matching) {
    if (entry.verification.status !== "zweryfikowane" || !entry.consent_display_name) continue;
    // The route's own groups, and without them the topics the entry is counted for.
    const topics = targetGroups.length > 0 ? targetGroups : entry.topics;
    if (!entry.is_organisation && topics.some((topic) => PROTECTED_TOPICS.has(topic))) continue;
    if (!names.includes(entry.display_name)) names.push(entry.display_name);
  }
  return { count: matching.length, names_with_consent: names };
}
