import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * The panel's trends (module II, for the administrator only), drawn so a
 * reader finds one at a glance: three groups, each with its own colour
 * (slots 1 to 3 of the validated data-viz palette, tokens --trend-*), one
 * card per trend with its headline in words, and the data as a table, so
 * screen readers and print keep every number. Bars carry the group's
 * colour; every value and label stays in the text colours.
 */

export type TrendTone = "needs" | "ideas" | "routes";

const FILL: Record<TrendTone, string> = { needs: "bg-trend-needs", ideas: "bg-trend-ideas", routes: "bg-trend-routes" };
const RULE: Record<TrendTone, string> = { needs: "border-t-trend-needs", ideas: "border-t-trend-ideas", routes: "border-t-trend-routes" };
const EDGE: Record<TrendTone, string> = { needs: "border-l-trend-needs", ideas: "border-l-trend-ideas", routes: "border-l-trend-routes" };

/** A group of trends: a coloured band and heading, then its cards side by side on a wide screen. */
export function TrendGroup({ tone, id, title, lead, children }: { tone: TrendTone; id: string; title: string; lead: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={cn("grid gap-5 border-t-[6px] pt-5", RULE[tone])}>
      <div className="grid gap-1">
        <h2 id={id} className="flex items-center gap-3 text-[1.45rem] font-bold">
          <span aria-hidden className={cn("inline-block size-4 rounded-sm", FILL[tone])} />
          {title}
        </h2>
        <p className="max-w-[48rem] text-muted-foreground">{lead}</p>
      </div>
      <div className="grid gap-5 @4xl:grid-cols-2">{children}</div>
    </section>
  );
}

/** One trend: its name, its headline in words, then the chart. */
export function TrendCard({ id, title, headline, wide, children }: { id: string; title: string; headline: string | null; wide?: boolean; children: ReactNode }) {
  return (
    <article aria-labelledby={id} className={cn("grid content-start gap-3 rounded-lg border border-border bg-background p-5", wide && "@4xl:col-span-2")}>
      <h3 id={id} className="text-[1.15rem] font-bold">
        {title}
      </h3>
      {headline && <p className="text-[1.05rem] font-bold">{headline}</p>}
      {children}
    </article>
  );
}

export interface TrendRow {
  label: string;
  count: number;
  /** A second line under the label, such as the average rating. */
  extra?: string;
}

const share = (count: number, total: number) => (total > 0 ? Math.round((count / total) * 100) : 0);

/**
 * Horizontal bars as a table: label, value with its share, and the bar.
 * Bars are 12px thick with a 4px rounded end, square at the baseline; the
 * longest fills the track.
 */
export function BarList({
  tone,
  caption,
  keyHeader,
  countHeader,
  rows,
  total,
  empty,
  tooltip,
}: {
  tone: TrendTone;
  caption: string;
  keyHeader: string;
  countHeader: string;
  rows: TrendRow[];
  /** The share is of this number; without it no share is shown. */
  total?: number;
  empty: string;
  tooltip: (row: TrendRow, share: number | null) => string;
}) {
  if (rows.length === 0) return <p className="text-muted-foreground">{empty}</p>;
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">{caption}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">{keyHeader}</th>
          <th scope="col">{countHeader}</th>
          <th scope="col">
            <span>{caption}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const part = total ? share(row.count, total) : null;
          return (
            <tr key={row.label} title={tooltip(row, part)} className="align-middle hover:bg-muted">
              <th scope="row" className="w-[40%] py-1.5 pr-3 font-normal">
                {row.label}
                {row.extra && <span className="block text-[0.9rem] text-muted-foreground">{row.extra}</span>}
              </th>
              <td className="w-[1%] py-1.5 pr-3 text-right whitespace-nowrap">
                <span className="font-bold tabular-nums">{row.count}</span>
                {part !== null && <span className="ml-1.5 text-[0.9rem] text-muted-foreground tabular-nums">{part}%</span>}
              </td>
              <td className="py-1.5" aria-hidden>
                <span className="block h-3 w-full rounded-r-[4px] bg-trend-track">
                  <span className={cn("block h-3 rounded-r-[4px]", FILL[tone])} style={{ width: `${Math.max(3, (row.count / max) * 100)}%` }} />
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Change over time as columns, oldest first: the last column is the current
 * week in the full colour, the earlier ones lighter; values on the caps.
 * The columns are a picture; the table under them, read by screen readers,
 * holds the numbers.
 */
export function WeekColumns({
  tone,
  caption,
  keyHeader,
  countHeader,
  rows,
  empty,
  tooltip,
}: {
  tone: TrendTone;
  caption: string;
  keyHeader: string;
  countHeader: string;
  rows: (TrendRow & { short: string })[];
  empty: string;
  tooltip: (row: TrendRow) => string;
}) {
  if (rows.length === 0) return <p className="text-muted-foreground">{empty}</p>;
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="grid gap-2">
      <div aria-hidden className="flex h-44 items-end gap-[2px] border-b border-border">
        {rows.map((row, index) => (
          <div key={row.label} title={tooltip(row)} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 hover:bg-muted">
            <span className="text-[0.9rem] font-bold tabular-nums">{row.count}</span>
            <span
              className={cn("block w-full max-w-6 rounded-t-[4px]", FILL[tone], index < rows.length - 1 && "opacity-55")}
              style={{ height: `${Math.max(3, (row.count / max) * 80)}%` }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden className="flex gap-[2px]">
        {rows.map((row) => (
          <span key={row.label} className="min-w-0 flex-1 text-center text-[0.8rem] text-muted-foreground tabular-nums">
            {row.short}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{keyHeader}</th>
            <th scope="col">{countHeader}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A headline number of the panel, marked with the colour of its group. */
export function StatTile({ tone, label, value }: { tone: TrendTone; label: string; value: number }) {
  return (
    <div className={cn("grid gap-1 rounded-lg border border-border border-l-[6px] bg-background p-4", EDGE[tone])}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-[2rem] leading-none font-bold tabular-nums">{value.toLocaleString("pl-PL")}</dd>
    </div>
  );
}
