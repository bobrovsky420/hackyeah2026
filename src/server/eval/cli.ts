import { randomBytes } from "node:crypto";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDataset } from "@/lib/data/load";
import { describeLlm, getLlm, loadPrompt } from "@/lib/llm";
import { llmProvider } from "@/lib/env";
import { createEmbedClient } from "@/server/match";
import { createFileRouteCache } from "@/server/route-cache";
import type { EvalArgs } from "./args";
import { comparePair, perTargetGroup, planRuns, type PlannedRun } from "./fairness";
import { DEFAULT_PROBLEMS_DIR, loadProblems } from "./problems";
import { reportJson, reportMarkdown, type ReportData } from "./report";
import { runAll } from "./runner";
import { scoreRun } from "./score";
import { summarise } from "./summary";
import type { Observation } from "./types";

/*
 * The two commands of 9.6 on top of the harness modules: `pnpm eval`
 * (load, plan, run, score, summarise, write the report, exit code) and
 * `pnpm cache:warm` (run every problem once through the file route cache
 * and the per-call recording, report hits and misses). The scripts in
 * scripts/ set LLM_PROVIDER before this module loads the model chain.
 */

const TASKS = ["screen", "shortlist", "assess", "compose"] as const;

function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
}

function progress(run: PlannedRun, observation: Observation, verdict?: boolean): void {
  const got = observation.error ? `error (${observation.error})` : observation.outcome === "need" ? `${observation.mode}${observation.clarificationNeeded ? "+clarification" : ""}` : observation.outcome;
  const solutions = observation.solutions.map((solution) => `${solution.id}:${solution.fit}`).join(" ");
  const verdictText = verdict === undefined ? "" : verdict ? " pass" : " FAIL";
  process.stdout.write(
    `${run.problem.id.padEnd(4)} ${run.variant.padEnd(22)} ${String(got).padEnd(12)} ${(observation.totalMs / 1000).toFixed(1).padStart(5)} s ${observation.cacheHit ? "hit " : "miss"}${verdictText}  ${solutions}\n`,
  );
}

async function probeEmbedding(embed: ReturnType<typeof createEmbedClient>): Promise<boolean> {
  try {
    await embed(["sprawdzenie"], "query");
    return true;
  } catch {
    return false;
  }
}

async function setup(args: EvalArgs) {
  if (!args.verbose) console.info = () => undefined;
  const dataset = getDataset();
  const references = {
    innovationIds: new Set(dataset.innovationById.keys()),
    targetGroups: new Set<string>(dataset.raw.taxonomies.target_groups.map((group) => group.code)),
    pathIds: new Set(dataset.pathById.keys()),
    tercs: new Set(dataset.gminaByTerc.keys()),
  };
  const loaded = loadProblems(args.problemsDir, references);
  const problems = args.only.length ? loaded.problems.filter((problem) => args.only.includes(problem.id)) : loaded.problems;
  const unknown = args.only.filter((id) => !loaded.problems.some((problem) => problem.id === id));
  if (unknown.length) process.stderr.write(`--only: no valid problem ${unknown.join(", ")}\n`);
  const embed = createEmbedClient();
  const embeddingReachable = await probeEmbedding(embed);
  if (!embeddingReachable) process.stderr.write("The embedding service is not reachable: the retriever falls back to the lexical scorer.\n");
  const llm = getLlm();
  const described = describeLlm();
  return { dataset, loaded, problems, embed, embeddingReachable, llm, described };
}

export async function evalMain(args: EvalArgs): Promise<number> {
  const started = new Date();
  const runId = `${stamp(started).slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex")}`;
  const { dataset, loaded, problems, embed, embeddingReachable, llm, described } = await setup(args);
  for (const issue of loaded.issues) process.stderr.write(`${issue.file}${issue.field ? ` ${issue.field}` : ""}: ${issue.message}\n`);

  const head = llmProvider();
  const tagPrompts = args.runTag && head !== "replay";
  const plan = planRuns(problems, { fairnessAll: args.fairnessAll, placeKind: (terc) => dataset.gminaByTerc.get(terc)?.kind ?? null });
  process.stdout.write(`pnpm eval: ${problems.length} problems, ${plan.runs.length} runs, provider ${head}, route cache ${args.noCache ? "bypassed" : "read"}\n`);

  const observations = await runAll(
    plan.runs,
    {
      llm,
      dataset,
      embed,
      cache: createFileRouteCache(),
      runId,
      readCache: !args.noCache,
      writeCache: !args.noCache,
      tagPrompts,
    },
    {
      concurrency: args.concurrency,
      onResult: (run, observation) => {
        progress(run, observation, run.derived ? undefined : scoreRun(run.problem, observation).pass);
      },
    },
  );

  const results = plan.runs.map((run, index) => scoreRun(run.problem, observations[index], { derived: run.derived }));
  const observationOf = (problemId: string, variant: string) => results.find((result) => result.problemId === problemId && result.variant === variant)?.observation;
  const pairs = plan.pairs.map((pair) => comparePair(pair, observationOf(pair.a.problemId, pair.a.variant), observationOf(pair.b.problemId, pair.b.variant)));
  const coverage = new Map<string, number>();
  for (const card of dataset.raw.indexCards) for (const group of card.target_groups) coverage.set(group, (coverage.get(group) ?? 0) + 1);
  const summary = summarise({ problems, results, pairs, validationIssues: loaded.issues.length, level: args.gate, exceptions: args.exceptions });

  const finished = new Date();
  const official = path.resolve(args.problemsDir) === path.resolve(DEFAULT_PROBLEMS_DIR);
  const data: ReportData = {
    meta: {
      command: "eval",
      runId,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      official,
      options: {
        provider: args.provider ?? head,
        readCache: !args.noCache,
        concurrency: args.concurrency,
        gate: args.gate,
        exceptions: args.exceptions,
        fairnessAll: args.fairnessAll,
        runTag: tagPrompts,
        only: args.only,
      },
      environment: {
        llmHead: described.provider,
        llmModel: described.model,
        llmConfigured: described.configured,
        dataVersion: dataset.version,
        promptVersions: Object.fromEntries(TASKS.map((task) => [task, loadPrompt(task).version])),
        embeddingModel: embed.model,
        embeddingReachable,
      },
    },
    loaded: { ...loaded, problems },
    results,
    pairs,
    skippedPairs: plan.skipped,
    targetGroups: perTargetGroup(results, problems, coverage),
    summary,
  };

  mkdirSync(args.outDir, { recursive: true });
  const base = path.join(args.outDir, `eval-${stamp(finished)}`);
  writeFileSync(`${base}.md`, reportMarkdown(data), "utf8");
  writeFileSync(`${base}.json`, `${JSON.stringify(reportJson(data), null, 1)}\n`, "utf8");
  // FR-11.7: "Jak to działa" reads the date of the last run of the official set from a fixed name.
  if (official && args.only.length === 0 && problems.length > 0) copyFileSync(`${base}.json`, path.join(args.outDir, "eval-latest.json"));

  process.stdout.write(`\n${summary.measures.map((measure) => `${measure.name}: ${measure.result} (target ${measure.target})`).join("\n")}\n`);
  process.stdout.write(`\nReport: ${base}.md\nResult: ${summary.must.pass ? "PASS" : "FAIL"}\n`);
  for (const failure of summary.must.failures) process.stdout.write(`  - ${failure}\n`);
  return summary.must.pass ? 0 : 1;
}

export async function warmMain(args: EvalArgs): Promise<number> {
  const runId = `warm-${randomBytes(3).toString("hex")}`;
  const { dataset, loaded, problems, embed, llm } = await setup(args);
  for (const issue of loaded.issues) process.stderr.write(`${issue.file}${issue.field ? ` ${issue.field}` : ""}: ${issue.message}\n`);
  // Every problem and the derived sides of its pairs; the repeats of R12 stop at the gate without a model call.
  const plan = planRuns(problems, { placeKind: (terc) => dataset.gminaByTerc.get(terc)?.kind ?? null });
  const runs = plan.runs.filter((run) => !run.variant.startsWith("repeat:"));
  process.stdout.write(`pnpm cache:warm: ${runs.length} runs, provider ${llmProvider()}${args.refresh ? ", refreshing every route" : ""}\n`);

  const observations = await runAll(
    runs,
    {
      llm,
      dataset,
      embed,
      cache: createFileRouteCache(),
      runId,
      readCache: true,
      writeCache: true,
      bypassCache: args.refresh,
      // The recording must match the app's own calls, so no run id here.
      tagPrompts: false,
    },
    { concurrency: args.concurrency, onResult: (run, observation) => progress(run, observation) },
  );

  const routed = observations.filter((observation) => observation.outcome === "need");
  const hits = routed.filter((observation) => observation.cacheHit).length;
  const failed = observations.filter((observation) => observation.error);
  const stages = observations.flatMap((observation) => observation.stages).filter((stage) => stage.stage !== "retrieve");
  const recorded = stages.filter((stage) => !stage.cached).length;
  const replayed = stages.filter((stage) => stage.cached).length;
  process.stdout.write(
    `\nRoutes: ${hits} cache hits, ${routed.length - hits} computed and stored; ${observations.length - routed.length} stopped at the gate (nothing to cache).\n` +
      `Model calls: ${recorded} live (recorded for replay), ${replayed} served from the recording.\n`,
  );
  for (const observation of failed) process.stdout.write(`  not warmed: ${observation.problemId} ${observation.variant}: ${observation.error}\n`);
  if (loaded.issues.length) process.stdout.write(`${loaded.issues.length} problems in the problem files; those files were not warmed.\n`);
  return failed.length || loaded.issues.length ? 1 : 0;
}
