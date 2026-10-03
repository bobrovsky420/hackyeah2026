import "server-only";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Route } from "@/lib/contracts/route";
import type { Dataset } from "@/lib/data/to-contracts";
import { estimateCostUsd } from "@/lib/llm/observability";
import type { Llm, LlmCall, LlmTask } from "@/lib/llm/types";
import type { Embed, StageLog } from "@/server/contracts";
import { retrieve } from "@/server/match/retrieve";
import { shortlistSchema, validateShortlist } from "@/server/match/shortlist";
import { PipelineUnavailableError, runPipeline } from "@/server/pipeline";
import { routeCacheHash, type RouteCache, type RouteCacheKey } from "@/server/route-cache";
import type { PlannedRun } from "./fairness";
import type { GeneratedString } from "./polish";
import type { Outcome, PeopleRole } from "./problems";
import type { Observation } from "./types";

/*
 * Runs planned problems through runPipeline with the real dataset, model
 * chain, embedding client and route cache, and turns each result into an
 * Observation. The pipeline returns the route and the stage logs only, so
 * the runner wraps three of its dependencies to see more, without touching
 * the pipeline:
 *
 * - the model: records the parsed stage 1 and stage 2 answers, so stage 1
 *   is validated here exactly as shortlist.ts does it; with a run id, it
 *   appends the id to the volatile part of every live prompt (13.2: the
 *   router answers repeated identical requests from its own cache);
 * - the embedding client: remembers each answer, so the retrieval the
 *   harness repeats to see the forty cards costs no second request and
 *   ranks exactly as the pipeline did;
 * - the route cache: learns the key the pipeline used, so a computed route
 *   leaves an evaluation record (.local/eval-cache/<hash>.json) with what
 *   the cached route cannot tell later: the forty cards, stage 1, the
 *   detected target groups and the stage logs of the computing run.
 */

export const EVAL_RECORD_DIR = path.join(process.cwd(), ".local", "eval-cache");

interface EvalRecord {
  version: 1;
  recordedAt: string;
  retrievedIds: string[];
  stage1Ids: string[] | null;
  detectedTargetGroups: string[] | null;
  reasonsGiven: number | null;
  stages: StageLog[];
}

function readRecord(dir: string, hash: string): EvalRecord | null {
  try {
    const record = JSON.parse(readFileSync(path.join(dir, `${hash}.json`), "utf8")) as EvalRecord;
    return record.version === 1 ? record : null;
  } catch {
    return null;
  }
}

function writeRecord(dir: string, hash: string, record: EvalRecord): void {
  try {
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${hash}.json`);
    writeFileSync(`${file}.tmp`, JSON.stringify(record));
    renameSync(`${file}.tmp`, file);
  } catch (error) {
    console.warn(`[eval] evaluation record not written: ${(error as Error).name}`);
  }
}

// ----------------------------------------------------------------- wrappers

interface Captured {
  task: LlmTask;
  parsed: unknown;
}

/** The model chain with a record of the parsed answers; `runTag` goes after the need, outside its tags. */
export function recordingLlm(base: Llm, runTag: string | null): { llm: Llm; captured: Captured[] } {
  const captured: Captured[] = [];
  const llm = (async <T>(call: LlmCall<T>) => {
    const tagged = runTag ? { ...call, user: `${call.user}\n\n[${runTag}]` } : call;
    const result = await base(tagged);
    captured.push({ task: call.task, parsed: result.parsed });
    return result;
  }) as Llm;
  return { llm, captured };
}

/** The embedding client with every answer (and failure) remembered by text and kind; keeps the client's `model`. */
export function memoEmbed(base: Embed): Embed {
  const answers = new Map<string, Promise<number[][]>>();
  const embed = (texts: string[], kind: "query" | "passage") => {
    const key = JSON.stringify([kind, texts]);
    let answer = answers.get(key);
    if (!answer) {
      answer = base(texts, kind);
      answers.set(key, answer);
    }
    return answer;
  };
  const model = (base as Partial<{ model: string }>).model;
  return model === undefined ? embed : Object.assign(embed, { model });
}

/** The cache as the pipeline sees it: `read` false never serves, `write` false never stores; the key is kept. */
function watchedCache(base: RouteCache, options: { read: boolean; write: boolean }) {
  const seen: { key: RouteCacheKey | null; stored: boolean } = { key: null, stored: false };
  const cache: RouteCache = {
    get(key) {
      seen.key = key;
      return options.read ? base.get(key) : null;
    },
    set(key, route) {
      seen.key = key;
      seen.stored = true;
      if (options.write) base.set(key, route);
    },
  };
  return { cache, seen };
}

// ----------------------------------------------------------------- the run

export interface RunnerDeps {
  llm: Llm;
  dataset: Dataset;
  embed: Embed;
  cache: RouteCache;
  runId: string;
  /** Read the route cache (the default of pnpm eval); false for --no-cache. */
  readCache: boolean;
  /** Write computed routes to the route cache (pnpm cache:warm, and pnpm eval without --no-cache). */
  writeCache: boolean;
  /** Skip the cache on the way in and refresh it (cache:warm --refresh), like "Policz ponownie". */
  bypassCache?: boolean;
  /** Append the run id to every live prompt (13.2). */
  tagPrompts: boolean;
  recordDir?: string;
}

const SCREENED: readonly string[] = ["redirected", "declined", "off_topic"];

export function outcomeOf(route: Route): Outcome {
  return SCREENED.includes(route.mode) ? (route.mode as Outcome) : "need";
}

export function peopleRolesOf(route: Route): PeopleRole[] {
  const roles: PeopleRole[] = [];
  const advisor = route.people.advisor;
  if (advisor && (advisor.email || advisor.phone)) roles.push("advisor");
  if (route.people.implementers_nearby.length > 0) roles.push("implementer_nearby");
  if (route.people.innovators.length > 0) roles.push("innovator");
  if (route.people.readiness.count > 0) roles.push("readiness");
  return roles;
}

/** Every string of a routed route that a model wrote (or a template stands in for). */
export function generatedStrings(route: Route): GeneratedString[] {
  if (outcomeOf(route) !== "need") return [];
  const strings: GeneratedString[] = [];
  const add = (field: string, text: string | null | undefined) => {
    if (text && text.trim()) strings.push({ field, text });
  };
  add("summary_pl", route.summary_pl);
  add("need_summary_pl", route.need_summary_pl);
  add("mode_reason_pl", route.mode_reason_pl);
  route.next_steps.forEach((step, i) => add(`next_steps.${i}`, step.text_pl));
  route.path.paths.forEach((item) => add(`path.${item.path_id}.why_pl`, item.why_pl));
  for (const solution of route.solutions) {
    solution.fit_reasons.forEach((reason, i) => add(`${solution.innovation_id}.fit_reasons.${i}.why_pl`, reason.why_pl));
    solution.gaps_pl.forEach((gap, i) => add(`${solution.innovation_id}.gaps_pl.${i}`, gap));
    add(`${solution.innovation_id}.adaptation_note_pl`, solution.adaptation_note_pl);
  }
  return strings;
}

export function stagesCost(stages: StageLog[]): number {
  return stages
    .filter((stage) => !stage.cached)
    .reduce(
      (sum, stage) =>
        sum + estimateCostUsd(stage.model, { inputTokens: stage.inputTokens, outputTokens: stage.outputTokens, cacheReadTokens: stage.cacheReadTokens }),
      0,
    );
}

/** One submission of a planned run; `client` is shared by the submissions of one problem (the repeat check of R12). */
export async function runOne(run: PlannedRun, client: string, deps: RunnerDeps, newId: () => string): Promise<Observation> {
  const { dataset } = deps;
  const gmina = run.placeTerc ? dataset.gminaByTerc.get(run.placeTerc) : undefined;
  const input = {
    role: run.role,
    placeTerc: run.placeTerc,
    placeName: gmina?.name ?? null,
    placeKind: gmina?.kind ?? null,
    targetGroups: run.problem.targetGroupsGiven,
  };
  const { llm, captured } = recordingLlm(deps.llm, deps.tagPrompts ? `ocena ${deps.runId}` : null);
  const embed = memoEmbed(deps.embed);
  const { cache, seen } = watchedCache(deps.cache, { read: deps.readCache, write: deps.writeCache });

  const empty: Observation = {
    problemId: run.problem.id,
    variant: run.variant,
    input,
    error: null,
    outcome: null,
    mode: null,
    clarificationNeeded: false,
    crisisBanner: false,
    redactions: 0,
    solutions: [],
    pathIds: [],
    peopleRoles: [],
    summary: null,
    generated: [],
    retrievedIds: null,
    retriever: null,
    stage1Ids: null,
    detectedTargetGroups: null,
    reasonsGiven: null,
    stages: [],
    recordedStages: null,
    cacheHit: false,
    totalMs: 0,
    costUsd: 0,
    recordedCostUsd: null,
  };

  let result;
  try {
    result = await runPipeline(
      {
        problemText: run.problem.text,
        placeTerc: run.placeTerc,
        role: run.role,
        targetGroups: run.problem.targetGroupsGiven,
        client,
        bypassCache: deps.bypassCache,
      },
      { llm, dataset, embed, cache, newId },
    );
  } catch (error) {
    const message = error instanceof PipelineUnavailableError ? error.message : `${(error as Error).name}: ${(error as Error).message}`;
    return { ...empty, error: message };
  }

  const route = result.route;
  const outcome = outcomeOf(route);
  const recordDir = deps.recordDir ?? EVAL_RECORD_DIR;
  const hash = seen.key ? routeCacheHash(seen.key) : null;
  const record = result.cacheHit && hash ? readRecord(recordDir, hash) : null;

  let retrievedIds: string[] | null = null;
  let retriever: Observation["retriever"] = null;
  if (outcome === "need" && route.input.problem_text !== null) {
    if (record) {
      retrievedIds = record.retrievedIds;
      const stage = record.stages.find((entry) => entry.stage === "retrieve");
      retriever = stage ? { provider: stage.provider, notes: stage.notes } : null;
    } else {
      // The same query as the pipeline's retriever; the memo answers it without a second request.
      const retrieval = await retrieve({ needText: route.input.problem_text, targetGroups: run.problem.targetGroupsGiven }, dataset, embed);
      retrievedIds = retrieval.ids;
      const stage = result.stages.find((entry) => entry.stage === "retrieve") ?? retrieval.stage;
      retriever = { provider: stage.provider, notes: stage.notes };
    }
  }

  let stage1Ids: string[] | null = record?.stage1Ids ?? null;
  let detected: string[] | null = record?.detectedTargetGroups ?? null;
  let reasonsGiven: number | null = record?.reasonsGiven ?? null;
  if (!result.cacheHit && outcome === "need") {
    const shortlist = [...captured].reverse().find((entry) => entry.task === "shortlist");
    const checked = shortlist ? shortlistSchema.safeParse(shortlist.parsed) : null;
    if (checked?.success && retrievedIds) {
      const valid = validateShortlist(checked.data, retrievedIds, dataset);
      stage1Ids = valid.candidates.map((candidate) => candidate.id);
      detected = valid.targetGroups;
    } else if (!shortlist) {
      // Stage 1 never ran: nothing retrieved, or the model failed before it.
      stage1Ids = [];
      detected = [];
    }
    const assess = [...captured].reverse().find((entry) => entry.task === "assess");
    const assessments = (assess?.parsed as { assessments?: { fit_reasons?: unknown[] }[] } | undefined)?.assessments;
    // No stage 2 answer (skipped, or failed into templates): no reason was given.
    reasonsGiven = Array.isArray(assessments)
      ? assessments.reduce((sum, item) => sum + (Array.isArray(item.fit_reasons) ? item.fit_reasons.length : 0), 0)
      : 0;
    if (seen.stored && hash && retrievedIds) {
      writeRecord(recordDir, hash, {
        version: 1,
        recordedAt: new Date().toISOString(),
        retrievedIds,
        stage1Ids,
        detectedTargetGroups: detected,
        reasonsGiven,
        stages: result.stages,
      });
    }
  }

  return {
    ...empty,
    outcome,
    mode: route.mode,
    clarificationNeeded: route.clarification_needed,
    crisisBanner: route.screening.crisis_banner,
    redactions: route.screening.redactions,
    solutions: route.solutions.map((solution) => ({ id: solution.innovation_id, fit: solution.fit_score })),
    pathIds: route.path.paths.map((item) => item.path_id),
    peopleRoles: peopleRolesOf(route),
    summary: route.summary_pl,
    generated: generatedStrings(route),
    retrievedIds,
    retriever,
    stage1Ids,
    detectedTargetGroups: detected,
    reasonsGiven,
    stages: result.stages,
    recordedStages: record?.stages ?? null,
    cacheHit: result.cacheHit,
    totalMs: route.engine.latency_ms,
    costUsd: stagesCost(result.stages),
    recordedCostUsd: record ? stagesCost(record.stages) : null,
  };
}

export interface RunAllOptions {
  concurrency: number;
  /** Called after each submission, for the progress line. */
  onResult?: (run: PlannedRun, observation: Observation) => void;
}

/**
 * Every planned run; the submissions of one problem (its base run and its
 * repeats) run in order from one client, the rest in parallel up to
 * `concurrency`. The results come back in the order of `runs`.
 */
export async function runAll(runs: readonly PlannedRun[], deps: RunnerDeps, options: RunAllOptions): Promise<Observation[]> {
  let ids = 0;
  const newId = () => `rt-${deps.runId}-${String(++ids).padStart(3, "0")}`;
  const clientOf = (run: PlannedRun) =>
    run.variant === "base" || run.variant.startsWith("repeat:") ? `eval-${deps.runId}-${run.problem.id}` : `eval-${deps.runId}-${run.problem.id}-${run.variant}`;

  const groups = new Map<string, number[]>();
  runs.forEach((run, index) => {
    const client = clientOf(run);
    groups.set(client, [...(groups.get(client) ?? []), index]);
  });
  const tasks = [...groups.entries()];
  const observations: Observation[] = new Array(runs.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const [client, indexes] = tasks[next++];
      for (const index of indexes) {
        const observation = await runOne(runs[index], client, deps, newId);
        observations[index] = observation;
        options.onResult?.(runs[index], observation);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency, tasks.length)) }, worker));
  return observations;
}
