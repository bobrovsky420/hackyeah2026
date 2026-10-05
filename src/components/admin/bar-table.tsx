import Link from "next/link";
import { t } from "@/lib/i18n";
import type { Journey } from "@/lib/journeys";

export interface BarRow {
  label: string;
  count: number;
  /** The count of the previous period; given, the table shows the change as a signed number. */
  previous?: number;
  extra?: string;
  href?: string;
}

/** A change as a signed number, with the minus sign rather than a hyphen: "+3", "\u22122", "0". */
export function signed(change: number): string {
  return change > 0 ? `+${change}` : change < 0 ? `\u2212${-change}` : "0";
}

/** Below this many entries in a table, a change says little: the table says so. */
const FEW = 10;

/**
 * A trend as a table with a bar per row: the numbers stay readable for
 * screen readers and in print. A row with `href` links its label to the
 * items behind it. With the counts of the previous period, a "Zmiana"
 * column shows the difference as text, never as colour alone. The bars take
 * the colour of the journey the table counts (decision U.11): one hue per
 * table, as every bar measures the same thing.
 */
export function BarTable({
  caption,
  keyHeader,
  rows,
  empty,
  changeNote,
  journey,
}: {
  caption: string;
  keyHeader: string;
  rows: BarRow[];
  empty: string;
  /** What the change is measured against, under the table. */
  changeNote?: string;
  /** Whose entries the table counts; none keeps the accent. */
  journey?: Journey;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  const withChange = rows.some((row) => row.previous !== undefined);
  const total = rows.reduce((sum, row) => sum + row.count + (row.previous ?? 0), 0);
  return (
    <section data-journey={journey} className="grid content-start gap-3 rounded-lg border border-border bg-background p-5">
      <h2 className="text-[1.15rem] font-bold">{caption}</h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-4">
                {keyHeader}
              </th>
              <th scope="col" className="py-2 pr-4 text-right">
                {t("admin.trends.count")}
              </th>
              {withChange && (
                <th scope="col" className="py-2 pr-4 text-right">
                  {t("admin.trends.change")}
                </th>
              )}
              <th scope="col" className="w-1/2 py-2">
                <span className="sr-only">{caption}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-border">
                <th scope="row" className="py-2 pr-4 font-normal">
                  {row.href ? <Link href={row.href}>{row.label}</Link> : row.label}
                  {row.extra && <span className="block text-[0.9rem] text-muted-foreground">{row.extra}</span>}
                </th>
                <td className="py-2 pr-4 text-right font-bold tabular-nums">{row.count}</td>
                {withChange && <td className="py-2 pr-4 text-right tabular-nums">{signed(row.count - (row.previous ?? 0))}</td>}
                <td className="py-2" aria-hidden>
                  {row.count > 0 && <span className="block h-4 rounded-sm bg-journey-ink" style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {withChange && rows.length > 0 && changeNote && (
        <p className="text-[0.9rem] text-muted-foreground">
          {changeNote}
          {total < FEW && ` ${t("admin.trends.few")}`}
        </p>
      )}
    </section>
  );
}
