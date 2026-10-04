import Link from "next/link";
import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell } from "@/components/admin/admin-shell";
import { BarTable } from "@/components/admin/bar-table";
import { getInnovation } from "@/lib/catalogue";
import type { IdeaStage } from "@/lib/contracts";
import { formatDate } from "@/lib/dates";
import { t, type MessageKey } from "@/lib/i18n";
import { ideaStageLabel, isIdeaStage, targetGroupLabel } from "@/lib/labels";
import { NO_GROUP, trends } from "@/server/admin/data";
import { routeModeLabel } from "@/server/admin/labels";

export const metadata = { title: t("admin.trends.title") };

const groupLabel = (code: string) => (code === NO_GROUP ? t("admin.trends.noGroup") : targetGroupLabel(code));

/** The views of the trends, a second row of tabs: one address each (?widok=), so a view can be bookmarked or sent. */
const VIEWS = [
  { key: "potrzeby", label: "admin.trends.group.needs", lead: "admin.trends.group.needsLead" },
  { key: "pomysly", label: "admin.trends.group.ideas", lead: "admin.trends.group.ideasLead" },
  { key: "drogi", label: "admin.trends.group.routes", lead: "admin.trends.group.routesLead" },
] as const satisfies readonly { key: string; label: MessageKey; lead: MessageKey }[];

type View = (typeof VIEWS)[number]["key"];

/**
 * Module II, the part only the administrator sees: the needs gathered by
 * the tool, aggregated by area, place and week, with the ideas and the
 * evaluations and the routes beside them, so ROPS can set the topics of
 * the next call. Split into three views under the "Trendy" tab. The
 * questions by group lead to the questions themselves. The demonstration
 * data, when the store holds it, always counts.
 */
export default async function AdminTrendsPage({ searchParams }: PageProps<"/admin/trends">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const query = await searchParams;
  const view: View = VIEWS.find((item) => item.key === query.widok)?.key ?? "potrzeby";
  const current = VIEWS.find((item) => item.key === view)!;
  const data = await trends();
  const empty = t("admin.trends.empty");

  return (
    <AdminShell session={session} current="trends" title={t("admin.trends.title")} lead={t("admin.trends.lead")}>
      <nav aria-label={t("admin.trends.views")} className="border-b border-border">
        <ul className="flex flex-wrap gap-x-6">
          {VIEWS.map((item) => (
            <li key={item.key}>
              <Link
                scroll={false}
                href={`/rops/trendy?widok=${item.key}`}
                aria-current={item.key === view ? "page" : undefined}
                className="inline-flex min-h-11 items-center aria-[current=page]:font-bold aria-[current=page]:no-underline aria-[current=page]:shadow-[inset_0_-4px_0_var(--primary)]"
              >
                {t(item.label)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p>{t(current.lead)}</p>
      <div className="grid gap-5 @4xl:grid-cols-2">
        {view === "potrzeby" && (
          <>
          <div className="grid content-start gap-2">
            <BarTable
              caption={t("admin.trends.questionsByGroup")}
              keyHeader={t("admin.trends.group")}
              rows={data.questionsByGroup.map((row) => ({
                label: groupLabel(row.key),
                count: row.count,
                href: `/rops/trendy/pytania?grupa=${encodeURIComponent(row.key)}`,
              }))}
              empty={empty}
            />
            <p className="text-muted-foreground">
              {t("admin.trends.questionsNote", { count: data.totals.questions })}{" "}
              <Link href="/rops/trendy/pytania">{t("admin.trends.allQuestions")}</Link>
            </p>
          </div>
          <BarTable
            caption={t("admin.trends.needsByGroup")}
            keyHeader={t("admin.trends.group")}
            rows={data.needsByGroup.map((row) => ({ label: groupLabel(row.key), count: row.count }))}
            empty={empty}
          />
          <BarTable
            caption={t("admin.trends.needsByPowiat")}
            keyHeader={t("admin.trends.powiat")}
            rows={data.needsByPowiat.map((row) => ({ label: row.key === "bez-miejsca" ? t("admin.trends.noPlace") : row.key, count: row.count }))}
            empty={empty}
          />
          <BarTable
            caption={t("admin.trends.needsByWeek")}
            keyHeader={t("admin.trends.week")}
            rows={data.needsByWeek.map((row) => ({ label: t("admin.trends.weekOf", { date: formatDate(row.key) }), count: row.count }))}
            empty={empty}
          />
          </>
        )}
        {view === "pomysly" && (
          <>
          <BarTable
            caption={t("admin.trends.ideasByGroup")}
            keyHeader={t("admin.trends.group")}
            rows={data.ideasByGroup.map((row) => ({ label: groupLabel(row.key), count: row.count }))}
            empty={empty}
          />
          <BarTable
            caption={t("admin.trends.ideasByStage")}
            keyHeader={t("card.stage")}
            rows={data.ideasByStage.map((row) => ({ label: isIdeaStage(row.key) ? ideaStageLabel(row.key as IdeaStage) : row.key, count: row.count }))}
            empty={empty}
          />
          <BarTable
            caption={t("admin.trends.rated")}
            keyHeader={t("admin.trends.innovation")}
            rows={data.rated.map((row) => ({
              label: getInnovation(row.id)?.title ?? row.id,
              count: row.ratings + row.testers,
              extra: t("admin.trends.ratedExtra", {
                average: row.average.toLocaleString("pl-PL", { maximumFractionDigits: 1 }),
                ratings: row.ratings,
                testers: row.testers,
              }),
            }))}
            empty={empty}
          />
          </>
        )}
        {view === "drogi" && (
          <>
          <BarTable
            caption={t("admin.trends.routesByMode")}
            keyHeader={t("admin.trends.mode")}
            rows={data.routesByMode.map((row) => ({ label: routeModeLabel(row.key), count: row.count }))}
            empty={empty}
          />
          <BarTable
            caption={t("admin.trends.topRecommended")}
            keyHeader={t("admin.trends.innovation")}
            rows={data.topRecommended.map((row) => ({ label: getInnovation(row.key)?.title ?? row.key, count: row.count }))}
            empty={empty}
          />
          </>
        )}
      </div>
    </AdminShell>
  );
}
