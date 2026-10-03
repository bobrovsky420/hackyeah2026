import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell, wasSaved } from "@/components/admin/admin-shell";
import { InnovationForm } from "@/components/admin/innovation-form";
import { getInnovation } from "@/lib/catalogue";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { sourceName } from "@/lib/labels";
import { repository } from "@/server/db";
import { evaluationSummary } from "@/server/evaluations";

export const metadata = { title: t("admin.innovation.title") };

/** ROPS's word on one catalogue innovation (module VI), with what the tester of module IV gathered about it. */
export default async function AdminInnovationPage({ params, searchParams }: PageProps<"/admin/innovations/[id]">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const { id } = await params;
  const query = await searchParams;
  const item = getInnovation(id);
  if (!item) notFound();
  const [override, summary] = await Promise.all([repository().getInnovationOverride(item.id), evaluationSummary(item.id)]);

  return (
    <AdminShell session={session} current="knowledge" title={item.title} lead={t("admin.innovation.lead")} saved={wasSaved(query)}>
      <p>
        <Link href="/rops/wiedza">{t("admin.knowledge.back")}</Link> · <Link href={`/innowacja/${item.id}`}>{t("admin.innovation.public")}</Link>
        {item.sourceUrl && (
          <>
            {" · "}
            <a href={item.sourceUrl}>{t("admin.innovation.source", { source: sourceName(item.source) })}</a>
          </>
        )}
      </p>
      <dl className="grid gap-x-6 gap-y-2 @xl:grid-cols-[max-content_minmax(0,1fr)]">
        <dt className="font-bold">{t("admin.innovation.recordSummary")}</dt>
        <dd>{item.summary}</dd>
        <dt className="font-bold">{t("tester.section.title")}</dt>
        <dd>
          {t("admin.innovation.evaluations", {
            ratings: summary.ratings,
            average: summary.average?.toLocaleString("pl-PL", { maximumFractionDigits: 1 }) ?? "-",
            testers: summary.testers,
            improvements: summary.improvements,
          })}{" "}
          <Link href="/rops/opinie">{t("admin.innovation.toEvaluations")}</Link>
        </dd>
        {override && (
          <>
            <dt className="font-bold">{t("admin.innovation.lastChange")}</dt>
            <dd>{t("admin.innovation.changedBy", { who: override.updated_by, date: formatDate(override.updated_at) })}</dd>
          </>
        )}
      </dl>
      <InnovationForm innovationId={item.id} override={override ?? null} summary={item.summary} />
    </AdminShell>
  );
}
