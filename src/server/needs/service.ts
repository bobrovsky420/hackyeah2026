import { randomBytes } from "node:crypto";
import { emit } from "@/lib/telemetry";
import { catalogue as defaultCatalogue, type Catalogue } from "@/lib/catalogue";
import type { Brief, StoredBrief, Need, Route, Embed, MatchNeed, StageLog } from "@/lib/contracts";
import { getLlm } from "@/lib/llm";
import type { Llm } from "@/lib/llm/types";
import { buildBrief } from "@/server/needs/brief-template";
import { repository, type Repository } from "@/server/db";
import { createEmbedClient } from "@/server/match";
import { generateBrief } from "./brief";
import { nearestFromRoute, nearestMatches } from "./nearest";
import { briefSections, sectionsToMarkdown } from "./sections";

/*
 * The needs bank's work behind the handlers (7.5): the brief generated
 * once per need and stored (8.5) and the duplicate check computed when the
 * first brief needs it. The dependencies default to the app's repository,
 * model chain and data, and tests pass their own.
 */

export interface NeedsDeps {
  repo: Repository;
  llm: Llm;
  /** The data facade; `dataset` is null on the fixtures, where the template brief stands without a model call. */
  catalogue: Catalogue;
  embed: Embed;
  /** The matcher of src/server/match unless given. */
  matchNeed?: MatchNeed;
  /** The template brief (buildBrief of src/server/needs/brief-template.ts). */
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

/** One line per brief for the request log (FR-3.6, 12.8): stages, tokens, notes. Never the need's text. */
function logStages(kind: string, id: string, stages: StageLog[]) {
  emit(`${kind}_completed`, {
    need_id: id,
    stages: stages.map((stage) => ({
      stage: stage.stage,
      provider: stage.provider,
      model: stage.model,
      latency_ms: stage.latencyMs,
      input_tokens: stage.inputTokens,
      output_tokens: stage.outputTokens,
      notes: stage.notes,
    })),
  });
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
 * and stored when there is none. Null when the need is unknown. Parallel
 * requests for one need share one generation.
 */
export async function briefForNeed(needId: string, given?: Partial<NeedsDeps>): Promise<StoredBrief | null> {
  const deps = resolve(given);
  const need = await deps.repo.getNeed(needId);
  if (!need) return null;
  const stored = await deps.repo.getBrief(need.id);
  if (stored) return stored;

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
