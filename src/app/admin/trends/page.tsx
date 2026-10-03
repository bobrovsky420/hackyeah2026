import Link from "next/link";
import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell } from "@/components/admin/admin-shell";
import { DataFilter } from "@/components/admin/data-filter";
import { BarTable } from "@/components/admin/bar-table";
import { getInnovation } from "@/lib/catalogue";
import type { IdeaStage } from "@/lib/contracts";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { ideaStageLabel, isIdeaStage, targetGroupLabel } from "@/lib/labels";
import { demoCount, NO_GROUP, REAL_ONLY, trends } from "@/server/admin/data";
import { routeModeLabel } from "@/server/admin/labels";

export const metadata = { title: t("admin.trends.title") };

const groupLabel = (code: string) => (code === NO_GROUP ? t("admin.trends.noGroup") : targetGroupLabel(code));

/**
 * Module II, the part only the administrator sees: the needs gathered by
 * the tool, aggregated by area, place and week, with the ideas and the
 * evaluations beside them, so ROPS can set the topics of the next call.
 * The questions by group lead to the questions themselves. While the store
 * holds the demonstration data, the numbers can leave it out.
 */
export default async function AdminTrendsPage({ searchParams }: PageProps<"/admin/trends">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const realOnly = (await searchParams).dane === REAL_ONLY;
  const [data, demo] = await Promise.all([trends(undefined, { realOnly }), demoCount()]);
  const empty = t("admin.trends.empty");
  const real = realOnly ? `dane=${REAL_ONLY}` : "";

  return (
    <AdminShell session={session} current="trends" title={t("admin.trends.title")} lead={t("admin.trends.lead")}>
      {demo > 0 && <DataFilter realOnly={realOnly} />}
      <div className="grid gap-10 @4xl:grid-cols-2">
        <div className="grid content-start gap-2">
          <BarTable
            caption={t("admin.trends.questionsByGroup")}
            keyHeader={t("admin.trends.group")}
            rows={data.questionsByGroup.map((row) => ({
              label: groupLabel(row.key),
              count: row.count,
              href: `/rops/trendy/pytania?grupa=${encodeURIComponent(row.key)}${real && `&${real}`}`,
            }))}
            empty={empty}
          />
          <p className="text-muted-foreground">
            {t("admin.trends.questionsNote", { count: data.totals.questions })}{" "}
            <Link href={`/rops/trendy/pytania${real && `?${real}`}`}>{t("admin.trends.allQuestions")}</Link>
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
      </div>
    </AdminShell>
  );
}
