import Link from "next/link";
import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell } from "@/components/admin/admin-shell";
import type { ThreadTopic } from "@/lib/contracts";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { isTopic, threadStatusLabel, topicCodes, topicLabel } from "@/lib/labels";
import { repository } from "@/server/db";
import { waitsForRops } from "@/server/threads/access";

export const metadata = { title: t("admin.threads.title") };

/** Module V in the panel: the conversations, those waiting for ROPS first. */
export default async function AdminThreadsPage({ searchParams }: PageProps<"/admin/threads">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const query = await searchParams;
  const topic = isTopic(query.temat) ? (query.temat as ThreadTopic) : null;
  const threads = (await repository().listThreads())
    .filter((thread) => !topic || thread.topic === topic)
    .sort((a, b) => Number(waitsForRops(b)) - Number(waitsForRops(a)));

  return (
    <AdminShell session={session} current="threads" title={t("admin.threads.title")} lead={t("admin.threads.lead")}>
      <nav aria-label={t("admin.filter.label")}>
        <ul className="flex flex-wrap gap-x-5">
          <li>
            <Link scroll={false} href="/rops/rozmowy" aria-current={!topic ? "page" : undefined} className="inline-flex min-h-11 items-center aria-[current=page]:font-bold">
              {t("admin.filter.all")}
            </Link>
          </li>
          {topicCodes.map((code) => (
            <li key={code}>
              <Link
                scroll={false}
                href={`/rops/rozmowy?temat=${code}`}
                aria-current={topic === code ? "page" : undefined}
                className="inline-flex min-h-11 items-center aria-[current=page]:font-bold"
              >
                {topicLabel(code)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {threads.length === 0 ? (
        <p>{t("admin.empty")}</p>
      ) : (
        <ul className="grid gap-3">
          {threads.map((thread) => (
            <li key={thread.id} className="grid gap-1 rounded-lg border border-border p-4">
              <h2 className="text-[1.1rem] font-bold">
                <Link href={`/rops/rozmowy/${thread.id}`}>{thread.subject}</Link>
              </h2>
              <p className="text-muted-foreground">
                {topicLabel(thread.topic)} · {thread.author.display_name} · {formatDate(thread.updated_at)} ·{" "}
                {t("admin.threads.count", { count: thread.messages.length })}
                {thread.mentor && ` · ${t("admin.threads.withMentor", { name: thread.mentor.name })}`}
              </p>
              <p className={waitsForRops(thread) ? "font-bold" : ""}>
                {waitsForRops(thread) ? t("admin.threads.waiting") : threadStatusLabel(thread.status)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
