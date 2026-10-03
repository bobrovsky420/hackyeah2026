import type { Route, RouteSolution, ComposeInput, ComposeRoute, StageLog } from "@/lib/contracts";
import type { Dataset } from "@/lib/data/to-contracts";
import { t } from "@/lib/i18n";
import { applicantLabel } from "@/lib/labels";
import { indexesOf, originOf, routeTargetGroups, solutionIds } from "./data";
import { buildAdvisor, buildImplementersNearby, buildInnovators, buildReadiness } from "./people";
import { selectPaths, type PathSelection } from "./paths";
import { screeningOf } from "./screened";
import { NEARBY_KM, buildKnowledge, buildSolution } from "./solutions";
import { buildRefs, composeText, finishText, type ComposedText, type RouteParts } from "./text";

/*
 * The route composer (7.4): assembles schema 8.4 on the server from the
 * assessments (solutions), the materials and the knowledge file (knowledge),
 * the data and the readiness registry passed in (people), the path
 * selection (path), and the one model call that writes the summary, the
 * three next steps and the paths' "Dlaczego ta ścieżka" (FR-4.1). Every
 * model text has a template or may be blank, so a failed call still gives
 * a complete route.
 */

export { buildScreenedRoute, referenceCode } from "./screened";
export { selectPaths, applicantTypesForRole } from "./paths";

/** At most this many lines of "Czego nie wiemy". */
const MAX_UNKNOWNS = 5;

function unknowns(
  dataset: Dataset,
  input: ComposeInput,
  solutions: RouteSolution[],
  nearby: Route["people"]["implementers_nearby"],
  selection: PathSelection,
): string[] {
  const lines: string[] = [];
  const titleOf = (id: string) => dataset.innovationById.get(id)?.title ?? id;
  if (solutions.length === 0) lines.push(t("route.unknowns.noSolutions"));
  else if (!originOf(dataset, input.input.place_terc)) lines.push(t("route.unknowns.noPlace"));
  else if (nearby.length === 0) lines.push(t("route.unknowns.noNearby", { km: NEARBY_KM }));
  if (input.input.target_groups.length === 0 && input.match.detected_target_groups.length === 0) {
    lines.push(t("route.unknowns.targetGroup"));
  }
  for (const solution of solutions) {
    if (solution.what_it_takes.cost_band === "unknown") {
      lines.push(t("route.unknowns.cost", { title: titleOf(solution.innovation_id) }));
    }
    if (solution.contact.channels.length === 0) {
      lines.push(t("route.unknowns.contact", { title: titleOf(solution.innovation_id) }));
    }
  }
  if (selection.paths.length === 0) {
    lines.push(t("route.unknowns.noPath", { applicant: applicantLabel(selection.applicantType) }));
  } else if (selection.paths.every((item) => !item.reasons.open)) {
    lines.push(t("route.unknowns.pathsClosed"));
  }
  return lines.slice(0, MAX_UNKNOWNS);
}

function distinct(values: (string | null | undefined)[]): string {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].join("+");
}

/** Route.engine from the stages of the gate, the matcher and the composer; the pipeline overwrites latency and cached. */
export function engineOf(dataset: Dataset, stages: StageLog[]): Route["engine"] {
  const modelStages = stages.filter((stage) => stage.promptVersion !== null && stage.model !== "");
  return {
    provider: distinct(modelStages.map((stage) => stage.provider)) || "rules",
    model: distinct(modelStages.map((stage) => stage.model)),
    prompt_version: distinct(stages.map((stage) => stage.promptVersion)),
    data_version: dataset.version,
    latency_ms: stages.reduce((sum, stage) => sum + stage.latencyMs, 0),
    cached: modelStages.length > 0 && modelStages.every((stage) => stage.cached),
  };
}

export const composeRoute: ComposeRoute = async (input, { llm, dataset, today, readiness }) => {
  const { match, gate } = input;
  const mode = match.mode;
  const place = input.input.place_terc;

  const assessments = new Map(match.assessments.map((item) => [item.id, item]));
  const solutions = solutionIds(input, dataset)
    .flatMap((id) => assessments.get(id) ?? [])
    .map((assessment) => buildSolution(dataset, assessment, place))
    .filter((solution): solution is RouteSolution => solution !== null);
  const ids = solutions.map((solution) => solution.innovation_id);
  const bestRecord = ids.length > 0 ? indexesOf(dataset).records.get(ids[0]) : undefined;
  const groups = routeTargetGroups(input, dataset, ids[0] ?? null);

  const knowledge = buildKnowledge(dataset, ids, groups);
  const innovators = buildInnovators(dataset, ids);
  const nearby = buildImplementersNearby(dataset, ids, place);
  const selection = selectPaths(dataset.raw.paths, {
    role: input.input.role,
    today,
    placeTerc: place,
    targetGroups: groups,
    mode,
    best: bestRecord
      ? {
          costBand: bestRecord.derived.cost_band,
          implementerTypes: bestRecord.derived.implementer_types,
          evidenceLevel: bestRecord.derived.evidence_level,
        }
      : null,
  });

  const parts: RouteParts = { routeId: input.routeId, mode, solutions, knowledge, innovators, selection };
  let text: ComposedText;
  if (solutions.length === 0) {
    // Nothing for the model to summarise: the templates alone (S3 with no candidate).
    const finished = finishText(null, buildRefs(dataset, parts), parts);
    text = { summary_pl: null, next_steps: finished.steps, whyByPath: finished.why, stage: null };
  } else {
    text = await composeText(
      llm,
      dataset,
      {
        mode,
        role: input.input.role,
        placeName: input.input.place_name,
        needSummary: match.need_summary_pl ?? gate.screening.need_summary_pl,
        needText: input.input.problem_text,
        sensitiveTopics: gate.screening.sensitive_topics,
        helplinesOnPage: gate.screening.crisis_banner,
        targetGroups: groups,
      },
      parts,
    );
  }

  const route: Route = {
    id: input.routeId,
    created_at: input.createdAt,
    input: input.input,
    mode,
    need_summary_pl: match.need_summary_pl ?? gate.screening.need_summary_pl,
    mode_reason_pl: match.mode_reason_pl,
    screening: screeningOf(gate),
    clarification_needed: match.clarification_needed,
    summary_pl: text.summary_pl,
    solutions,
    knowledge,
    people: {
      innovators,
      implementers_nearby: nearby,
      advisor: buildAdvisor(dataset, groups),
      // Counted and named by the server only; registrations never reach a prompt (FR-6.6).
      readiness: buildReadiness(readiness, place, groups),
    },
    path: {
      applicant_type: selection.applicantType,
      cost_band: selection.costBand,
      paths: selection.paths.map(({ path }) => ({ path_id: path.id, why_pl: text.whyByPath.get(path.id) ?? "" })),
    },
    next_steps: text.next_steps,
    unknowns_pl: unknowns(dataset, input, solutions, nearby, selection),
    engine: engineOf(dataset, [...(gate.stage ? [gate.stage] : []), ...match.stages, ...(text.stage ? [text.stage] : [])]),
    label_pl: t("route.generated.label"),
    reference_code: null,
  };
  return { route, stage: text.stage };
};
