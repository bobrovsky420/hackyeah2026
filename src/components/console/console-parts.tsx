import type { ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { controlClass } from "@/components/ui/field";
import { t, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/*
 * The parts of the ROPS console (S7): plain, dense, keyboard operable. The
 * forms that act on a row are client components: decision-form, status-form.
 */

export const smallLabel = "text-[0.9rem] font-bold";

export function ConsolePage({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <h1 id="naglowek-strony" tabIndex={-1} className="text-[1.75rem] leading-tight font-bold @3xl:text-[2.2rem]">
          {title}
        </h1>
        <p className="max-w-[44rem] text-muted-foreground">{lead}</p>
      </header>
      {children}
    </div>
  );
}

/** A table in a labelled region that scrolls sideways on its own, never the page. */
export function DataTable({
  caption,
  children,
  minWidth = "min-w-[52rem]",
}: {
  caption: string;
  children: ReactNode;
  /** The width below which the table scrolls; narrow tables take less. */
  minWidth?: "min-w-[52rem]" | "min-w-[30rem]" | "min-w-[20rem]";
}) {
  return (
    <div role="region" aria-label={caption} tabIndex={0} className="overflow-x-auto rounded-lg border border-border">
      <table className={cn("w-full border-collapse text-left", minWidth)}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th scope="col" className="border-b-2 border-input bg-muted px-3 py-2 align-bottom font-bold">
      {children}
    </th>
  );
}

export function Td({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <td id={id} className={cn("border-b border-border px-3 py-3 align-top", className)}>
      {children}
    </td>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-border bg-muted p-4">{children}</p>;
}

/** Filters as a GET form, so every view has an address; plus the CSV export. */
export function Filters({
  statuses,
  current,
  exportType,
  categories,
}: {
  statuses: Record<string, MessageKey>;
  current: { status: string; gmina: string; category?: string };
  exportType: "needs" | "contacts" | "readiness";
  /** The target groups for the category filter of the needs list (FR-9.2). */
  categories?: { value: string; label: string }[];
}) {
  return (
    <div className="no-print flex flex-wrap items-end justify-between gap-4">
      <form method="get" className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1">
          <label htmlFor="filtr-status" className={smallLabel}>
            {t("console.col.status")}
          </label>
          <select id="filtr-status" name="status" defaultValue={current.status} className={controlClass}>
            <option value="">{t("console.filter.all")}</option>
            {Object.entries(statuses).map(([value, key]) => (
              <option key={value} value={value}>
                {t(key)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="filtr-gmina" className={smallLabel}>
            {t("console.filter.place")}
          </label>
          <input id="filtr-gmina" name="gmina" defaultValue={current.gmina} className={controlClass} />
        </div>
        {categories && (
          <div className="grid gap-1">
            <label htmlFor="filtr-kategoria" className={smallLabel}>
              {t("console.filter.category")}
            </label>
            <select id="filtr-kategoria" name="kategoria" defaultValue={current.category ?? ""} className={controlClass}>
              <option value="">{t("console.filter.all")}</option>
              {categories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" variant="secondary">
          {t("console.filter.submit")}
        </Button>
      </form>
      <a href={`/api/rops/export.csv?what=${exportType}`} className={buttonVariants({ variant: "secondary" })}>
        {t("console.export")}
      </a>
    </div>
  );
}
