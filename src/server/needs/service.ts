import "server-only";
import { randomBytes } from "node:crypto";
import { catalogue as defaultCatalogue, type Catalogue } from "@/lib/catalogue";
import type { Brief, StoredBrief } from "@/lib/contracts/brief";
import type { Need } from "@/lib/contracts/records";
import type { Route } from "@/lib/contracts/route";
import { getLlm } from "@/lib/llm";
import type { Llm } from "@/lib/llm/types";
import { buildBrief } from "@/lib/server/brief";
import type { Embed, MatchNeed, StageLog } from "@/server/contracts";
import { repository, type Repository } from "@/server/db";
import { createEmbedClient } from "@/server/match";
import { generateBrief } from "./brief";
import { clusterNeeds, clusterable, type ClusterResult } from "./cluster";
import { nearestFromRoute, nearestMatches } from "./nearest";
import { openNeeds, type OpenNeed, type OpenNeedsFilter } from "./open";
import { briefSections, sectionsToMarkdown } from "./sections";

/*
 * The needs bank's work behind the handlers and the console (7.5): the
 * brief generated once per need and stored (8.5), the duplicate check
 * computed when the first brief needs it, the clustering run of the
 * console (FR-5.4) and the public view of approved needs (FR-5.6). The
 * dependencies default to the app's repository, model chain and data, and
 * tests pass their own.
 */

export interface NeedsDeps {
  repo: Repository;
  llm: Llm;
  /** The data facade; `dataset` is null on the fixtures, where the template brief stands without a model call. */
  catalogue: Catalogue;
  embed: Embed;
  /** The matcher of src/server/match unless given. */
  matchNeed?: MatchNeed;
  /** The template brief (buildBrief of src/lib/server/brief.ts). */
  template: (need: Need, route: Route | null) => Promise<Brief>;
  now: () => Date;
}

let embed: Embed | undefined;

/** The app's dependencies where the caller gave none. */
function resolve(given: Partial<NeedsDeps> = {}): NeedsDeps {
  return {
    repo: given.repo ?? repository(),
    llm: given.llm ?? getLlm(),
    catalogue: given.catalogue ?? defaultCatalogue(),
    embed: given.embed ?? (embed ??= createEmbedClient()),
    matchNeed: given.matchNeed,
    template: given.template ?? buildBrief,
    now: given.now ?? (() => new Date()),
  };
}

function briefId(now: Date): string {
  return `br-${now.toISOString().slice(0, 10)}-${randomBytes(3).toString("hex")}`;
}

/** One line per brief for the request log (FR-3.6): stages, tokens, notes. Never the need's text. */
function logStages(kind: string, id: string, stages: StageLog[]) {
  const parts = stages.map(
    (stage) =>
      `${stage.stage}:${stage.provider}/${stage.latencyMs}ms/${stage.inputTokens}+${stage.outputTokens}` +
      (stage.notes.length ? `/${stage.notes.join(",")}` : ""),
  );
  console.info(`[${kind}] ${id} ${parts.join(" ") || "no model call"}`);
}

/** The nearest matches a new need stores at once: its route's, with no model call; none without a route (FR-5.3). */
export function nearestForNewNeed(route: Route | null, data: Pick<Catalogue, "innovationById"> = defaultCatalogue()): Need["nearest_matches"] {
  return (route && nearestFromRoute(route, data)) ?? [];
}

async function generate(need: Need, stored: StoredBrief | undefined, deps: NeedsDeps): Promise<StoredBrief> {
  const { repo, catalogue } = deps;
  const route = need.route_id ? ((await repo.getRoute(need.route_id)) ?? null) : null;
  const stages: StageLog[] = [];
  let current = need;

  // FR-5.3: a need typed straight into the bank gets its duplicate check here, not while its author waits for the save.
  if (current.nearest_matches.length === 0) {
    let matches: Need["nearest_matches"] = route ? nearestForNewNeed(route, catalogue) : [];
    if (!route && catalogue.dataset) {
      const result = await nearestMatches(current, { llm: deps.llm, dataset: catalogue.dataset, embed: deps.embed, matchNeed: deps.matchNeed });
      stages.push(...result.stages);
      matches = result.matches;
    }
    if (matches.length > 0) current = (await repo.setNearestMatches(current.id, matches)) ?? { ...current, nearest_matches: matches };
  }

  const template = await deps.template(current, route);
  let brief: Brief = template;
  if (catalogue.dataset) {
    const generated = await generateBrief(current, {
      llm: deps.llm,
      dataset: catalogue.dataset,
      template,
      sensitiveTopics: route?.screening.sensitive_topics ?? [],
    });
    brief = generated.brief;
    if (generated.stage) stages.push(generated.stage);
  }
  logStages("brief", need.id, stages);

  const now = deps.now();
  const sections = briefSections(brief, catalogue.department);
  const record: StoredBrief = {
    id: stored?.id ?? need.brief_id ?? briefId(now),
    need_id: need.id,
    generated_at: now.toISOString(),
    brief: { ...brief, generatedAt: now.toISOString() },
    sections,
    markdown: sectionsToMarkdown(sections),
  };
  await repo.saveBrief(record);
  if (await repo.markBriefGenerated(need.id, record.generated_at)) await repo.countEvent("brief_generated");
  return record;
}

const holder = globalThis as typeof globalThis & { __briefsInFlight?: Map<string, Promise<StoredBrief | null>> };
const inFlight = (holder.__briefsInFlight ??= new Map());

/**
 * POST /api/needs/{id}/brief (9.2): the stored brief, or a new one generated
 * and stored when there is none or `refresh` is set (the console only).
 * Null when the need is unknown. Parallel requests for one need share one
 * generation.
 */
export async function briefForNeed(needId: string, options: { refresh?: boolean } = {}, given?: Partial<NeedsDeps>): Promise<StoredBrief | null> {
  const deps = resolve(given);
  const need = await deps.repo.getNeed(needId);
  if (!need) return null;
  const stored = await deps.repo.getBrief(need.id);
  if (stored && !options.refresh) return stored;

  const running = inFlight.get(need.id);
  if (running) return running;
  const job = generate(need, stored, deps).finally(() => inFlight.delete(need.id));
  inFlight.set(need.id, job);
  return job;
}

/** The stored brief of a need, for the page; never generates. */
export async function storedBrief(needId: string, repo: Repository = repository()): Promise<StoredBrief | undefined> {
  return repo.getBrief(needId);
}

export interface ClusterRun extends ClusterResult {
  /** How many needs the run looked at. */
  considered: number;
}

/** "Pogrupuj" of the console (FR-5.4): clusters the open needs and stores the ids and names. */
export async function clusterOpenNeeds(given?: Partial<NeedsDeps>): Promise<ClusterRun> {
  const deps = resolve(given);
  const open = clusterable(await deps.repo.listNeeds());
  const result = await clusterNeeds(open, { llm: deps.llm });
  if (result.stage) logStages("cluster", `${open.length} needs`, [result.stage]);
  // A failed call stores nothing, so the clusters of the last good run stay.
  if (!result.failed) {
    const createdAt = deps.now().toISOString();
    await deps.repo.saveClusters(
      result.clusters.map((cluster) => ({ ...cluster, created_at: createdAt })),
      open.map((need) => need.id),
    );
  }
  return { ...result, considered: open.length };
}

export interface OpenNeedView extends OpenNeed {
  place_name: string | null;
}

/** GET /api/needs/open (FR-5.6): approved needs with consent to publication, with gmina names. */
export async function openNeedsView(filter: OpenNeedsFilter, given?: Partial<Pick<NeedsDeps, "repo" | "catalogue">>): Promise<OpenNeedView[]> {
  const repo = given?.repo ?? repository();
  const data = given?.catalogue ?? defaultCatalogue();
  const needs = await repo.listNeeds({
    moderation: "zatwierdzone",
    publishable: true,
    category: filter.category ?? undefined,
    places: filter.terc ? [filter.terc] : undefined,
  });
  return openNeeds(needs, filter).map((need) => ({
    ...need,
    place_name: need.place_terc ? (data.gminaByTerc.get(need.place_terc)?.name ?? null) : null,
  }));
}
