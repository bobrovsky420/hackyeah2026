import Link from "next/link";
import { markSeen } from "@/app/admin/actions";
import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell, wasSaved } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { t, type MessageKey } from "@/lib/i18n";
import { EXPORT_KINDS, queueCounts, trends, type QueueKey } from "@/server/admin/data";
import { repository } from "@/server/db";

const QUEUES: Record<QueueKey, { href: string; label: MessageKey }> = {
  threads: { href: "/rops/rozmowy", label: "admin.queue.threads" },
  partnerships: { href: "/rops/partnerstwa", label: "admin.queue.partnerships" },
  ideas: { href: "/rops/pomysly", label: "admin.queue.ideas" },
  evaluations: { href: "/rops/opinie", label: "admin.queue.evaluations" },
  needs: { href: "/rops/potrzeby", label: "admin.queue.needs" },
  contacts: { href: "/rops/kontakty", label: "admin.queue.contacts" },
  readiness: { href: "/rops/gotowosc", label: "admin.queue.readiness" },
  reports: { href: "/rops/zgloszenia", label: "admin.queue.reports" },
  declined: { href: "/rops/zgloszenia", label: "admin.queue.declined" },
};

const EXPORT_LABELS: Record<(typeof EXPORT_KINDS)[number], MessageKey> = {
  needs: "admin.export.needs",
  ideas: "admin.export.ideas",
  evaluations: "admin.export.evaluations",
  contacts: "admin.export.contacts",
  readiness: "admin.export.readiness",
};

/**
 * The panel's start (module VI): what waits for a person at ROPS, with what
 * is new since the reviewer's last visit (the notification of a new idea
 * the brief asks about), the key numbers and the latest decisions.
 */
export default async function AdminStartPage({ searchParams }: PageProps<"/admin">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const query = await searchParams;
  const [counts, numbers, log] = await Promise.all([queueCounts(session.lastVisit), trends(), repository().listModerationLog(10)]);
  const fresh = counts.reduce((sum, item) => sum + item.fresh, 0);

  return (
    <AdminShell session={session} current="start" title={t("admin.start.title")} lead={t("admin.start.lead")} saved={wasSaved(query)}>
      <section aria-labelledby="kolejki" className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="kolejki" className="text-[1.3rem] font-bold">
            {t("admin.start.queues")}
          </h2>
          <form action={markSeen}>
            <Button type="submit" variant="secondary">
              {t("admin.start.markSeen")}
            </Button>
          </form>
        </div>
        <p role="status">
          {session.lastVisit
            ? t("admin.start.freshSince", { count: fresh, date: formatDate(session.lastVisit) })
            : t("admin.start.freshAll", { count: fresh })}
        </p>
        <ul className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
          {counts.map((item) => (
            <li key={item.key} className="grid gap-1 rounded-lg border border-border p-4">
              <Link href={QUEUES[item.key].href} className="text-[1.1rem] font-bold">
                {t(QUEUES[item.key].label)}
              </Link>
              <p>
                {t("admin.start.waiting")} <span className="font-bold tabular-nums">{item.waiting}</span>
              </p>
              <p className={item.fresh > 0 ? "font-bold" : "text-muted-foreground"}>
                {t("admin.start.fresh")} <span className="tabular-nums">{item.fresh}</span>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="liczby" className="grid gap-3">
        <h2 id="liczby" className="text-[1.3rem] font-bold">
          {t("admin.start.numbers")}
        </h2>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
          <dt>{t("admin.start.routes")}</dt>
          <dd className="font-bold tabular-nums">{numbers.totals.routes}</dd>
          <dt>{t("admin.start.needs")}</dt>
          <dd className="font-bold tabular-nums">{numbers.totals.needs}</dd>
          <dt>{t("admin.start.ideas")}</dt>
          <dd className="font-bold tabular-nums">{numbers.totals.ideas}</dd>
          <dt>{t("admin.start.evaluations")}</dt>
          <dd className="font-bold tabular-nums">{numbers.totals.evaluations}</dd>
          <dt>{t("admin.start.contacts")}</dt>
          <dd className="font-bold tabular-nums">{numbers.totals.contacts}</dd>
        </dl>
        <p>
          <Link href="/rops/trendy">{t("admin.start.toTrends")}</Link>
        </p>
      </section>

      <section aria-labelledby="eksport" className="grid gap-3">
        <h2 id="eksport" className="text-[1.3rem] font-bold">
          {t("admin.export.title")}
        </h2>
        <p>{t("admin.export.lead")}</p>
        <ul className="flex flex-wrap gap-x-6 gap-y-1">
          {EXPORT_KINDS.map((kind) => (
            <li key={kind}>
              <a href={`/api/admin/export/${kind}`} className="inline-flex min-h-11 items-center" download>
                {t(EXPORT_LABELS[kind])}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="dziennik" className="grid gap-3">
        <h2 id="dziennik" className="text-[1.3rem] font-bold">
          {t("admin.log.title")}
        </h2>
        {log.length === 0 ? (
          <p className="text-muted-foreground">{t("admin.log.empty")}</p>
        ) : (
          <ul className="grid gap-1">
            {log.map((entry) => (
              <li key={`${entry.ts}-${entry.target_id}-${entry.action}`}>
                {t("admin.log.entry", {
                  date: formatDate(entry.ts),
                  who: entry.reviewer,
                  action: entry.action,
                  target: `${entry.target_type} ${entry.target_id}`,
                })}
                {entry.status && ` (${entry.status})`}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
