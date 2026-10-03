import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell } from "@/components/admin/admin-shell";
import { BarList, StatTile, TrendCard, TrendGroup, WeekColumns, type TrendRow } from "@/components/admin/trends";
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

const percent = (count: number, total: number) => (total > 0 ? Math.round((count / total) * 100) : 0);

/** The trend's headline in words: what leads, and how much of the whole it is. */
function topHeadline(rows: TrendRow[], total?: number): string | null {
  const [top] = rows;
  if (!top) return null;
  return total
    ? t("admin.trends.headline.share", { label: top.label, count: top.count, total, share: percent(top.count, total) })
    : t("admin.trends.headline.top", { label: top.label, count: top.count });
}

const tooltip = (row: TrendRow, share: number | null) =>
  share === null ? t("admin.trends.tooltip.count", { label: row.label, count: row.count }) : t("admin.trends.tooltip.share", { label: row.label, count: row.count, share });

/**
 * Module II, the part only the administrator sees: the needs gathered by
 * the tool, aggregated by area, place and week, with the ideas and the
 * evaluations and the routes beside them, so ROPS can set the topics of
 * the next call. Three groups, each with its own colour, one card per
 * trend with its headline in words.
 */
export default async function AdminTrendsPage() {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const data = await trends();
  const empty = t("admin.trends.empty");
  const count = t("admin.trends.count");

  const needsByGroup = data.needsByGroup.map((row) => ({ label: groupLabel(row.key), count: row.count }));
  const needsByPowiat = data.needsByPowiat.map((row) => ({ label: row.key === "bez-miejsca" ? t("admin.trends.noPlace") : row.key, count: row.count }));
  const weeks = data.needsByWeek.map((row) => ({
    label: t("admin.trends.weekOf", { date: formatDate(row.key) }),
    short: formatDate(row.key).split(".").slice(0, 2).join("."),
    count: row.count,
  }));
  const ideasByGroup = data.ideasByGroup.map((row) => ({ label: groupLabel(row.key), count: row.count }));
  const ideasByStage = data.ideasByStage.map((row) => ({ label: isIdeaStage(row.key) ? ideaStageLabel(row.key as IdeaStage) : row.key, count: row.count }));
  const rated = data.rated.map((row) => ({
    label: getInnovation(row.id)?.title ?? row.id,
    count: row.ratings + row.testers,
    extra: t("admin.trends.ratedExtra", {
      average: row.average.toLocaleString("pl-PL", { maximumFractionDigits: 1 }),
      ratings: row.ratings,
      testers: row.testers,
    }),
  }));
  const routesByMode = data.routesByMode.map((row) => ({ label: t(MODE_KEYS[row.key as Route["mode"]] ?? "admin.trends.mode.route"), count: row.count }));
  const topRecommended = data.topRecommended.map((row) => ({ label: getInnovation(row.key)?.title ?? row.key, count: row.count }));

  const lastWeek = weeks.at(-1);
  const weekBefore = weeks.at(-2);
  const weekHeadline = lastWeek
    ? weekBefore
      ? t("admin.trends.headline.week", { count: lastWeek.count, before: weekBefore.count })
      : t("admin.trends.headline.weekOnly", { count: lastWeek.count })
    : null;

  return (
    <AdminShell session={session} current="trends" title={t("admin.trends.title")} lead={t("admin.trends.lead")}>
      <dl aria-label={t("admin.trends.totals")} className="grid gap-3 @xl:grid-cols-3 @4xl:grid-cols-5">
        <StatTile tone="needs" label={t("admin.start.needs")} value={data.totals.needs} />
        <StatTile tone="ideas" label={t("admin.start.ideas")} value={data.totals.ideas} />
        <StatTile tone="ideas" label={t("admin.start.evaluations")} value={data.totals.evaluations} />
        <StatTile tone="routes" label={t("admin.start.routes")} value={data.totals.routes} />
        <StatTile tone="routes" label={t("admin.start.contacts")} value={data.totals.contacts} />
      </dl>

      <TrendGroup tone="needs" id="trendy-potrzeby" title={t("admin.trends.group.needs")} lead={t("admin.trends.group.needsLead")}>
        <TrendCard id="potrzeby-grupy" title={t("admin.trends.needsByGroup")} headline={topHeadline(needsByGroup, data.totals.needs)}>
          <BarList tone="needs" caption={t("admin.trends.needsByGroup")} keyHeader={t("admin.trends.group")} countHeader={count} rows={needsByGroup} total={data.totals.needs} empty={empty} tooltip={tooltip} />
        </TrendCard>
        <TrendCard id="potrzeby-powiaty" title={t("admin.trends.needsByPowiat")} headline={topHeadline(needsByPowiat, data.totals.needs)}>
          <BarList tone="needs" caption={t("admin.trends.needsByPowiat")} keyHeader={t("admin.trends.powiat")} countHeader={count} rows={needsByPowiat} total={data.totals.needs} empty={empty} tooltip={tooltip} />
        </TrendCard>
        <TrendCard id="potrzeby-tygodnie" title={t("admin.trends.needsByWeek")} headline={weekHeadline} wide>
          <WeekColumns
            tone="needs"
            caption={t("admin.trends.needsByWeek")}
            keyHeader={t("admin.trends.week")}
            countHeader={count}
            rows={weeks}
            empty={empty}
            tooltip={(row) => t("admin.trends.tooltip.count", { label: row.label, count: row.count })}
          />
        </TrendCard>
      </TrendGroup>

      <TrendGroup tone="ideas" id="trendy-pomysly" title={t("admin.trends.group.ideas")} lead={t("admin.trends.group.ideasLead")}>
        <TrendCard id="pomysly-grupy" title={t("admin.trends.ideasByGroup")} headline={topHeadline(ideasByGroup, data.totals.ideas)}>
          <BarList tone="ideas" caption={t("admin.trends.ideasByGroup")} keyHeader={t("admin.trends.group")} countHeader={count} rows={ideasByGroup} total={data.totals.ideas} empty={empty} tooltip={tooltip} />
        </TrendCard>
        <TrendCard id="pomysly-etapy" title={t("admin.trends.ideasByStage")} headline={topHeadline(ideasByStage, data.totals.ideas)}>
          <BarList tone="ideas" caption={t("admin.trends.ideasByStage")} keyHeader={t("card.stage")} countHeader={count} rows={ideasByStage} total={data.totals.ideas} empty={empty} tooltip={tooltip} />
        </TrendCard>
        <TrendCard id="oceniane" title={t("admin.trends.rated")} headline={topHeadline(rated)} wide>
          <BarList tone="ideas" caption={t("admin.trends.rated")} keyHeader={t("admin.trends.innovation")} countHeader={count} rows={rated} empty={empty} tooltip={tooltip} />
        </TrendCard>
      </TrendGroup>

      <TrendGroup tone="routes" id="trendy-drogi" title={t("admin.trends.group.routes")} lead={t("admin.trends.group.routesLead")}>
        <TrendCard id="drogi-wyniki" title={t("admin.trends.routesByMode")} headline={topHeadline(routesByMode, data.totals.routes)}>
          <BarList tone="routes" caption={t("admin.trends.routesByMode")} keyHeader={t("admin.trends.mode")} countHeader={count} rows={routesByMode} total={data.totals.routes} empty={empty} tooltip={tooltip} />
        </TrendCard>
        <TrendCard id="proponowane" title={t("admin.trends.topRecommended")} headline={topHeadline(topRecommended)}>
          <BarList tone="routes" caption={t("admin.trends.topRecommended")} keyHeader={t("admin.trends.innovation")} countHeader={count} rows={topRecommended} empty={empty} tooltip={tooltip} />
        </TrendCard>
      </TrendGroup>
    </AdminShell>
  );
}
