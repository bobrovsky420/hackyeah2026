import Link from "next/link";
import { t } from "@/lib/i18n";

/** Where a content report points (8.11), as the query of the report page. */
export type ReportTarget = { droga: string } | { innowacja: string } | { fiszka: string };

export function reportHref(target: ReportTarget): string {
  const [key, id] = Object.entries(target)[0];
  return `/zglos?${key}=${encodeURIComponent(id)}`;
}

/** "Zgłoś problem z tą treścią" (FR-12.9) at the end of every route, brief and innovation page. */
export function ReportLink({ target }: { target: ReportTarget }) {
  return (
    <p className="no-print border-t border-border pt-6">
      <Link href={reportHref(target)}>{t("report.link")}</Link>
    </p>
  );
}
