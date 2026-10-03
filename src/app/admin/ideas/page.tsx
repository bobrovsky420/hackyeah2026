import Link from "next/link";
import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell } from "@/components/admin/admin-shell";
import { ModerationState } from "@/components/admin/decision-form";
import type { IdeaStatus } from "@/lib/contracts";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { ideaKindLabel, ideaStageLabel } from "@/lib/labels";
import { ideaStatusCodes, ideaStatusLabel } from "@/server/admin/labels";
import { repository } from "@/server/db";

export const metadata = { title: t("admin.ideas.title") };

/** Module VI: the idea cards of module III, newest first, filtered by status. */
export default async function AdminIdeasPage({ searchParams }: PageProps<"/admin/ideas">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const query = await searchParams;
  const status = ideaStatusCodes.find((code) => code === query.status) as IdeaStatus | undefined;
  const ideas = (await repository().listIdeas()).filter((idea) => !status || idea.status === status);

  return (
    <AdminShell session={session} current="ideas" title={t("admin.ideas.title")} lead={t("admin.ideas.lead")}>
      <nav aria-label={t("admin.filter.label")}>
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          <li>
            <Link href="/rops/pomysly" aria-current={!status ? "page" : undefined} className="inline-flex min-h-11 items-center aria-[current=page]:font-bold">
              {t("admin.filter.all")}
            </Link>
          </li>
          {ideaStatusCodes.map((code) => (
            <li key={code}>
              <Link
                href={`/rops/pomysly?status=${code}`}
                aria-current={status === code ? "page" : undefined}
                className="inline-flex min-h-11 items-center aria-[current=page]:font-bold"
              >
                {ideaStatusLabel(code)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {ideas.length === 0 ? (
        <p>{t("admin.empty")}</p>
      ) : (
        <ul className="grid gap-4">
          {ideas.map((idea) => (
            <li key={idea.id} className="grid gap-1 rounded-lg border border-border p-4">
              <h2 className="text-[1.15rem] font-bold">
                <Link href={`/rops/pomysly/${idea.id}`}>{idea.title}</Link>
              </h2>
              <p className="text-muted-foreground">
                {formatDate(idea.created_at)} · {ideaKindLabel(idea.kind)} · {ideaStageLabel(idea.stage)} · {idea.author.display_name}
                {idea.demo && ` · ${t("admin.demo")}`}
              </p>
              <p>
                <span className="font-bold">{t("admin.ideas.status")}</span> {ideaStatusLabel(idea.status)}
                {idea.reply && ` · ${t("admin.ideas.replied")}`}
              </p>
              <ModerationState moderation={idea.moderation} />
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
