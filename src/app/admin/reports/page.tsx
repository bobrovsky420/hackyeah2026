import Link from "next/link";
import { reviewDeclined } from "@/app/admin/actions";
import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell, wasSaved } from "@/components/admin/admin-shell";
import { DecisionForm, ModerationState } from "@/components/admin/decision-form";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { reportReasons } from "@/lib/reports";
import { reviewQueue } from "@/server/admin/data";

export const metadata = { title: t("admin.reports.title") };

const reportHref = (type: string, id: string) =>
  type === "route" ? `/droga/${id}` : type === "innovation" ? `/innowacja/${id}` : type === "brief" || type === "need" ? `/potrzeba/${id}/fiszka` : null;

/** Module VI: the content reports of FR-12.9 and the declined-texts review of FR-12.8. */
export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const query = await searchParams;
  const { reports, declined, kept } = await reviewQueue();
  const back = "/rops/zgloszenia";

  return (
    <AdminShell session={session} current="reports" title={t("admin.reports.title")} lead={t("admin.reports.lead")} saved={wasSaved(query)}>
      <section aria-labelledby="zgloszenia-tresci" className="grid gap-3">
        <h2 id="zgloszenia-tresci" className="text-[1.3rem] font-bold">
          {t("admin.reports.content")}
        </h2>
        {reports.length === 0 ? (
          <p>{t("admin.empty")}</p>
        ) : (
          <ul className="grid gap-4">
            {reports.map((report) => {
              const href = reportHref(report.target.type, report.target.id);
              return (
                <li key={report.id} className="grid gap-2 rounded-lg border border-border p-4">
                  <p className="font-bold">
                    {t(reportReasons[report.reason])}: {href ? <Link href={href}>{report.target.id}</Link> : report.target.id}
                  </p>
                  <p className="text-muted-foreground">{formatDate(report.created_at)}</p>
                  {report.comment && <p className="whitespace-pre-line">{report.comment}</p>}
                  <ModerationState moderation={report.moderation} />
                  {report.moderation.status === "do-weryfikacji" && (
                    <DecisionForm kind="report" id={report.id} back={back} approveLabel={t("admin.reports.approve")} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="odmowy" className="grid gap-3">
        <h2 id="odmowy" className="text-[1.3rem] font-bold">
          {t("admin.reports.declined")}
        </h2>
        <p>{t("admin.reports.declinedLead")}</p>
        {declined.length === 0 && kept.length === 0 ? (
          <p>{t("admin.empty")}</p>
        ) : (
          <ul className="grid gap-4">
            {declined.map((route) => (
              <li key={route.id} className="grid gap-2 rounded-lg border border-border p-4">
                <p className="text-muted-foreground">
                  {formatDate(route.created_at)} · <Link href={`/droga/${route.id}`}>{route.id}</Link>
                </p>
                <p className="whitespace-pre-line">{route.input.problem_text}</p>
                <Reviewed id={route.id} back={back} />
              </li>
            ))}
            {kept.map((entry) => (
              <li key={entry.id} className="grid gap-2 rounded-lg border border-border p-4">
                <p className="text-muted-foreground">
                  {formatDate(entry.at)} · {entry.kind} · {entry.outcome}
                </p>
                <p className="whitespace-pre-line">{entry.text}</p>
                <Reviewed id={entry.id} back={back} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}

function Reviewed({ id, back }: { id: string; back: string }) {
  return (
    <form action={reviewDeclined} className="no-print">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="wroc" value={back} />
      <Button type="submit" variant="secondary">
        {t("admin.reports.reviewed")}
      </Button>
    </form>
  );
}
