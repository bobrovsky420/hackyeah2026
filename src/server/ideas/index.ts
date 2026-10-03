import { catalogue as defaultCatalogue, getGmina, type Catalogue } from "@/lib/catalogue";
import type { Embed, Idea, IdeaSimilar, MatchNeed } from "@/lib/contracts";
import { t } from "@/lib/i18n";
import { ideaKindLabel, ideaStageLabel, targetGroupLabel } from "@/lib/labels";
import { getLlm } from "@/lib/llm";
import type { Llm } from "@/lib/llm/types";
import { getExampleRoute } from "@/lib/mock/routes";
import { pickScenario } from "@/lib/mock/scenarios";
import { repository, type Repository } from "@/server/db";
import { createEmbedClient, matchNeed } from "@/server/match";
import { nearestFromRoute, toNearestMatches } from "@/server/needs/nearest";
import { routeEngine } from "@/server/route-service";

/*
 * The idea cards of module III ("Kreator pomysłów"): the similar
 * innovations of a card, computed once for its page and stored, and the
 * card as a Markdown file. The matcher reads the card's texts as a need,
 * so "co pasuje" and "czego brakuje" come from the grounded assessment
 * (FR-5.3), never from new free text; the author's name and e-mail never
 * enter a prompt (FR-6.6). The canned engine takes the example route its
 * keywords pick, like the prototype's routes do.
 */

export interface IdeasDeps {
  repo: Repository;
  llm: Llm;
  catalogue: Catalogue;
  embed: Embed;
  /** The matcher of src/server/match unless given; tests pass a fake. */
  matchNeed: MatchNeed;
  /** "live" runs the matcher, "canned" the example routes. */
  engine: "live" | "canned";
}

let embed: Embed | undefined;

function resolve(given: Partial<IdeasDeps> = {}): IdeasDeps {
  return {
    repo: given.repo ?? repository(),
    llm: given.llm ?? getLlm(),
    catalogue: given.catalogue ?? defaultCatalogue(),
    embed: given.embed ?? (embed ??= createEmbedClient()),
    matchNeed: given.matchNeed ?? matchNeed,
    engine: given.engine ?? routeEngine(),
  };
}

/** The card's texts as one need for the matcher: what it is, its essence and whom it is for. */
export function ideaMatchText(idea: Pick<Idea, "title" | "description" | "essence" | "for_whom">): string {
  return [idea.title, idea.description, idea.essence, idea.for_whom].map((part) => part.trim()).filter(Boolean).join("\n");
}

async function compute(idea: Idea, deps: IdeasDeps): Promise<IdeaSimilar[]> {
  const text = ideaMatchText(idea);
  const dataset = deps.catalogue.dataset;
  if (deps.engine === "canned" || !dataset) {
    const example = getExampleRoute(pickScenario(text, idea.target_groups).routeId);
    return (example && nearestFromRoute(example, deps.catalogue)) ?? [];
  }
  const result = await deps.matchNeed(
    { needText: text, needSummary: null, placeTerc: idea.place_terc, role: null, targetGroups: idea.target_groups },
    { llm: deps.llm, dataset, embed: deps.embed },
  );
  return toNearestMatches(result.assessments, dataset);
}

const holder = globalThis as typeof globalThis & { __ideasInFlight?: Map<string, Promise<Idea | null>> };
const inFlight = (holder.__ideasInFlight ??= new Map());

/**
 * POST /api/ideas/{id}/similar: the card with its similar innovations,
 * computed and stored on the first call. Null when the card is unknown.
 * Parallel requests for one card share one run; a model failure throws
 * LlmError and stores nothing, so the page can try again.
 */
export async function similarForIdea(id: string, given?: Partial<IdeasDeps>): Promise<Idea | null> {
  const deps = resolve(given);
  const idea = await deps.repo.getIdea(id);
  if (!idea) return null;
  if (idea.similar !== null) return idea;

  const running = inFlight.get(id);
  if (running) return running;
  const job = (async () => {
    const similar = await compute(idea, deps);
    return (await deps.repo.setIdeaSimilar(id, similar)) ?? { ...idea, similar };
  })().finally(() => inFlight.delete(id));
  inFlight.set(id, job);
  return job;
}

/** The card as a Markdown file for "Pobierz", in the order of its page. */
export function ideaMarkdown(idea: Idea, data: Pick<Catalogue, "innovationById"> = defaultCatalogue()): string {
  const gmina = getGmina(idea.place_terc);
  const lines = [
    `# ${idea.title}`,
    "",
    `${t(idea.kind === "pomysl" ? "card.eyebrow.pomysl" : "card.eyebrow.praktyka")} · ${idea.created_at.slice(0, 10)}`,
    "",
    `## ${t("card.description")}`,
    "",
    idea.description,
    "",
    `## ${t("card.essence")}`,
    "",
    idea.essence,
    "",
    `## ${t("card.forWhom")}`,
    "",
    idea.for_whom,
  ];
  if (idea.target_groups.length > 0) lines.push("", `${t("card.groups")} ${idea.target_groups.map(targetGroupLabel).join(", ")}`);
  lines.push("", `## ${t("card.stage")}`, "", ideaStageLabel(idea.stage));
  lines.push("", `${t("card.kind")} ${ideaKindLabel(idea.kind)}`);
  if (gmina) lines.push(`${t("card.place")} ${gmina.name}`);
  if (idea.similar && idea.similar.length > 0) {
    lines.push("", `## ${t("card.similar.title")}`, "");
    for (const match of idea.similar) {
      const innovation = data.innovationById.get(match.innovation_id);
      if (!innovation) continue;
      lines.push(`- **${innovation.title}** (${t("card.similar.score", { score: match.fit_score })}): ${match.what_fits_pl}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
