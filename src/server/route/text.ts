import { z } from "zod";
import type { Route, RouteMode, RouteSolution } from "@/lib/contracts/route";
import type { Dataset } from "@/lib/data/to-contracts";
import { t } from "@/lib/i18n";
import { applicantLabel, implementerLabels, targetGroupLabel, timeLabel } from "@/lib/labels";
import { toStageLog } from "@/lib/llm/observability";
import { loadPrompt } from "@/lib/llm/prompts";
import { LlmError, type Llm } from "@/lib/llm/types";
import type { StageLog } from "@/server/contracts";
import type { PathReasons, PathSelection, SelectedPath } from "./paths";
import { rejectReason, type BannedWords } from "./safety";

/*
 * The model's share of the route (FR-4.1, FR-4.6, 9.4): the summary
 * paragraph, the three next steps and "Dlaczego ta ścieżka" for the paths
 * the selection chose. The model receives facts and a list of references
 * (organisations, materials, paths, the advisor, the needs bank) and each
 * step must name one of them; the server turns the reference into the link.
 * A step with an unknown reference is dropped, a text that fails the checks
 * of safety.ts is replaced by its template, and templates fill the steps up
 * to three, so the route is complete with every model text blanked.
 */

export const STEP_COUNT = 3;
const MAX_SUMMARY_CHARS = 700;
const MAX_LINE_CHARS = 220;
const MIN_TEXT_CHARS = 8;

export const composeSchema = z.object({
  summary_pl: z.string(),
  next_steps: z.array(z.object({ ref: z.string(), text_pl: z.string() })),
  paths: z.array(z.object({ path_id: z.string(), why_pl: z.string() })),
});
export type ComposeOutput = z.infer<typeof composeSchema>;

export type RefKind = "material" | "innovator" | "path" | "knowledge" | "advisor" | "bank";

/** Something a next step may point to; the model sees `ref`, `kind` and `label`, never the link. */
export interface StepRef {
  ref: string;
  kind: RefKind;
  label: string;
  link: string;
  template: string;
}

export interface RouteParts {
  routeId: string;
  mode: Extract<RouteMode, "route" | "partial" | "none">;
  solutions: RouteSolution[];
  knowledge: Route["knowledge"];
  innovators: Route["people"]["innovators"];
  selection: PathSelection;
}

/** Materials per solution offered to the model as references. */
const MATERIAL_REFS_PER_SOLUTION = 2;

/**
 * The references of a route, in the prototype's link formats
 * (src/lib/mock/routes.ts): a material or knowledge item links its URL, an
 * innovator the contact form for its innovation, a path its card on the
 * route, the advisor the contact form of the route, the needs bank its form.
 */
export function buildRefs(dataset: Dataset, parts: RouteParts): StepRef[] {
  const refs: StepRef[] = [];
  const { routeId } = parts;
  let materials = 0;
  parts.solutions.forEach((solution, index) => {
    const title = dataset.innovationById.get(solution.innovation_id)?.title ?? "";
    for (const link of parts.knowledge.filter((item) => item.for_innovation_id === solution.innovation_id).slice(0, MATERIAL_REFS_PER_SOLUTION)) {
      materials += 1;
      refs.push({
        ref: `mat-${materials}`,
        kind: "material",
        label: `${link.title} (${title})`,
        link: link.url,
        template: t("compose.step.material", { title: link.title }),
      });
    }
    if (parts.innovators.some((item) => item.innovation_id === solution.innovation_id)) {
      const organisation = parts.innovators.find((item) => item.innovation_id === solution.innovation_id)?.organisation ?? "";
      refs.push({
        ref: `org-${index + 1}`,
        kind: "innovator",
        label: `${organisation} (${title})`,
        link: `/kontakt?innowacja=${solution.innovation_id}&droga=${routeId}`,
        template: t("compose.step.innovator", { title }),
      });
    }
  });
  parts.selection.paths.forEach(({ path }, index) => {
    refs.push({
      ref: `path-${index + 1}`,
      kind: "path",
      label: path.name_pl,
      link: `#sciezka-${path.id}`,
      template: t("compose.step.path", { name: path.name_pl }),
    });
  });
  parts.knowledge
    .filter((item) => item.for_innovation_id === null)
    .forEach((item, index) => {
      refs.push({
        ref: `know-${index + 1}`,
        kind: "knowledge",
        label: item.title,
        link: item.url,
        template: t("compose.step.knowledge", { title: item.title }),
      });
    });
  refs.push({
    ref: "advisor",
    kind: "advisor",
    label: t("compose.step.advisor"),
    link: `/kontakt?droga=${routeId}`,
    template: t("compose.step.advisor"),
  });
  if (parts.mode !== "route") {
    refs.push({
      ref: "bank",
      kind: "bank",
      label: t("compose.step.bank"),
      link: `/zapisz-potrzebe?droga=${routeId}`,
      template: t("compose.step.bank"),
    });
  }
  return refs;
}

/** The order in which templates fill the steps, as in the prototype's routes. */
const FILL_ORDER: Record<RouteParts["mode"], RefKind[]> = {
  route: ["material", "innovator", "path", "advisor", "knowledge"],
  partial: ["bank", "advisor", "path", "knowledge", "material", "innovator"],
  none: ["bank", "advisor", "path", "knowledge", "material", "innovator"],
};

/** Adds templated steps until there are three, one per kind first, in the mode's order. */
export function fillSteps(steps: Route["next_steps"], used: Set<string>, refs: StepRef[], mode: RouteParts["mode"]): number {
  let added = 0;
  const usedKinds = new Set(refs.filter((ref) => used.has(ref.ref)).map((ref) => ref.kind));
  const take = (ref: StepRef) => {
    if (steps.length >= STEP_COUNT || used.has(ref.ref) || steps.some((step) => step.text_pl === ref.template)) return;
    steps.push({ text_pl: ref.template, link: ref.link });
    used.add(ref.ref);
    usedKinds.add(ref.kind);
    added += 1;
  };
  for (const kind of FILL_ORDER[mode]) {
    if (usedKinds.has(kind)) continue;
    const ref = refs.find((item) => item.kind === kind && !used.has(item.ref));
    if (ref) take(ref);
  }
  for (const kind of FILL_ORDER[mode]) for (const ref of refs.filter((item) => item.kind === kind)) take(ref);
  return added;
}

/** "Dlaczego ta ścieżka" from the selection's reasons (templates of messages/pl.json). */
export function templatedWhy(selected: SelectedPath, applicantType: string): string {
  const { reasons } = selected;
  let first: string;
  if (reasons.createNew) first = t("compose.why.createNew");
  else if (reasons.vehicle) first = t("compose.why.vehicle");
  else if (reasons.targetGroup) {
    const group = targetGroupLabel(reasons.targetGroup);
    first = t("compose.why.targetGroup", { group: group.charAt(0).toLocaleLowerCase("pl") + group.slice(1) });
  } else if (reasons.deadlineSoon) first = t("compose.why.deadline");
  else if (reasons.rolling) first = t("compose.why.rolling");
  else if (reasons.regional) first = t("compose.why.regional");
  else first = t("path.chooser.why", { applicant: applicantLabel(applicantType) });
  return reasons.open ? first : `${first} ${t("compose.why.closed")}`;
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Why a model line cannot be used, or null. */
function lineProblem(text: string, max: number, banned?: BannedWords): string | null {
  if (text.length < MIN_TEXT_CHARS) return "too-short";
  if (text.length > max) return "too-long";
  return rejectReason(text, banned);
}

/**
 * A "Dlaczego ta ścieżka" that states the opposite of the selection's
 * flags (open or closed call, rolling, regional, closing soon), which the
 * model sees as booleans. Patterns on the Polish text, like the banned words.
 */
export function contradictsReasons(text: string, reasons: PathReasons): boolean {
  const lower = text.toLocaleLowerCase("pl");
  if (reasons.open && /zamknię/u.test(lower)) return true;
  if (!reasons.open && /nabór (jest )?(teraz )?otwart|otwarty nabór|nabór trwa/u.test(lower)) return true;
  if (!reasons.regional && /regionaln|dla małopolski/u.test(lower)) return true;
  if (!reasons.rolling && /dowolnym momencie|ciągł/u.test(lower)) return true;
  if (!reasons.deadlineSoon && /wkrótce|niedługo|zbliża się/u.test(lower)) return true;
  if (!reasons.targetGroup && /przeznaczon\S* (jest )?dla|tylko dla/u.test(lower)) return true;
  return false;
}

export interface ComposeFacts {
  mode: RouteParts["mode"];
  role: string | null;
  placeName: string | null;
  needSummary: string | null;
  needText: string | null;
  sensitiveTopics: string[];
  /** The crisis banner of S2 shows the helplines at the top of the page. */
  helplinesOnPage: boolean;
  targetGroups: string[];
}

/** The user part of the call: facts as JSON, the need text last inside <potrzeba> tags (9.3). No amounts, deadlines, readiness or contact data (FR-8.5, FR-6.6). */
export function buildUserPart(dataset: Dataset, facts: ComposeFacts, parts: RouteParts, refs: StepRef[]): string {
  const data = {
    mode: facts.mode,
    role: facts.role,
    place: facts.placeName,
    need_summary: facts.needSummary,
    sensitive_topics: facts.sensitiveTopics,
    helplines_on_page: facts.helplinesOnPage,
    target_groups: facts.targetGroups.map(targetGroupLabel),
    solutions: parts.solutions.map((solution) => {
      const innovation = dataset.innovationById.get(solution.innovation_id);
      return {
        title: innovation?.title ?? "",
        organisation: solution.contact.organisation,
        fit_score: solution.fit_score,
        reasons: solution.fit_reasons.map((reason) => reason.why_pl),
        gaps: solution.gaps_pl,
        adaptation_note: solution.adaptation_note_pl,
        implementers: implementerLabels(solution.what_it_takes.implementer_types),
        cost_band: solution.what_it_takes.cost_band,
        time: timeLabel(solution.what_it_takes.time_to_implement),
        runs_within_50_km: solution.where_it_runs.nearest.length > 0,
      };
    }),
    paths: parts.selection.paths.map(({ path, reasons }) => ({
      path_id: path.id,
      name: path.name_pl,
      for_target_group: reasons.targetGroup ? targetGroupLabel(reasons.targetGroup) : null,
      rolling: reasons.rolling,
      call_open: reasons.open,
      closes_soon: reasons.deadlineSoon,
      regional: reasons.regional,
      gmina_vehicle_without_grant: reasons.vehicle,
      for_new_solutions: reasons.createNew,
    })),
    refs: refs.map(({ ref, kind, label }) => ({ ref, kind, label })),
  };
  const need = (facts.needText ?? "").replace(/[<>]/g, " ").trim();
  return `${JSON.stringify(data, null, 1)}\n<potrzeba>\n${need}\n</potrzeba>`;
}

export interface ComposedText {
  summary_pl: string | null;
  next_steps: Route["next_steps"];
  whyByPath: Map<string, string>;
  stage: StageLog | null;
}

/** Applies the server's checks to the model's output (or to nothing) and fills in the templates. */
export function finishText(
  output: ComposeOutput | null,
  refs: StepRef[],
  parts: RouteParts,
  banned?: BannedWords,
): { summary: string | null; steps: Route["next_steps"]; why: Map<string, string>; droppedIds: string[]; notes: string[] } {
  const notes: string[] = [];
  const droppedIds: string[] = [];
  const byRef = new Map(refs.map((ref) => [ref.ref, ref]));

  let summary: string | null = null;
  if (output) {
    const text = clean(output.summary_pl);
    const problem = text ? lineProblem(text, MAX_SUMMARY_CHARS, banned) : "empty";
    if (problem) notes.push(`summary dropped: ${problem}`);
    else summary = text;
  }

  const steps: Route["next_steps"] = [];
  const used = new Set<string>();
  for (const [index, step] of (output?.next_steps ?? []).entries()) {
    const ref = byRef.get(step.ref.trim());
    if (!ref) {
      droppedIds.push(step.ref);
      notes.push(`step ${index + 1} dropped: unknown ref`);
      continue;
    }
    if (used.has(ref.ref) || steps.length >= STEP_COUNT) {
      notes.push(`step ${index + 1} dropped: ${used.has(ref.ref) ? "repeated ref" : "more than three"}`);
      continue;
    }
    const text = clean(step.text_pl);
    const problem = lineProblem(text, MAX_LINE_CHARS, banned);
    if (problem) notes.push(`step ${index + 1} templated: ${problem}`);
    const final = problem ? ref.template : text;
    if (steps.some((item) => item.text_pl === final)) continue;
    steps.push({ text_pl: final, link: ref.link });
    used.add(ref.ref);
  }
  const filled = fillSteps(steps, used, refs, parts.mode);
  if (filled > 0) notes.push(`steps filled from templates: ${filled}`);

  const why = new Map<string, string>();
  const chosen = new Map(parts.selection.paths.map((item) => [item.path.id, item]));
  for (const item of output?.paths ?? []) {
    if (!chosen.has(item.path_id)) {
      droppedIds.push(item.path_id);
      continue;
    }
    const text = clean(item.why_pl);
    const problem =
      lineProblem(text, MAX_LINE_CHARS, banned) ?? (contradictsReasons(text, chosen.get(item.path_id)!.reasons) ? "contradicts-selection" : null);
    if (problem) notes.push(`why ${item.path_id} templated: ${problem}`);
    else if (!why.has(item.path_id)) why.set(item.path_id, text);
  }
  for (const [id, item] of chosen) if (!why.has(id)) why.set(id, templatedWhy(item, parts.selection.applicantType));

  return { summary, steps, why, droppedIds, notes };
}

const EFFORT = "high";
const MAX_TOKENS = 4000;

/** Calls the model once; any failure leaves the templates (FR-4.1) and is recorded in the stage. */
export async function composeText(
  llm: Llm,
  dataset: Dataset,
  facts: ComposeFacts,
  parts: RouteParts,
): Promise<ComposedText> {
  const refs = buildRefs(dataset, parts);
  const prompt = loadPrompt("compose");
  const started = Date.now();
  let output: ComposeOutput | null = null;
  let stage: StageLog;
  try {
    const result = await llm({
      task: "compose",
      system: prompt.body,
      promptVersion: prompt.version,
      user: buildUserPart(dataset, facts, parts, refs),
      schema: composeSchema,
      effort: EFFORT,
      maxTokens: MAX_TOKENS,
    });
    output = result.parsed;
    stage = toStageLog("compose", result);
  } catch (error) {
    const kind = error instanceof LlmError ? error.kind : "error";
    stage = {
      stage: "compose",
      provider: error instanceof LlmError ? (error.provider ?? "none") : "none",
      model: "",
      promptVersion: prompt.version,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      latencyMs: Date.now() - started,
      cached: false,
      droppedIds: [],
      droppedReasons: 0,
      notes: [`model failed (${kind}): templates used`],
    };
  }
  const finished = finishText(output, refs, parts);
  stage.droppedIds.push(...finished.droppedIds);
  stage.notes.push(...finished.notes);
  // FR-12.10: where a sensitive topic appears, the summary points to the helplines of the banner.
  const helplines = t("compose.summary.helplines");
  const summary =
    finished.summary && facts.helplinesOnPage && !finished.summary.includes(helplines) ? `${finished.summary} ${helplines}` : finished.summary;
  return { summary_pl: summary, next_steps: finished.steps, whyByPath: finished.why, stage };
}
