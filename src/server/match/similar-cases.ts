import type { Idea, Need, Route } from "@/lib/contracts";
import { repository, type Repository } from "@/server/db";
import { isReal } from "@/server/db/repository";
import { buildLexicalIndex, lexicalTerms, rankLexical } from "./lexical";

/*
 * Module I, "wyszukuje podobne przypadki": besides the proven solutions, a
 * route shows the similar cases other people brought to the tool, the
 * needs of the needs bank and the idea cards. Computed when the route is
 * read, so newer cases reach older routes; no model call, the word
 * matching of the retriever's fallback over the cases' texts.
 *
 * Principle E6: a case is shown only when its author consented to
 * publication and a person at ROPS approved it in the panel; a need shows
 * the gate's neutral summary, never the author's own words. The cases that
 * may not be shown are only counted.
 */

/**
 * A case counts as similar when it shares at least two words with the
 * query and a quarter of the query's words. BM25 only orders the similar
 * cases: its weight of a word falls when many cases share it, so a score
 * threshold would hide the cases exactly when there are many.
 */
export const MIN_SHARED_TERMS = 2;
export const MIN_COVERAGE = 0.25;
/** A shared target group adds to the score. */
const GROUP_BONUS = 0.5;
export const MAX_SHOWN = 3;

export interface SimilarCase {
  kind: "need" | "idea";
  id: string;
  /** The need's neutral summary, or the idea's name. */
  title: string;
  /** The idea's short description; null for a need. */
  description: string | null;
  place_terc: string | null;
  created_at: string;
  /** The need's status (FR-5.7) or the idea's stage. */
  state: string;
  /** The innovations the need was matched with: how the case went on. */
  innovation_ids: string[];
  score: number;
}

export interface SimilarCases {
  shown: SimilarCase[];
  /** Similar cases that may not be shown: no consent, or not approved yet. */
  hiddenCount: number;
}

const needText = (need: Need) => [need.summary_pl, need.problem_text].filter(Boolean).join("\n");
const ideaText = (idea: Idea) => [idea.title, idea.description, idea.essence, idea.for_whom].join("\n");

export const needShowable = (need: Need) =>
  need.moderation.status === "zatwierdzone" && need.consents.publish_anonymised && Boolean(need.summary_pl);
export const ideaShowable = (idea: Idea) => idea.moderation.status === "zatwierdzone" && idea.consents.publish;

export interface CaseQuery {
  text: string;
  targetGroups: string[];
  /** The route the query comes from: the need saved from it is not its own similar case. */
  routeId: string | null;
}

/** The similar cases of a query among the needs and the idea cards. Pure. */
export function findSimilarCases(query: CaseQuery, needs: readonly Need[], ideas: readonly Idea[]): SimilarCases {
  const candidates = [
    ...needs.filter((need) => need.route_id === null || need.route_id !== query.routeId).map((need) => ({ kind: "need" as const, item: need, text: needText(need), groups: need.target_groups })),
    ...ideas.map((idea) => ({ kind: "idea" as const, item: idea, text: ideaText(idea), groups: idea.target_groups })),
  ];
  if (candidates.length === 0 || !query.text.trim()) return { shown: [], hiddenCount: 0 };

  const queryTerms = new Set(lexicalTerms(query.text));
  const index = buildLexicalIndex(candidates.map((candidate, i) => ({ id: String(i), text: candidate.text })));
  const similar = rankLexical(index, query.text)
    .map(({ id, score }) => {
      const candidate = candidates[Number(id)];
      const shared = new Set(lexicalTerms(candidate.text).filter((term) => queryTerms.has(term))).size;
      const bonus = candidate.groups.some((group) => query.targetGroups.includes(group)) ? GROUP_BONUS : 0;
      return { candidate, shared, score: score + bonus };
    })
    .filter((entry) => entry.shared >= MIN_SHARED_TERMS && entry.shared / queryTerms.size >= MIN_COVERAGE)
    .sort((a, b) => b.score - a.score);

  const showable = similar.filter(({ candidate }) =>
    candidate.kind === "need" ? needShowable(candidate.item) : ideaShowable(candidate.item),
  );
  const shown = showable.slice(0, MAX_SHOWN).map(({ candidate, score }): SimilarCase => {
    const rounded = Math.round(score * 10) / 10;
    if (candidate.kind === "need") {
      const need = candidate.item;
      return {
        kind: "need",
        id: need.id,
        title: need.summary_pl ?? "",
        description: null,
        place_terc: need.place_terc,
        created_at: need.created_at,
        state: need.status,
        innovation_ids: need.nearest_matches.map((match) => match.innovation_id).slice(0, 2),
        score: rounded,
      };
    }
    const idea = candidate.item;
    return {
      kind: "idea",
      id: idea.id,
      title: idea.title,
      description: idea.description,
      place_terc: idea.place_terc,
      created_at: idea.created_at,
      state: idea.stage,
      innovation_ids: [],
      score: rounded,
    };
  });
  return { shown, hiddenCount: similar.length - showable.length };
}

/** The similar cases of a route, read from the store; the panel's demonstration data is no case of anyone's. */
export async function similarCasesForRoute(route: Route, repo: Repository = repository()): Promise<SimilarCases> {
  const [needs, ideas] = await Promise.all([repo.listNeeds().then((all) => all.filter(isReal)), repo.listIdeas().then((all) => all.filter(isReal))]);
  const text = [route.need_summary_pl, route.input.problem_text].filter(Boolean).join("\n");
  return findSimilarCases({ text, targetGroups: route.input.target_groups, routeId: route.id }, needs, ideas);
}
