import Link from "next/link";
import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell } from "@/components/admin/admin-shell";
import { BarTable, type BarRow } from "@/components/admin/bar-table";
import { getInnovation } from "@/lib/catalogue";
import type { IdeaStage } from "@/lib/contracts";
import { formatDate, formatMonth } from "@/lib/dates";
import { t, type MessageKey } from "@/lib/i18n";
import { ideaStageLabel, isIdeaStage, targetGroupLabel } from "@/lib/labels";
import { addDays, NO_GROUP, NO_PLACE, TREND_RANGES, trends, type Tally, type TrendPeriod, type TrendRange } from "@/server/admin/data";
import { ideaFormCodes, ideaFormLabel, routeModeLabel, type IdeaForm } from "@/server/admin/labels";

export const metadata = { title: t("admin.trends.title") };

const isIdeaForm = (code: string): code is IdeaForm => (ideaFormCodes as string[]).includes(code);
const groupLabel = (code: string) => (code === NO_GROUP ? t("admin.trends.noGroup") : targetGroupLabel(code));

/** The views of the trends, a second row of tabs: one address each (?widok=), so a view can be bookmarked or sent. */
const VIEWS = [
  { key: "potrzeby", label: "admin.trends.group.needs", lead: "admin.trends.group.needsLead" },
  { key: "pomysly", label: "admin.trends.group.ideas", lead: "admin.trends.group.ideasLead" },
  { key: "drogi", label: "admin.trends.group.routes", lead: "admin.trends.group.routesLead" },
] as const satisfies readonly { key: string; label: MessageKey; lead: MessageKey }[];

type View = (typeof VIEWS)[number]["key"];

const rangeKey = (range: TrendRange) => `admin.trends.range.${range}` as MessageKey;

/*
 * The view and period links are not prefetched: under load a prefetch
 * taken at page load was reused for the click and showed the old period.
 */
const tabClass =
  "inline-flex min-h-11 items-center aria-[current=page]:font-bold aria-[current=page]:no-underline aria-[current=page]:shadow-[inset_0_-4px_0_var(--primary)]";

/** The address of the entries behind a bar: the filter, and the days when they are given. */
function behind(path: string, filter: Record<string, string>, days?: { from: string | null; to: string | null }): string {
  const params = new URLSearchParams(filter);
  if (days?.from) params.set("od", days.from);
  if (days?.to) params.set("do", days.to);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** The first and last day of a step of the timeline, cut to the period. */
function stepDays(key: string, period: TrendPeriod): { from: string; to: string } {
  let start = key;
  let end = addDays(key, 6);
  if (period.grain === "month") {
    const [year, month] = key.split("-").map(Number);
    start = `${key}-01`;
    end = addDays(new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10), -1);
  }
  return { from: period.from && start < period.from ? period.from : start, to: end > period.to ? period.to : end };
}

/**
 * Module II, the part only the administrator sees: the needs gathered by
 * the tool, aggregated by area, place and time, with the ideas and the
 * evaluations and the routes beside them, so ROPS can set the topics of
 * the next call. Three views under the "Trendy" tab and one period for
 * all of them (?okres=), compared with the period of the same length
 * before it. A bar leads to the entries it counts. The demonstration
 * data, when the store holds it, always counts.
 */
export default async function AdminTrendsPage({ searchParams }: PageProps<"/admin/trends">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const query = await searchParams;
  const view: View = VIEWS.find((item) => item.key === query.widok)?.key ?? "potrzeby";
  const range: TrendRange = TREND_RANGES.find((item) => item === query.okres) ?? "calosc";
  const current = VIEWS.find((item) => item.key === view)!;
  const data = await trends(undefined, range);
  const { period } = data;
  // The whole time needs no days in the address.
  const days = period.from ? { from: period.from, to: period.to } : undefined;
  const empty = t("admin.trends.empty");
  const changeNote = period.previous
    ? t("admin.trends.changeNote", { from: formatDate(period.previous.from), to: formatDate(period.previous.to) })
    : undefined;
  const address = (next: { widok?: View; okres?: TrendRange }) => {
    const params = new URLSearchParams({ widok: next.widok ?? view });
    const okres = next.okres ?? range;
    if (okres !== "calosc") params.set("okres", okres);
    return `/rops/trendy?${params}`;
  };
  const rows = (tallies: Tally[], label: (key: string) => string, href?: (key: string) => string): BarRow[] =>
    tallies.map((row) => ({ label: label(row.key), count: row.count, previous: row.previous, href: href?.(row.key) }));

  return (
    <AdminShell session={session} current="trends" title={t("admin.trends.title")} lead={t("admin.trends.lead")}>
      <nav aria-label={t("admin.trends.views")} className="border-b border-border">
        <ul className="flex flex-wrap gap-x-6">
          {VIEWS.map((item) => (
            <li key={item.key}>
              <Link scroll={false} prefetch={false} href={address({ widok: item.key })} aria-current={item.key === view ? "page" : undefined} className={tabClass}>
                {t(item.label)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-labelledby="okres-tytul" className="grid gap-1">
        <p id="okres-tytul" className="font-bold">
          {t("admin.trends.period")}
        </p>
        <ul className="flex flex-wrap gap-x-6">
          {TREND_RANGES.map((item) => (
            <li key={item}>
              <Link scroll={false} prefetch={false} href={address({ okres: item })} aria-current={item === range ? "page" : undefined} className={tabClass}>
                {t(rangeKey(item))}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p>
        {t(current.lead)}{" "}
        {period.from
          ? t("admin.trends.periodNote", { from: formatDate(period.from), to: formatDate(period.to) })
          : t("admin.trends.periodAll", { to: formatDate(period.to) })}
      </p>
      <div className="grid gap-5 @4xl:grid-cols-2">
        {view === "potrzeby" && (
          <>
            <div className="grid content-start gap-2">
              <BarTable
                journey="ask"
                caption={t("admin.trends.questionsByGroup")}
                keyHeader={t("admin.trends.group")}
                rows={rows(data.questionsByGroup, groupLabel, (key) => behind("/rops/trendy/pytania", { grupa: key }, days))}
                empty={empty}
                changeNote={changeNote}
              />
              <p className="text-muted-foreground">
                {t("admin.trends.questionsNote", { count: data.totals.questions })}{" "}
                <Link href={behind("/rops/trendy/pytania", {}, days)}>{t("admin.trends.allQuestions")}</Link>
              </p>
            </div>
            <BarTable
              journey="need"
              caption={t("admin.trends.needsByGroup")}
              keyHeader={t("admin.trends.group")}
              rows={rows(data.needsByGroup, groupLabel, (key) => behind("/rops/potrzeby", { kategoria: key }, days))}
              empty={empty}
              changeNote={changeNote}
            />
            <BarTable
              journey="need"
              caption={t("admin.trends.needsByPowiat")}
              keyHeader={t("admin.trends.powiat")}
              rows={rows(
                data.needsByPowiat,
                (key) => (key === NO_PLACE ? t("admin.trends.noPlace") : key),
                (key) => behind("/rops/potrzeby", { powiat: key }, days),
              )}
              empty={empty}
              changeNote={changeNote}
            />
            <BarTable
              journey="need"
              caption={t(period.grain === "week" ? "admin.trends.needsByWeek" : "admin.trends.needsByMonth")}
              keyHeader={t(period.grain === "week" ? "admin.trends.week" : "admin.trends.month")}
              rows={data.needsOverTime.map((row) => ({
                label: period.grain === "week" ? t("admin.trends.weekOf", { date: formatDate(row.key) }) : formatMonth(row.key),
                count: row.count,
                href: row.count > 0 ? behind("/rops/potrzeby", {}, stepDays(row.key, period)) : undefined,
              }))}
              empty={empty}
            />
          </>
        )}
        {view === "pomysly" && (
          <>
            <BarTable
              journey="idea"
              caption={t("admin.trends.ideasByGroup")}
              keyHeader={t("admin.trends.group")}
              rows={rows(data.ideasByGroup, groupLabel, (key) => behind("/rops/pomysly", { grupa: key }, days))}
              empty={empty}
              changeNote={changeNote}
            />
            <BarTable
              journey="idea"
              caption={t("admin.trends.ideasByStage")}
              keyHeader={t("card.stage")}
              rows={rows(
                data.ideasByStage,
                (key) => (isIdeaStage(key) ? ideaStageLabel(key as IdeaStage) : key),
                (key) => behind("/rops/pomysly", { etap: key }, days),
              )}
              empty={empty}
              changeNote={changeNote}
            />
            <BarTable
              journey="idea"
              caption={t("admin.trends.ideasByForm")}
              keyHeader={t("admin.ideas.formField")}
              rows={rows(
                data.ideasByForm,
                (key) => (isIdeaForm(key) ? ideaFormLabel(key) : key),
                (key) => behind("/rops/pomysly", { forma: key }, days),
              )}
              empty={empty}
              changeNote={changeNote}
            />
            <BarTable
              caption={t("admin.trends.rated")}
              keyHeader={t("admin.trends.innovation")}
              rows={data.rated.map((row) => ({
                label: getInnovation(row.id)?.title ?? row.id,
                count: row.ratings + row.testers,
                href: `/rops/innowacje/${row.id}`,
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
              journey="need"
              caption={t("admin.trends.routesByMode")}
              keyHeader={t("admin.trends.mode")}
              rows={rows(data.routesByMode, (key) => routeModeLabel(key))}
              empty={empty}
              changeNote={changeNote}
            />
            <BarTable
              journey="need"
              caption={t("admin.trends.topRecommended")}
              keyHeader={t("admin.trends.innovation")}
              rows={rows(
                data.topRecommended,
                (key) => getInnovation(key)?.title ?? key,
                (key) => `/rops/innowacje/${key}`,
              )}
              empty={empty}
              changeNote={changeNote}
            />
          </>
        )}
      </div>
    </AdminShell>
  );
}
