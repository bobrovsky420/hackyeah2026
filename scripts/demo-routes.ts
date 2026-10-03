/*
 * `pnpm demo:routes [--concurrency <n>] [--only <id,...>] [--refresh] [--verbose]`:
 * the pipeline's part of the panel's demonstration data (module II). It
 * runs every question of data/curated/demo-questions.yaml once through the
 * route pipeline, with its role and place, and the declined inputs of
 * data/curated/demo-records.yaml through the gate, and matches every idea
 * card of demo-records.yaml against the catalogue, as the card's page
 * would; the results, with each route's nearest matches for the need saved
 * from it, go to data/built/demo-routes.json. At the end the two
 * hand-written files are copied beside it, so data/built/ holds the set
 * src/server/db/demo.ts reads; after an edit of a text, a run with nothing
 * new to compute only copies. Like cache:warm, the routes also land in the
 * route cache and the per-call recording, so the same question asked live
 * is a cache hit. Resumable: the file is written after every result, and
 * an id the file holds is skipped unless --refresh is given.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { IdeaSimilar, RoleCode, Route } from "../src/lib/contracts";

const BANK = path.join("data", "curated", "demo-questions.yaml");
const RECORDS = path.join("data", "curated", "demo-records.yaml");
const OUT = path.join("data", "built", "demo-routes.json");
const USAGE = "pnpm demo:routes [--concurrency <n>] [--only <id,...>] [--refresh] [--verbose]";

interface Question {
  id: string;
  role: RoleCode | null;
  place_terc: string | null;
  text_pl: string;
}

interface DemoIdea {
  id: string;
  title: string;
  description: string;
  essence: string;
  for_whom: string;
  target_groups: string[];
}

interface Entry {
  question_id: string;
  ran_at: string;
  cache_hit: boolean;
  stages: { stage: string; provider: string; latency_ms: number; cached: boolean }[];
  route: Route;
  /** The route's solutions as a need's nearest matches (FR-5.3), for the need saved from it; null for a screened route. */
  nearest?: IdeaSimilar[] | null;
}

interface DemoRoutesFile {
  version: 1;
  data_version: string;
  updated_at: string;
  entries: Entry[];
  /** The similar innovations of each idea card of demo-records.yaml, by its id there. */
  idea_similar?: Record<string, IdeaSimilar[]>;
}

/** The questions, then the declined inputs, which come without a role or a place; and the idea cards. */
function readSources(): { questions: Question[]; ideas: DemoIdea[] } {
  const bank = (parse(readFileSync(BANK, "utf8")) as { questions: Question[] }).questions;
  const records = parse(readFileSync(RECORDS, "utf8")) as { declined: { id: string; text: string }[]; ideas: DemoIdea[] };
  const declined = records.declined.map((item) => ({ id: item.id, role: null, place_terc: null, text_pl: item.text }));
  return { questions: [...bank, ...declined], ideas: records.ideas };
}

function parseArgs(argv: string[]) {
  const args = { concurrency: 3, only: [] as string[], refresh: false, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--concurrency") args.concurrency = Math.max(1, Number(argv[++i]) || 1);
    else if (arg === "--only") args.only = (argv[++i] ?? "").split(",").filter(Boolean);
    else if (arg === "--refresh") args.refresh = true;
    else if (arg === "--verbose") args.verbose = true;
    else throw new Error(`unknown option ${arg}\n${USAGE}`);
  }
  return args;
}

function readOut(dataVersion: string): DemoRoutesFile {
  if (!existsSync(OUT)) return { version: 1, data_version: dataVersion, updated_at: "", entries: [], idea_similar: {} };
  const file = JSON.parse(readFileSync(OUT, "utf8")) as DemoRoutesFile;
  if (file.data_version !== dataVersion) {
    process.stderr.write(`${OUT} holds results of data ${file.data_version}; this data is ${dataVersion}. Run with --refresh to recompute them.\n`);
  }
  return { ...file, idea_similar: file.idea_similar ?? {} };
}

function writeOut(file: DemoRoutesFile) {
  mkdirSync(path.dirname(OUT), { recursive: true });
  file.updated_at = new Date().toISOString();
  file.entries.sort((a, b) => a.question_id.localeCompare(b.question_id));
  writeFileSync(`${OUT}.tmp`, `${JSON.stringify(file, null, 1)}\n`, "utf8");
  renameSync(`${OUT}.tmp`, OUT);
}

/** Runs `job` on every item, `concurrency` at a time; returns the ids that failed. */
async function pool<T extends { id: string }>(items: T[], concurrency: number, job: (item: T) => Promise<string>): Promise<string[]> {
  const failed: string[] = [];
  const queue = [...items];
  let finished = 0;
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const started = Date.now();
      let line: string;
      try {
        line = await job(item);
      } catch (error) {
        failed.push(item.id);
        line = `FAILED ${error instanceof Error ? error.message : String(error)}`;
      }
      const seconds = ((Date.now() - started) / 1000).toFixed(1).padStart(5);
      process.stdout.write(`${String(++finished).padStart(3)}/${items.length} ${item.id.padEnd(6)} ${seconds} s ${line}\n`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return failed;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  // The screening log of the runs stays in this process: a script never shares the store file with a running server.
  process.env.STORE_FILE ??= "memory";
  if (!args.verbose) console.info = () => undefined;
  const { getDataset } = await import("../src/lib/data/load");
  const { getLlm, describeLlm } = await import("../src/lib/llm");
  const { withPlaceFacts } = await import("../src/lib/catalogue");
  const { createEmbedClient, matchNeed } = await import("../src/server/match");
  const { ideaMatchText } = await import("../src/server/ideas");
  const { nearestFromRoute, toNearestMatches } = await import("../src/server/needs/nearest");
  const { createFileRouteCache } = await import("../src/server/route-cache");
  const { runPipeline } = await import("../src/server/pipeline");

  const { questions, ideas } = readSources();
  const known = new Set([...questions, ...ideas].map((item) => item.id));
  const unknown = args.only.filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`--only: no question or idea ${unknown.join(", ")}`);
  const dataset = getDataset();
  const out = readOut(dataset.version);
  const similar = (out.idea_similar ??= {});
  const wanted = (id: string, done: boolean) => (args.only.length === 0 || args.only.includes(id)) && (args.refresh || !done);
  const done = new Set(out.entries.map((entry) => entry.question_id));
  const todoQuestions = questions.filter((question) => wanted(question.id, done.has(question.id)));
  const todoIdeas = ideas.filter((idea) => wanted(idea.id, idea.id in similar));

  const llm = getLlm();
  const embed = createEmbedClient();
  const cache = createFileRouteCache();
  const described = describeLlm();
  process.stdout.write(
    `pnpm demo:routes: ${todoQuestions.length} of ${questions.length} questions, ${todoIdeas.length} of ${ideas.length} idea cards, ` +
      `${described.provider} ${described.model}, ${args.concurrency} in parallel\n`,
  );

  const failedQuestions = await pool(todoQuestions, args.concurrency, async (question) => {
    const result = await runPipeline(
      { problemText: question.text_pl, placeTerc: question.place_terc, role: question.role, targetGroups: [], client: null, bypassCache: args.refresh },
      { llm, dataset, embed, cache, newId: () => `rt-demo-${question.id.toLowerCase()}` },
    );
    const route = withPlaceFacts(result.route);
    out.entries = [
      ...out.entries.filter((other) => other.question_id !== question.id),
      {
        question_id: question.id,
        ran_at: new Date().toISOString(),
        cache_hit: result.cacheHit,
        stages: result.stages.map((stage) => ({ stage: stage.stage, provider: stage.provider, latency_ms: stage.latencyMs, cached: stage.cached })),
        route,
      },
    ];
    writeOut(out);
    const ids = route.solutions.map((solution) => solution.innovation_id).join(" ");
    return `${route.mode.padEnd(10)} ${result.cacheHit ? "hit " : "miss"} [${route.question_groups?.join(",") || "-"}] ${ids}`;
  });

  // The idea card's page matches the card's texts as one need (src/server/ideas): the same here, without a place.
  const failedIdeas = await pool(todoIdeas, args.concurrency, async (idea) => {
    const result = await matchNeed(
      { needText: ideaMatchText(idea), needSummary: null, placeTerc: null, role: null, targetGroups: idea.target_groups },
      { llm, dataset, embed },
    );
    similar[idea.id] = toNearestMatches(result.assessments, dataset);
    writeOut(out);
    return `similar ${similar[idea.id].map((match) => `${match.innovation_id}:${match.fit_score}`).join(" ") || "-"}`;
  });

  // No model call: the needs of the demonstration data take their matches from their routes, as the needs bank does.
  for (const entry of out.entries) entry.nearest = nearestFromRoute(entry.route, dataset);
  writeOut(out);
  // The app reads the demonstration data from data/built/ only; a question without a route yet is left out there.
  const copies = [BANK, RECORDS].map((file) => {
    const copy = path.join(path.dirname(OUT), path.basename(file));
    copyFileSync(file, copy);
    return copy;
  });

  const modes = new Map<string, number>();
  for (const entry of out.entries) modes.set(entry.route.mode, (modes.get(entry.route.mode) ?? 0) + 1);
  process.stdout.write(
    `\n${OUT}: ${out.entries.length} of ${questions.length} questions (${[...modes].map(([mode, count]) => `${mode} ${count}`).join(", ")}), ` +
      `${Object.keys(similar).length} of ${ideas.length} idea cards\nCopied ${copies.join(", ")}\n`,
  );
  const failed = [...failedQuestions, ...failedIdeas];
  if (failed.length) process.stdout.write(`Failed (run again to retry): ${failed.join(", ")}\n`);
  return failed.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`pnpm demo:routes failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exit(2);
  },
);
