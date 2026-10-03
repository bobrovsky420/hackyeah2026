import type { Evaluation, EvaluationSummary } from "@/lib/contracts";
import { repository, type Repository } from "@/server/db";

/*
 * Module IV, "Tester innowacji": what the innovation's page shows of its
 * evaluations. Only numbers: the texts wait for ROPS, which passes them on
 * to the innovators (principle E6, people in the loop).
 */

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export function isRating(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_RATING && value <= MAX_RATING;
}

/** The counts of a list of evaluations, leaving out those ROPS rejected; the average is rounded to one decimal. */
export function summarise(all: readonly Evaluation[]): EvaluationSummary {
  const evaluations = all.filter((item) => item.moderation.status !== "odrzucone");
  const ratings = evaluations.flatMap((item) => (item.rating === null ? [] : [item.rating]));
  const average = ratings.length > 0 ? Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10 : null;
  return {
    ratings: ratings.length,
    average,
    testers: evaluations.filter((item) => item.test_signup !== null).length,
    improvements: evaluations.filter((item) => item.improvement !== null).length,
  };
}

export async function evaluationSummary(innovationId: string, repo: Repository = repository()): Promise<EvaluationSummary> {
  return summarise(await repo.listEvaluations(innovationId));
}
