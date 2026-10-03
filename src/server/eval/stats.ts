/*
 * Percentiles for the latency budgets of 12.3 and 13.2. Nearest rank: the
 * p-th percentile of n sorted values is the value at rank ceil(p / 100 * n).
 * With ten runs, p95 is the slowest run and p50 the fifth: the conservative
 * reading of a budget on a small sample, with no interpolation between runs
 * that never happened.
 */

export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  if (!(p > 0 && p <= 100)) throw new RangeError(`percentile ${p} is outside (0, 100]`);
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export interface LatencyRow {
  name: string;
  count: number;
  p50: number | null;
  p95: number | null;
  max: number | null;
  /** Milliseconds; null when 12.3 or 13.2 sets none. */
  budgetMs: number | null;
  /** Null without runs or without a budget. */
  withinBudget: boolean | null;
}

export function latencyRow(name: string, values: readonly number[], budgetMs: number | null): LatencyRow {
  const p95 = percentile(values, 95);
  return {
    name,
    count: values.length,
    p50: percentile(values, 50),
    p95,
    max: values.length ? Math.max(...values) : null,
    budgetMs,
    withinBudget: p95 === null || budgetMs === null ? null : p95 <= budgetMs,
  };
}

export function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
