import type { Dataset } from "@/lib/data/to-contracts";
import { ROPS_BONUS } from "./thresholds";

/*
 * The regional weight of FR-3.10 (decision M.10): a record of the ROPS
 * library ranks as if its fit were ROPS_BONUS points higher, and before a
 * record of another source on an equal weighted fit. Ranking only: the fit
 * shown, the mode (FR-3.3) and the partial threshold keep the model's score.
 */

type Records = Pick<Dataset, "innovationById">;

/** True for a record of the ROPS library ("Biblioteka ROPS"). */
export function isRopsLibrary(dataset: Records, id: string): boolean {
  return dataset.innovationById.get(id)?.source === "rops-biblioteka";
}

/** The fit a record ranks by: the model's, plus ROPS_BONUS for the ROPS library. */
export function weightedFit(dataset: Records, id: string, fit: number): number {
  return fit + (isRopsLibrary(dataset, id) ? ROPS_BONUS : 0);
}

/**
 * A comparator for Array.prototype.sort: the higher weighted fit first, the
 * ROPS library first on a tie; the sort is stable, so the input order
 * breaks the rest.
 */
export function byWeightedFit<T>(dataset: Records, idOf: (item: T) => string, fitOf: (item: T) => number) {
  return (a: T, b: T): number =>
    weightedFit(dataset, idOf(b), fitOf(b)) - weightedFit(dataset, idOf(a), fitOf(a)) ||
    Number(isRopsLibrary(dataset, idOf(b))) - Number(isRopsLibrary(dataset, idOf(a)));
}
