import Link from "next/link";
import { markSeen } from "@/app/admin/actions";
import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell, wasSaved } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/admin/status-chip";
import { NewBadge } from "@/components/ui/new-badge";
import { formatDate } from "@/lib/dates";
import { t, type MessageKey } from "@/lib/i18n";
import { pluralPl } from "@/lib/text";
import { EXPORT_KINDS, OVERDUE_WORKING_DAYS, queueCounts, todoList, trends, workingDaysBetween, type QueueKey } from "@/server/admin/data";
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

const TODO_KINDS: Record<QueueKey, MessageKey> = {
  threads: "admin.todo.kind.threads",
  partnerships: "admin.todo.kind.partnerships",
  ideas: "admin.todo.kind.ideas",
  evaluations: "admin.todo.kind.evaluations",
  needs: "admin.todo.kind.needs",
  contacts: "admin.todo.kind.contacts",
  readiness: "admin.todo.kind.readiness",
  reports: "admin.todo.kind.reports",
  declined: "admin.todo.kind.declined",
};

/** How many oldest entries "Do zrobienia" shows before "Pokaż wszystkie". */
const TODO_SHOWN = 12;

function waitText(days: number): string {
  if (days === 0) return t("admin.todo.today");
  return t("admin.todo.wait", {
    count: days,
    unit: pluralPl(days, { one: t("admin.todo.unit.one"), few: t("admin.todo.unit.few"), many: t("admin.todo.unit.many") }),
  });
}

const EXPORT_LABELS: Record<(typeof EXPORT_KINDS)[number], MessageKey> = {
  needs: "admin.export.needs",
  ideas: "admin.export.ideas",
  evaluations: "admin.export.evaluations",
  contacts: "admin.export.contacts",
  readiness: "admin.export.readiness",
};

/**
 * The panel's start (module VI): "Do zrobienia", everything that waits for
 * a person at ROPS in one list, oldest first, with how long it waits and
 * "po terminie" past OVERDUE_WORKING_DAYS; then the queues with what is new
 * since the reviewer's last visit (the notification of a new idea the
 * brief asks about), the key numbers and the latest decisions.
 */
export default async function AdminStartPage({ searchParams }: PageProps<"/admin">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const query = await searchParams;
  const [counts, numbers, log, todo] = await Promise.all([queueCounts(session.lastVisit), trends(), repository().listModerationLog(10), todoList()]);
  const fresh = counts.reduce((sum, item) => sum + item.fresh, 0);
  const today = new Date().toISOString();
  const waiting = todo.map((item) => ({ ...item, days: workingDaysBetween(item.since, today) }));
  const overdue = waiting.filter((item) => item.days > OVERDUE_WORKING_DAYS).length;
  const all = query.wszystkie === "1";
  const shown = all ? waiting : waiting.slice(0, TODO_SHOWN);

  return (
    <AdminShell session={session} current="start" title={t("admin.start.title")} lead={t("admin.start.lead")} saved={wasSaved(query)}>
      <section aria-labelledby="do-zrobienia" className="grid gap-3">
        <h2 id="do-zrobienia" className="text-[1.3rem] font-bold">
          {t("admin.todo.title")}
        </h2>
        <p>{t("admin.todo.lead", { days: OVERDUE_WORKING_DAYS })}</p>
        {waiting.length === 0 ? (
          <p>{t("admin.todo.none")}</p>
        ) : (
          <>
            <p className="font-bold">
              {t("admin.todo.count", { count: waiting.length })} {overdue > 0 && t("admin.todo.overdueCount", { count: overdue })}
            </p>
            <ol className="grid gap-2">
              {shown.map((item) => {
                const late = item.days > OVERDUE_WORKING_DAYS;
                return (
                  <li
                    key={`${item.key}-${item.id}`}
                    className={`grid gap-0.5 rounded-md border px-3 py-2 ${late ? "border-2 border-l-8 border-destructive" : "border-border"}`}
                  >
                    <Link href={item.href} className="font-bold">
                      {item.summary}
                    </Link>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.95rem]">
                      <span className="text-muted-foreground">{t(TODO_KINDS[item.key])}</span>
                      <StatusChip tone={item.days === 0 ? "new" : "progress"}>{waitText(item.days)}</StatusChip>
                      {late && <StatusChip tone="late">{t("admin.todo.overdue")}</StatusChip>}
                    </span>
                  </li>
                );
              })}
            </ol>
            {!all && waiting.length > TODO_SHOWN && (
              <p>
                <Link href="/rops?wszystkie=1#do-zrobienia">{t("admin.todo.all", { count: waiting.length })}</Link>
              </p>
            )}
          </>
        )}
      </section>

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
              <p className={item.fresh > 0 ? "flex flex-wrap items-center gap-2 font-bold" : "text-muted-foreground"}>
                {t("admin.start.fresh")} {item.fresh > 0 ? <NewBadge>{String(item.fresh)}</NewBadge> : <span className="tabular-nums">0</span>}
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
