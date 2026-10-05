import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Catalogue } from "@/lib/catalogue";
import type { AssistantSuggestion, DiagramStep, Embed, Idea } from "@/lib/contracts";
import { parseYaml, YamlError } from "@/lib/data/yaml";
import { warsawDay } from "@/lib/dates";
import { LlmError, type Llm, type LlmCall } from "@/lib/llm";
import { CONSTRAINT_CODES, isInstitution, isScale, type AdaptInput, type Constraint, type ServicePlan } from "@/lib/middleman";
import { exampleIdeas } from "@/server/db/examples";
import { ASSISTANT_BLOCKS, DIAGRAM_STEPS, developRun, inspireRun, showRun, templateDiagram } from "@/server/ideas/assistant";
import { servicePlan, templateParts } from "@/server/middleman";
import type { BannedWords } from "@/server/route/safety";
import { polishIssues } from "./polish";

/*
 * The evaluation of the model tasks beyond the route (specification 13.2,
 * decision A.17): the idea assistant's "Rozwiń pomysł" (develop), "Pokaż"
 * (show) and "Spójrz inaczej" (inspire), and the Middleman's service plan
 * (adapt). Their unit tests run on a fake model, which cannot tell whether
 * a prompt still works; these golden cases in tests/task-cases/ run against
 * the configured model before a prompt or a model changes. A case passes
 * when the model answered live, enough of its parts survived the checks
 * that drop invented names and numbers (each part kept is a part that
 * differs from the template), every kept text passes the Polish check of
 * the route harness, and the case's own expectations hold: words a part
 * must or must not carry, the funding paths a plan must or must not list.
 */

export const DEFAULT_TASK_CASES_DIR = path.join(process.cwd(), "tests", "task-cases");

export const EVAL_TASKS = ["adapt", "develop", "show", "inspire"] as const;
export type EvalTask = (typeof EVAL_TASKS)[number];

/** The parts of each task that `mentions` and `avoids` may name. */
export const TASK_PARTS: Record<EvalTask, readonly string[]> = {
  adapt: ["service", "first_role", "roles", "adaptations", "first_steps"],
  develop: ["suggestions"],
  inspire: ["suggestions"],
  show: DIAGRAM_STEPS,
};

/** How many parts must come from the model when a case does not say: of 4 for a plan, 5 for a diagram, the suggestions' count otherwise. */
export const KEPT_MIN: Record<EvalTask, number> = { adapt: 3, develop: 2, show: 3, inspire: 1 };

const expectSchema = z
  .object({
    kept_min: z.number().int().min(0).optional(),
    items_min: z.number().int().min(0).optional(),
    inspirations_min: z.number().int().min(0).optional(),
    blocks_any: z.array(z.string()).optional(),
    mentions: z.record(z.string(), z.string()).optional(),
    avoids: z.record(z.string(), z.string()).optional(),
    paths_exclude: z.array(z.string()).optional(),
    paths_any: z.array(z.string()).optional(),
  })
  .strict();

const ideaSchema = z
  .object({
    example: z.number().int().min(0).optional(),
    title: z.string().min(3).optional(),
    description: z.string().min(10).optional(),
    essence: z.string().optional(),
    for_whom: z.string().optional(),
    target_groups: z.array(z.string()).optional(),
    stage: z.enum(["pomysl", "prototyp", "test", "dziala"]).optional(),
    place_terc: z.string().nullable().optional(),
    similar: z.array(z.string()).optional(),
  })
  .strict();

const adaptSchema = z
  .object({
    institution: z.string(),
    place_terc: z.string().nullable().default(null),
    constraints: z.array(z.string()).default([]),
    scale: z.string(),
    target_group: z.string().nullable().default(null),
    note: z.string().nullable().default(null),
  })
  .strict();

const caseSchema = z
  .object({
    id: z.string().regex(/^[A-Z]\d{2}$/),
    task: z.enum(EVAL_TASKS),
    title: z.string().min(3),
    why: z.string().optional(),
    innovation: z.string().optional(),
    input: adaptSchema.optional(),
    idea: ideaSchema.optional(),
    expect: expectSchema.default({}),
  })
  .strict();

export type TaskCase = z.infer<typeof caseSchema> & { file: string; sha256: string };

export interface CaseIssue {
  file: string;
  message: string;
}

/** What the cases may refer to: the catalogue the server reads. */
export type CaseReferences = Pick<Catalogue, "innovationById" | "paths" | "gminaByTerc">;

function regexIssue(source: string): string | null {
  try {
    new RegExp(source, "iu");
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "invalid";
  }
}

/** Why a parsed case cannot run against these references; empty when it can. */
export function caseIssues(c: z.infer<typeof caseSchema>, refs: CaseReferences): string[] {
  const issues: string[] = [];
  const examples = exampleIdeas();
  if (c.task === "adapt") {
    if (!c.innovation || !c.input) return ["an adapt case needs `innovation` and `input`"];
    if (c.idea) issues.push("an adapt case takes no `idea`");
    const item = refs.innovationById.get(c.innovation);
    if (!item) issues.push(`unknown innovation ${c.innovation}`);
    if (!isInstitution(c.input.institution)) issues.push(`unknown institution ${c.input.institution}`);
    if (!isScale(c.input.scale)) issues.push(`unknown scale ${c.input.scale}`);
    for (const code of c.input.constraints) if (!(CONSTRAINT_CODES as readonly string[]).includes(code)) issues.push(`unknown constraint ${code}`);
    if (c.input.place_terc && !refs.gminaByTerc.has(c.input.place_terc)) issues.push(`unknown gmina ${c.input.place_terc}`);
    if (item && c.input.target_group && !item.targetGroups.includes(c.input.target_group)) issues.push(`the innovation does not serve ${c.input.target_group}`);
    const pathIds = new Set(refs.paths.map((p) => p.id));
    for (const id of [...(c.expect.paths_exclude ?? []), ...(c.expect.paths_any ?? [])]) if (!pathIds.has(id)) issues.push(`unknown path ${id}`);
  } else {
    if (!c.idea) return [`a ${c.task} case needs an \`idea\``];
    if (c.innovation || c.input) issues.push(`a ${c.task} case takes no \`innovation\` or \`input\``);
    if (c.idea.example !== undefined && !examples[c.idea.example]) issues.push(`no example idea ${c.idea.example}`);
    // The app computes a card's similar innovations before develop and inspire run; a case fixes them, so its sources do not move.
    const exampleSimilar = c.idea.example !== undefined ? examples[c.idea.example]?.similar : null;
    if ((c.task === "develop" || c.task === "inspire") && !c.idea.similar && !exampleSimilar) {
      issues.push("the card has no similar innovations, which the app computes before develop and inspire: give `similar`");
    }
    if (c.idea.example === undefined && !(c.idea.title && c.idea.description)) issues.push("an idea needs `example` or a `title` and a `description`");
    for (const id of c.idea.similar ?? []) if (!refs.innovationById.has(id)) issues.push(`unknown innovation ${id}`);
    if (c.idea.place_terc && !refs.gminaByTerc.has(c.idea.place_terc)) issues.push(`unknown gmina ${c.idea.place_terc}`);
    if (c.expect.paths_exclude || c.expect.paths_any) issues.push("paths are a plan's: only an adapt case checks them");
  }
  for (const block of c.expect.blocks_any ?? []) if (!(ASSISTANT_BLOCKS as readonly string[]).includes(block)) issues.push(`unknown block ${block}`);
  for (const [field, patterns] of [
    ["mentions", c.expect.mentions],
    ["avoids", c.expect.avoids],
  ] as const) {
    for (const [part, pattern] of Object.entries(patterns ?? {})) {
      if (!TASK_PARTS[c.task].includes(part)) issues.push(`${field}: ${c.task} has no part ${part}`);
      const problem = regexIssue(pattern);
      if (problem) issues.push(`${field}.${part}: ${problem}`);
    }
  }
  return issues;
}

/** The cases of a folder, each checked against the references; a case with an issue is left out and reported. */
export function loadTaskCases(dir: string, refs: CaseReferences): { cases: TaskCase[]; issues: CaseIssue[] } {
  const cases: TaskCase[] = [];
  const issues: CaseIssue[] = [];
  const files = readdirSync(dir)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort();
  for (const name of files) {
    const file = path.join(dir, name);
    const text = readFileSync(file, "utf8");
    let raw: unknown;
    try {
      raw = parseYaml(text);
    } catch (error) {
      issues.push({ file: name, message: error instanceof YamlError ? error.message : "not YAML" });
      continue;
    }
    const parsed = caseSchema.safeParse(raw);
    if (!parsed.success) {
      issues.push({ file: name, message: z.prettifyError(parsed.error) });
      continue;
    }
    if (`${parsed.data.id}.yaml` !== name) issues.push({ file: name, message: `the file of ${parsed.data.id} is ${parsed.data.id}.yaml` });
    const problems = caseIssues(parsed.data, refs);
    if (problems.length > 0) {
      issues.push(...problems.map((message) => ({ file: name, message })));
      continue;
    }
    if (cases.some((c) => c.id === parsed.data.id)) {
      issues.push({ file: name, message: `duplicate id ${parsed.data.id}` });
      continue;
    }
    cases.push({ ...parsed.data, file: name, sha256: createHash("sha256").update(text).digest("hex") });
  }
  return { cases, issues };
}

/** The idea of a case: an example card, or one written in the case on the frame of the first example. */
export function caseIdea(c: TaskCase): Idea {
  const spec = c.idea ?? {};
  const examples = exampleIdeas();
  const base = structuredClone(examples[spec.example ?? 0]);
  const similar = (ids: string[]) => ids.map((id) => ({ innovation_id: id, fit_score: 80, what_fits_pl: "", what_lacks_pl: "" }));
  if (spec.example !== undefined) return spec.similar ? { ...base, similar: similar(spec.similar) } : base;
  const idea: Idea = {
    ...base,
    id: `eval-${c.id.toLowerCase()}`,
    title: spec.title ?? base.title,
    description: spec.description ?? base.description,
    essence: spec.essence ?? "",
    for_whom: spec.for_whom ?? "",
    target_groups: spec.target_groups ?? [],
    stage: spec.stage ?? "pomysl",
    place_terc: spec.place_terc ?? null,
    similar: similar(spec.similar ?? []),
    assistant: undefined,
    extends: undefined,
    example: undefined,
  };
  delete idea.canvas;
  return idea;
}

// ------------------------------------------------------------- the run

export interface TaskDeps {
  llm: Llm;
  catalogue: Catalogue;
  banned: BannedWords;
  embed: Embed;
  now: () => Date;
  /** Set on live runs: after the user part, so repeated identical requests are not served from a host's cache (13.2). */
  runTag: string | null;
}

export interface TaskCall {
  task: string;
  provider: string;
  model: string;
  cached: boolean;
  latencyMs: number;
  /** The kind of the failure when the chain gave no answer (invalid_output: the model answered off the schema twice). */
  error?: string;
}

export interface TaskObservation {
  caseId: string;
  task: EvalTask;
  repeat: number;
  error: string | null;
  calls: TaskCall[];
  totalMs: number;
  source: "model" | "template";
  promptVersion: string | null;
  /** The parts the model proposed and the parts of the answer that come from it. */
  proposed: number;
  kept: number;
  /** The answer as a reader sees it, part by part. */
  texts: Record<string, string[]>;
  /** The texts of `texts` that the model wrote. */
  modelTexts: Record<string, string[]>;
  items: number;
  inspirations: number;
  blocks: string[];
  pathIds: string[];
  /** Why the checks dropped parts of the model's answer (the `*_dropped` log lines of the run), filled by the command. */
  dropped: string[];
}

/** The model chain with a record of every answer it gave the task, and of every call that got none. */
function recording(base: Llm, runTag: string | null): { llm: Llm; calls: TaskCall[]; parsed: unknown[] } {
  const calls: TaskCall[] = [];
  const parsed: unknown[] = [];
  const llm = (async <T>(call: LlmCall<T>) => {
    const started = performance.now();
    try {
      const result = await base(runTag ? { ...call, user: `${call.user}\n\n[${runTag}]` } : call);
      calls.push({ task: call.task, provider: result.provider, model: result.model, cached: result.cached, latencyMs: result.latencyMs });
      parsed.push(result.parsed);
      return result;
    } catch (error) {
      const failure = error instanceof LlmError ? error : null;
      calls.push({ task: call.task, provider: failure?.provider ?? "none", model: "", cached: false, latencyMs: Math.round(performance.now() - started), error: failure?.kind ?? "error" });
      throw error;
    }
  }) as Llm;
  return { llm, calls, parsed };
}

function suggestionParts(suggestions: AssistantSuggestion[]) {
  return {
    items: suggestions.length,
    inspirations: suggestions.filter((item) => item.kind === "inspiracja").length,
    blocks: [...new Set(suggestions.map((item) => item.block))],
    texts: { suggestions: suggestions.map((item) => item.text_pl) },
  };
}

function rawCount(parsed: unknown, key: string): number {
  const value = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>)[key] : undefined;
  return Array.isArray(value) ? value.length : 0;
}

function planTexts(plan: Pick<ServicePlan, "service" | "roles" | "adaptations" | "first_steps">): Record<string, string[]> {
  return {
    service: [plan.service],
    first_role: plan.roles.slice(0, 1),
    roles: plan.roles,
    adaptations: plan.adaptations.map((item) => item.text),
    first_steps: plan.first_steps,
  };
}

/** One run of one case against the model. */
export async function runTaskCase(c: TaskCase, deps: TaskDeps, repeat = 1): Promise<TaskObservation> {
  const started = performance.now();
  const { llm, calls, parsed } = recording(deps.llm, deps.runTag ? `${deps.runTag}-${c.id}-${repeat}` : null);
  const base: TaskObservation = {
    caseId: c.id,
    task: c.task,
    repeat,
    error: null,
    calls,
    totalMs: 0,
    source: "template",
    promptVersion: null,
    proposed: 0,
    kept: 0,
    texts: {},
    modelTexts: {},
    items: 0,
    inspirations: 0,
    blocks: [],
    pathIds: [],
    dropped: [],
  };
  const done = (observation: Partial<TaskObservation>): TaskObservation => ({ ...base, ...observation, totalMs: Math.round(performance.now() - started) });
  const assistantDeps = { llm, catalogue: deps.catalogue, banned: deps.banned, embed: deps.embed, engine: "live" as const, now: deps.now };
  try {
    if (c.task === "adapt") {
      const item = deps.catalogue.innovationById.get(c.innovation!)!;
      const input: AdaptInput = { ...c.input!, institution: c.input!.institution as AdaptInput["institution"], scale: c.input!.scale as AdaptInput["scale"], constraints: c.input!.constraints as Constraint[] };
      const plan = await servicePlan(item.id, input, { llm, catalogue: deps.catalogue, banned: deps.banned, engine: "live", today: () => warsawDay(deps.now().toISOString()) });
      if (!plan) return done({ error: "no plan" });
      const template = templateParts(item, input);
      const kept = {
        service: plan.service !== template.service,
        roles: JSON.stringify(plan.roles) !== JSON.stringify(template.roles),
        adaptations: plan.adaptations.some((row, index) => row.text !== template.adaptations[index]?.text),
        first_steps: JSON.stringify(plan.first_steps) !== JSON.stringify(template.first_steps),
      };
      const texts = planTexts(plan);
      const templateTexts = planTexts(template);
      const modelTexts = Object.fromEntries(Object.entries(texts).map(([part, list]) => [part, list.filter((text) => !templateTexts[part].includes(text))]));
      const byName = new Map(deps.catalogue.paths.map((p) => [p.name_pl, p.id]));
      return done({
        source: plan.source,
        promptVersion: plan.prompt_version,
        proposed: parsed.length > 0 ? 4 : 0,
        kept: Object.values(kept).filter(Boolean).length,
        texts,
        modelTexts,
        items: plan.adaptations.length,
        pathIds: plan.paths.flatMap((p) => byName.get(p.name) ?? []),
      });
    }
    const idea = caseIdea(c);
    if (c.task === "show") {
      const diagram = await showRun(idea, assistantDeps);
      const template = templateDiagram(idea);
      const keptSteps = DIAGRAM_STEPS.filter((step) => JSON.stringify(diagram.steps[step]) !== JSON.stringify(template[step]));
      return done({
        source: diagram.source,
        promptVersion: diagram.prompt_version,
        proposed: parsed.length > 0 ? DIAGRAM_STEPS.length : 0,
        kept: diagram.source === "model" ? keptSteps.length : 0,
        texts: Object.fromEntries(DIAGRAM_STEPS.map((step: DiagramStep) => [step, diagram.steps[step]])),
        modelTexts: Object.fromEntries(DIAGRAM_STEPS.map((step: DiagramStep) => [step, keptSteps.includes(step) ? diagram.steps[step] : []])),
        items: DIAGRAM_STEPS.filter((step) => diagram.steps[step].length > 0).length,
      });
    }
    const run = c.task === "develop" ? await developRun(idea, assistantDeps) : await inspireRun(idea, assistantDeps);
    const parts = suggestionParts(run.suggestions);
    return done({
      source: run.source,
      promptVersion: run.prompt_version,
      proposed: rawCount(parsed[0], "suggestions"),
      kept: run.source === "model" ? run.suggestions.length : 0,
      texts: parts.texts,
      modelTexts: run.source === "model" ? parts.texts : { suggestions: [] },
      items: parts.items,
      inspirations: parts.inspirations,
      blocks: parts.blocks,
    });
  } catch (error) {
    return done({ error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
  }
}

// ------------------------------------------------------------- the score

/** Why a run of a case fails; empty when it passes. */
export function scoreTaskCase(c: TaskCase, o: TaskObservation, banned?: BannedWords): string[] {
  if (o.error) return [`error: ${o.error}`];
  const failures: string[] = [];
  const live = o.calls.some((call) => !call.error && call.provider !== "replay" && !call.cached);
  const failed = o.calls.find((call) => call.error);
  if (!live) {
    failures.push(
      failed
        ? failed.error === "invalid_output"
          ? "no usable answer: the model answered off the schema, also after the repair round"
          : `no answer: the call failed (${failed.error})`
        : "no live answer: every call came from the recording",
    );
  }
  const keptMin = c.expect.kept_min ?? KEPT_MIN[c.task];
  if (o.kept < keptMin) failures.push(`kept ${o.kept} of ${o.proposed} parts from the model, expected at least ${keptMin}`);
  if (c.expect.items_min !== undefined && o.items < c.expect.items_min) failures.push(`${o.items} items, expected at least ${c.expect.items_min}`);
  if (c.expect.inspirations_min !== undefined && o.inspirations < c.expect.inspirations_min) failures.push(`${o.inspirations} inspirations, expected at least ${c.expect.inspirations_min}`);
  if (c.expect.blocks_any && !c.expect.blocks_any.some((block) => o.blocks.includes(block))) failures.push(`no suggestion about ${c.expect.blocks_any.join(", ")}`);
  for (const [part, pattern] of Object.entries(c.expect.mentions ?? {})) {
    const regex = new RegExp(pattern, "iu");
    if (!(o.texts[part] ?? []).some((text) => regex.test(text))) failures.push(`${part} does not mention /${pattern}/`);
  }
  for (const [part, pattern] of Object.entries(c.expect.avoids ?? {})) {
    const regex = new RegExp(pattern, "iu");
    const hit = (o.texts[part] ?? []).find((text) => regex.test(text));
    if (hit) failures.push(`${part} carries /${pattern}/: "${hit.slice(0, 120)}"`);
  }
  for (const id of c.expect.paths_exclude ?? []) if (o.pathIds.includes(id)) failures.push(`the plan lists the path ${id}`);
  if (c.expect.paths_any && !c.expect.paths_any.some((id) => o.pathIds.includes(id))) failures.push(`the plan lists none of ${c.expect.paths_any.join(", ")}`);
  for (const [part, texts] of Object.entries(o.modelTexts)) {
    for (const text of texts) for (const issue of polishIssues(text, banned)) failures.push(`polish ${part}: ${issue} in "${text.slice(0, 80)}"`);
  }
  return failures;
}
