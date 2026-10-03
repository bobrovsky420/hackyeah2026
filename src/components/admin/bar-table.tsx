import Link from "next/link";
import { t } from "@/lib/i18n";

/** A trend as a table with a bar per row: the numbers stay readable for screen readers and in print. A row with `href` links its label to the items behind it. */
export function BarTable({
  caption,
  keyHeader,
  rows,
  empty,
}: {
  caption: string;
  keyHeader: string;
  rows: { label: string; count: number; extra?: string; href?: string }[];
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <section className="grid content-start gap-3 rounded-lg border border-border bg-background p-5">
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
                <td className="py-2" aria-hidden>
                  <span className="block h-4 rounded-sm bg-foreground" style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
