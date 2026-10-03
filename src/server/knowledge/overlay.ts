import type { Innovation, InnovationOverride, KnowledgeEntry, Route } from "@/lib/contracts";
import { catalogue as defaultCatalogue, type Catalogue } from "@/lib/catalogue";
import { repository, type Repository } from "@/server/db";

/*
 * Module VI: the knowledge ROPS keeps in the panel, applied over the
 * catalogue whenever a route or an innovation is read, so a change shows at
 * once and on routes made before it. The catalogue and the curated files
 * stay as the data release built them; the stored routes stay as composed.
 *
 * - An innovation marked hidden leaves the route's solutions and knowledge
 *   and its page; one marked verified carries the flag; extra materials (a
 *   film) join its materials; a corrected summary replaces the record's.
 * - A knowledge entry with a `base_id` edits that curated item (found by its
 *   URL on the route) or, hidden, removes it; an entry without one is a new
 *   item, added to the routes of its target groups or to every route.
 */

export interface Overlay {
  entries: KnowledgeEntry[];
  overrides: Map<string, InnovationOverride>;
}

export async function loadOverlay(repo: Repository = repository()): Promise<Overlay> {
  const [entries, overrides] = await Promise.all([repo.listKnowledgeEntries(), repo.listInnovationOverrides()]);
  return { entries, overrides: new Map(overrides.map((item) => [item.innovation_id, item])) };
}

export const isEmptyOverlay = (overlay: Overlay) => overlay.entries.length === 0 && overlay.overrides.size === 0;

export function isHidden(overlay: Overlay, innovationId: string): boolean {
  return overlay.overrides.get(innovationId)?.status === "ukryte";
}

/** The innovation as its page shows it, or null when ROPS hid it. */
export function overlayInnovation(innovation: Innovation, override: InnovationOverride | undefined): Innovation | null {
  if (!override) return innovation;
  if (override.status === "ukryte") return null;
  const known = new Set(innovation.materials.map((material) => material.url));
  const extra = override.extra_materials.filter((material) => !known.has(material.url));
  return {
    ...innovation,
    summary: override.summary_pl ?? innovation.summary,
    materials: [...extra.map((material) => ({ title: material.title, url: material.url, type: material.type })), ...innovation.materials],
  };
}

type KnowledgeLink = Route["knowledge"][number];

function fitsGroups(entry: KnowledgeEntry, groups: readonly string[]): boolean {
  return entry.always_show || entry.target_groups.includes("any") || entry.target_groups.some((code) => groups.includes(code));
}

/** The curated items' URLs by id, so an edit of a curated item finds it on a route. */
function baseUrls(data: Pick<Catalogue, "knowledge">): Map<string, string> {
  return new Map([...data.knowledge.byId].map(([id, link]) => [id, link.url]));
}

/** The route as the reader sees it with the panel's knowledge; the route itself is not changed. */
export function overlayRoute(route: Route, overlay: Overlay, data: Pick<Catalogue, "knowledge"> = defaultCatalogue()): Route {
  if (isEmptyOverlay(overlay)) return route;
  const hidden = new Set([...overlay.overrides.values()].filter((item) => item.status === "ukryte").map((item) => item.innovation_id));

  const solutions = route.solutions
    .filter((solution) => !hidden.has(solution.innovation_id))
    .map((solution) => {
      const override = overlay.overrides.get(solution.innovation_id);
      if (!override) return solution;
      const known = new Set(solution.materials.map((material) => material.url));
      const extra = override.extra_materials.filter((material) => !known.has(material.url));
      return {
        ...solution,
        materials: [...extra.map(({ title, url, type }) => ({ title, url, type })), ...solution.materials],
        verified_by_rops: override.status === "zweryfikowane",
      };
    });

  const urls = baseUrls(data);
  const editByUrl = new Map<string, KnowledgeEntry>();
  for (const entry of overlay.entries) {
    const url = entry.base_id ? urls.get(entry.base_id) : undefined;
    if (url) editByUrl.set(url, entry);
  }
  const knowledge: KnowledgeLink[] = [];
  const seen = new Set<string>();
  const add = (link: KnowledgeLink) => {
    if (seen.has(link.url)) return;
    seen.add(link.url);
    knowledge.push(link);
  };
  for (const link of route.knowledge) {
    if (link.for_innovation_id && hidden.has(link.for_innovation_id)) continue;
    const edit = editByUrl.get(link.url);
    if (edit?.hidden) continue;
    add(edit ? { ...link, title: edit.title_pl, url: edit.url, type: edit.type } : link);
  }
  // Extra materials of the route's solutions, then the panel's new items for the route's groups.
  for (const solution of solutions) {
    for (const material of overlay.overrides.get(solution.innovation_id)?.extra_materials ?? []) {
      add({ title: material.title, url: material.url, type: material.type, for_innovation_id: solution.innovation_id });
    }
  }
  const groups = route.input.target_groups;
  for (const entry of overlay.entries) {
    if (entry.base_id || entry.hidden || !fitsGroups(entry, groups)) continue;
    add({ title: entry.title_pl, url: entry.url, type: entry.type, for_innovation_id: null });
  }

  return { ...route, solutions, knowledge };
}
