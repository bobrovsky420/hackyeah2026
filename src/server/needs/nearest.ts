import type { Need, Route, Assessment, Embed, MatchNeed, MatchResult, StageLog } from "@/lib/contracts";
import type { Dataset } from "@/lib/data/to-contracts";
import { t } from "@/lib/i18n";
import { LlmError, type Llm, type LlmErrorKind } from "@/lib/llm/types";
import { matchNeed } from "@/server/match";
import { clean } from "./checks";

/*
 * The duplicate check of FR-5.3: the nearest catalogue matches of a need,
 * each with "co pasuje" and "czego brakuje" taken from the validated
 * assessment of stage 2 (the grounded fit reasons and the gaps), never from
 * new free text. A need saved from a route reuses that route's result, so
 * no second model run happens; only a need typed straight into the needs
 * bank runs the matcher.
 */

/** Matches per need, as the brief and S3 show them. */
export const MAX_NEAREST = 3;
/** Fit reasons joined into "co pasuje". */
const MAX_FIT_REASONS = 2;

type NearestMatch = Need["nearest_matches"][number];

/** A route's solutions as the assessments they were built from (FR-4.2 keeps reasons and gaps unchanged). */
export function assessmentsFromRoute(route: Route): Assessment[] {
  return route.solutions.map((solution) => ({
    id: solution.innovation_id,
    fit_score: solution.fit_score,
    fit_reasons: solution.fit_reasons,
    gaps_pl: solution.gaps_pl,
    adaptation_note_pl: solution.adaptation_note_pl,
  }));
}

/** The best assessments as nearest matches; unknown ids and assessments without a reason are left out. */
export function toNearestMatches(assessments: Assessment[], dataset: Pick<Dataset, "innovationById">): NearestMatch[] {
  return [...assessments]
    .filter((item) => dataset.innovationById.has(item.id) && item.fit_reasons.length > 0)
    .sort((a, b) => b.fit_score - a.fit_score)
    .slice(0, MAX_NEAREST)
    .map((item) => {
      const gaps = item.gaps_pl.map(clean).filter(Boolean);
      return {
        innovation_id: item.id,
        fit_score: item.fit_score,
        what_fits_pl: item.fit_reasons
          .slice(0, MAX_FIT_REASONS)
          .map((reason) => clean(reason.why_pl))
          .join(" "),
        what_lacks_pl: gaps.length > 0 ? gaps.join(" ") : t("brief.existing.lacksNone"),
      };
    });
}

/** Modes of a stored route that went through the matcher; a screened route did not. */
const MATCHED_MODES = new Set<Route["mode"]>(["route", "partial", "none"]);

/** The nearest matches of a route's assessments, or null for a screened route. No model call. */
export function nearestFromRoute(route: Route, data: Pick<Dataset, "innovationById">): NearestMatch[] | null {
  return MATCHED_MODES.has(route.mode) ? toNearestMatches(assessmentsFromRoute(route), data) : null;
}

export interface NearestDeps {
  llm: Llm;
  dataset: Dataset;
  embed: Embed;
  /** The matcher of src/server/match unless given; tests pass a fake. */
  matchNeed?: MatchNeed;
  /** The result of the route the need came from, when the caller still holds it. */
  match?: MatchResult | null;
  /** The stored route the need came from (FR-5.1): its solutions carry the assessments. */
  route?: Route | null;
}

export interface NearestResult {
  matches: NearestMatch[];
  /** Where the assessments came from: a given result, the stored route, or a matcher run for this need. */
  source: "match" | "route" | "matcher";
  /** The matcher's stages when it ran; empty otherwise. */
  stages: StageLog[];
  /** Set when the matcher ran and the model failed: the need keeps no matches, the brief says so. */
  failed: LlmErrorKind | null;
}

export async function nearestMatches(need: Need, deps: NearestDeps): Promise<NearestResult> {
  if (deps.match) {
    return { matches: toNearestMatches(deps.match.assessments, deps.dataset), source: "match", stages: [], failed: null };
  }
  const fromRoute = deps.route ? nearestFromRoute(deps.route, deps.dataset) : null;
  if (fromRoute) return { matches: fromRoute, source: "route", stages: [], failed: null };
  try {
    // The stored text went through the gate when the need was saved (FR-12.4); reporter fields never enter (FR-6.6).
    const run = deps.matchNeed ?? matchNeed;
    const result = await run(
      {
        needText: need.problem_text,
        needSummary: need.summary_pl,
        placeTerc: need.place_terc,
        role: need.role,
        targetGroups: need.target_groups,
      },
      { llm: deps.llm, dataset: deps.dataset, embed: deps.embed },
    );
    return { matches: toNearestMatches(result.assessments, deps.dataset), source: "matcher", stages: result.stages, failed: null };
  } catch (error) {
    if (!(error instanceof LlmError)) throw error;
    return { matches: [], source: "matcher", stages: [], failed: error.kind };
  }
}
