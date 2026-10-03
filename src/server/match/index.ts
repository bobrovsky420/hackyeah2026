import type { MatchNeed, MatchResult } from "@/lib/contracts";
import { emit } from "@/lib/telemetry";
import { runAssess } from "./assess";
import type { ReaderContext } from "./context";
import { retrieve, type Retrieval } from "./retrieve";
import { runShortlist } from "./shortlist";

/*
 * The matching engine of 7.3: retrieve (FR-3.7), shortlist (FR-3.1),
 * assess (FR-3.2), each answer validated on the server (FR-3.4) and the
 * mode set by the thresholds (FR-3.3). Model errors propagate as LlmError
 * for the pipeline to handle (replay cache, the declined outcome); an
 * unreachable embedding service never does (lexical fallback). Stage 2 is
 * skipped when stage 1 leaves no candidate: the mode is then none. Each
 * result writes one `match` line to the request log: catalogue ids,
 * scores and the mode, never the need's text.
 */

export { createEmbedClient, EmbedError, type EmbedClient, type EmbedClientOptions } from "./embed";
export { ROUTE_MIN, PARTIAL_MIN, modeFor } from "./thresholds";

/** How many of the nearest cards the log keeps with their scores. */
const LOGGED_RETRIEVED = 15;

function logMatch(result: MatchResult, found: Retrieval) {
  const shortlisted = new Set(result.candidates.map((candidate) => candidate.id));
  emit("match", {
    mode: result.mode,
    retriever: found.stage.provider,
    retrieved_count: result.retrieved_ids.length,
    retrieved: result.retrieved_ids.slice(0, LOGGED_RETRIEVED).map((id, rank) => ({ id, rank: rank + 1, score: found.scores[rank] ?? null, shortlisted: shortlisted.has(id) })),
    candidates: result.candidates.map((candidate) => ({ id: candidate.id, prelim_fit: candidate.prelim_fit, retrieval_rank: result.retrieved_ids.indexOf(candidate.id) + 1 || null })),
    assessments: result.assessments.map((assessment) => ({ id: assessment.id, fit_score: assessment.fit_score, reasons: assessment.fit_reasons.length, gaps: assessment.gaps_pl.length })),
    top_ids: result.top_ids,
    detected_target_groups: result.detected_target_groups,
    detected_domains: result.detected_domains,
    clarification_needed: result.clarification_needed,
  });
}

export const matchNeed: MatchNeed = async (input, { llm, dataset, embed }) => {
  const reader: ReaderContext = { placeTerc: input.placeTerc, role: input.role, targetGroups: input.targetGroups };
  const found = await retrieve({ needText: input.needText, targetGroups: input.targetGroups }, dataset, embed);
  const stages = [found.stage];
  const finish = (result: MatchResult): MatchResult => {
    logMatch(result, found);
    return result;
  };

  const empty = (summary: string | null): MatchResult => ({
    mode: "none",
    mode_reason_pl: null,
    need_summary_pl: summary,
    detected_target_groups: [],
    detected_domains: [],
    retrieved_ids: found.ids,
    candidates: [],
    assessments: [],
    top_ids: [],
    clarification_needed: input.placeTerc === null && input.targetGroups.length === 0,
    stages,
  });
  if (found.ids.length === 0) return finish(empty(input.needSummary));

  const shortlist = await runShortlist(llm, dataset, reader, input.needText, found.ids);
  stages.push(shortlist.stage);
  // FR-2.3: "inne" names no group, so it does not count as one found.
  const namedGroups = shortlist.targetGroups.filter((group) => group !== "inne");
  const clarification = namedGroups.length === 0 && input.placeTerc === null && input.targetGroups.length === 0;
  const base = {
    need_summary_pl: shortlist.needSummary ?? input.needSummary,
    detected_target_groups: shortlist.targetGroups,
    detected_domains: shortlist.domains,
    retrieved_ids: found.ids,
    candidates: shortlist.candidates,
    clarification_needed: clarification,
  };
  if (shortlist.candidates.length === 0) {
    return finish({ ...base, mode: "none", mode_reason_pl: null, assessments: [], top_ids: [], stages });
  }

  const assessed = await runAssess(
    llm,
    dataset,
    reader,
    input.needText,
    shortlist.candidates.map((candidate) => candidate.id),
  );
  stages.push(assessed.stage);
  return finish({
    ...base,
    mode: assessed.mode,
    mode_reason_pl: assessed.modeReason,
    assessments: assessed.assessments,
    top_ids: assessed.topIds,
    stages,
  });
};
