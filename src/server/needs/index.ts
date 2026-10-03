import "server-only";

/*
 * The model side of the needs bank and the incubator brief (7.5): the
 * duplicate check with the nearest catalogue matches (FR-5.3), the brief's
 * prose (FR-5.5), the clustering of open needs (FR-5.4) and the public view
 * of approved needs (FR-5.6). Pure modules: storage and the handlers call
 * them with their dependencies.
 */

export { nearestMatches, nearestFromRoute, toNearestMatches, assessmentsFromRoute, MAX_NEAREST, type NearestDeps, type NearestResult } from "./nearest";
export { generateBrief, withNearestMatches, type BriefDeps, type GeneratedBrief, type BriefProsePart } from "./brief";
export { briefSections, sectionsToMarkdown, BRIEF_SECTION_KEYS, type BriefSection, type BriefSectionKey } from "./sections";
export { clusterNeeds, clusterable, clusterId, type ClusterResult, type ClusterDraft } from "./cluster";
export { openNeeds, isPublishable, type OpenNeed, type OpenNeedsFilter } from "./open";
export {
  briefForNeed,
  clusterOpenNeeds,
  nearestForNewNeed,
  openNeedsView,
  storedBrief,
  type ClusterRun,
  type NeedsDeps,
  type OpenNeedView,
} from "./service";
export { savedNeedSummary } from "./save";
