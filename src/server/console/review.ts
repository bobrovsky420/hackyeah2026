import type { Route } from "@/lib/contracts/route";
import type { GateTextKind } from "@/server/contracts";
import type { Repository, StoredScreeningLogEntry } from "@/server/db";

/*
 * The declined-texts review of FR-12.8, one queue from two sources: the
 * stored `declined` routes (the gate's harm decline and the mild decline of
 * FR-12.12, each with its reference code) and the texts the screening log
 * keeps for seven days (FR-12.7: `declined` and spam, from every form). A
 * kept text that belongs to a stored route (the log's `ref`) is shown with
 * that route, once; the other kept texts, such as a declined contact
 * message or a repeated spam text, are items of their own. "Przejrzane"
 * marks both sources of an item.
 */

export interface DeclinedReviewItem {
  /** The route id, or the log entry's "sl-" id for a text without a stored route. */
  id: string;
  source: "route" | "log";
  created_at: string;
  /** The code S11 showed and an appeal quotes; null for a text without a route. */
  reference_code: string | null;
  kind: GateTextKind;
  category: string;
  /** FR-12.12: the model refused a text the gate had passed as a need. */
  mild: boolean;
  /** The redacted text while it is kept, else null. */
  text: string | null;
  text_until: string | null;
  /** The log entry the text comes from, when there is one. */
  log_id: string | null;
}

function awaitsReview(entry: StoredScreeningLogEntry): entry is StoredScreeningLogEntry & { text: string } {
  return entry.text !== null && entry.reviewed_at === null;
}

function isMild(route: Route): boolean {
  return route.screening.category === "need" || route.mode_reason_pl !== null;
}

/** The merged queue, newest first. */
export async function listDeclinedReview(repo: Repository, now = Date.now()): Promise<DeclinedReviewItem[]> {
  const [routes, log] = await Promise.all([repo.listDeclinedForReview(), repo.listScreeningLog(now)]);
  const texts = log.filter(awaitsReview);
  const routeIds = new Set(routes.map((route) => route.id));
  const textOfRoute = new Map(texts.flatMap((entry) => (entry.ref && routeIds.has(entry.ref) ? [[entry.ref, entry] as const] : [])));

  const items: DeclinedReviewItem[] = routes.map((route) => {
    const logged = textOfRoute.get(route.id);
    // The canned engine keeps the redacted text in the route; the live pipeline leaves it to the log.
    const text = route.input.problem_text ?? logged?.text ?? null;
    return {
      id: route.id,
      source: "route",
      created_at: route.created_at,
      reference_code: route.reference_code,
      kind: "need",
      category: route.screening.category,
      mild: isMild(route),
      text,
      text_until: route.input.problem_text === null ? (logged?.text_until ?? null) : null,
      log_id: logged?.id ?? null,
    };
  });
  for (const entry of texts) {
    if (entry.ref && routeIds.has(entry.ref)) continue;
    items.push({
      id: entry.id,
      source: "log",
      created_at: entry.at,
      reference_code: null,
      kind: entry.kind,
      category: entry.category,
      mild: false,
      text: entry.text,
      text_until: entry.text_until,
      log_id: entry.id,
    });
  }
  return items.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/**
 * Marks one item of the queue as reviewed, with its kept text; undefined
 * when it is no longer in the queue (reviewed meanwhile, or gone).
 */
export async function markDeclinedReviewed(
  repo: Repository,
  id: string,
  at: string,
  now = Date.parse(at),
): Promise<DeclinedReviewItem | undefined> {
  const item = (await listDeclinedReview(repo, now)).find((entry) => entry.id === id);
  if (!item) return undefined;
  if (item.source === "route" && !(await repo.markDeclineReviewed(item.id, at))) return undefined;
  if (item.log_id && !(await repo.markScreeningTextReviewed(item.log_id, at)) && item.source === "log") return undefined;
  return item;
}
