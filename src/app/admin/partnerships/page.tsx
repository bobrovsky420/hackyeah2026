import Link from "next/link";
import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell, wasSaved } from "@/components/admin/admin-shell";
import { DecisionForm, ModerationState } from "@/components/admin/decision-form";
import { getGmina } from "@/lib/catalogue";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { sectorLabel } from "@/lib/labels";
import { repository } from "@/server/db";

export const metadata = { title: t("admin.partnerships.title") };

/**
 * Module V in the panel: the posts of the partnership board, shown only
 * after approval, and the conversations of those who answered them, so
 * ROPS can connect the two sides.
 */
export default async function AdminPartnershipsPage({ searchParams }: PageProps<"/admin/partnerships">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const query = await searchParams;
  const repo = repository();
  const [posts, threads] = await Promise.all([repo.listPosts(), repo.listThreads()]);

  return (
    <AdminShell session={session} current="partnerships" title={t("admin.partnerships.title")} lead={t("admin.partnerships.lead")} saved={wasSaved(query)}>
      {posts.length === 0 ? (
        <p>{t("admin.empty")}</p>
      ) : (
        <ul className="grid gap-4">
          {posts.map((post) => {
            const answers = threads.filter((thread) => thread.ref?.type === "partnership" && thread.ref.id === post.id && thread.id !== post.thread_id);
            return (
              <li key={post.id} className="grid gap-2 rounded-lg border border-border p-4">
                <h2 className="text-[1.15rem] font-bold">{post.title}</h2>
                <p className="text-muted-foreground">
                  {t(post.kind === "szukam" ? "talk.board.kind.szukam" : "talk.board.kind.oferuje")} · {post.author.organisation ?? post.author.display_name} ·{" "}
                  {sectorLabel(post.sector)}
                  {getGmina(post.place_terc) && ` · ${getGmina(post.place_terc)?.name}`} · {formatDate(post.created_at)}
                  {post.example && ` · ${t("admin.example")}`}
                  {post.demo && ` · ${t("admin.demo")}`}
                </p>
                <p className="whitespace-pre-line">{post.description}</p>
                <p>
                  <Link href={`/rops/rozmowy/${post.thread_id}`}>{t("admin.partnerships.authorThread")}</Link>
                </p>
                {answers.length > 0 && (
                  <div className="grid gap-1">
                    <p className="font-bold">{t("admin.partnerships.answers", { count: answers.length })}</p>
                    <ul className="grid list-disc gap-1 pl-6">
                      {answers.map((thread) => (
                        <li key={thread.id}>
                          <Link href={`/rops/rozmowy/${thread.id}`}>
                            {thread.author.display_name}
                            {thread.author.sector && ` (${sectorLabel(thread.author.sector)})`}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <ModerationState moderation={post.moderation} />
                <DecisionForm kind="partnership" id={post.id} back="/rops/partnerstwa" approveLabel={t("admin.partnerships.approve")} />
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}
