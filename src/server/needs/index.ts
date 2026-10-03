
/*
 * The model side of the needs bank and the incubator brief (7.5): the
 * duplicate check with the nearest catalogue matches (FR-5.3) and the
 * brief's prose (FR-5.5). Pure modules: storage and the handlers call them
 * with their dependencies.
 */

export { nearestMatches, nearestFromRoute, toNearestMatches, assessmentsFromRoute, MAX_NEAREST, type NearestDeps, type NearestResult } from "./nearest";
export { generateBrief, withNearestMatches, type BriefDeps, type GeneratedBrief, type BriefProsePart } from "./brief";
export { briefSections, sectionsToMarkdown, BRIEF_SECTION_KEYS, type BriefSection, type BriefSectionKey } from "./sections";
export { briefForNeed, nearestForNewNeed, storedBrief, type NeedsDeps } from "./service";
export { savedNeedSummary } from "./save";
