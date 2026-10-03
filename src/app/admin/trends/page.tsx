import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell } from "@/components/admin/admin-shell";
import { BarTable } from "@/components/admin/bar-table";
import { getInnovation } from "@/lib/catalogue";
import type { IdeaStage, Route } from "@/lib/contracts";
import { formatDate } from "@/lib/dates";
import { t, type MessageKey } from "@/lib/i18n";
import { ideaStageLabel, isIdeaStage, targetGroupLabel } from "@/lib/labels";
import { trends } from "@/server/admin/data";

export const metadata = { title: t("admin.trends.title") };

const groupLabel = (code: string) => (code === "bez-grupy" ? t("admin.trends.noGroup") : targetGroupLabel(code));
const MODE_KEYS: Record<Route["mode"], MessageKey> = {
  route: "admin.trends.mode.route",
  partial: "admin.trends.mode.partial",
  none: "admin.trends.mode.none",
  redirected: "admin.trends.mode.redirected",
  declined: "admin.trends.mode.declined",
  off_topic: "admin.trends.mode.off_topic",
};

/**
 * Module II, the part only the administrator sees: the needs gathered by
 * the tool, aggregated by area, place and week, with the ideas and the
 * evaluations beside them, so ROPS can set the topics of the next call.
 */
export default async function AdminTrendsPage() {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const data = await trends();
  const empty = t("admin.trends.empty");

  return (
    <AdminShell session={session} current="trends" title={t("admin.trends.title")} lead={t("admin.trends.lead")}>
      <div className="grid gap-10 @4xl:grid-cols-2">
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
          rows={data.routesByMode.map((row) => ({ label: t(MODE_KEYS[row.key as Route["mode"]] ?? "admin.trends.mode.route"), count: row.count }))}
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
