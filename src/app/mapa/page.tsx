import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { GminaMap, type MapSettings } from "@/components/map/gmina-map";
import { GminaPanelView, GminaTable, IndicatorNote, MapLegend, NeedRanking } from "@/components/map/map-parts";
import { FocusOnMount } from "@/components/route/focus-on-mount";
import { Button, buttonVariants } from "@/components/ui/button";
import { controlClass } from "@/components/ui/field";
import { t } from "@/lib/i18n";
import { indicatorLabel } from "@/lib/labels";
import { getGmina, getInnovation, gminy } from "@/lib/mock/data";
import {
  classBreaks,
  classIndex,
  indicatorFromSlug,
  indicatorKeys,
  indicatorSlugs,
  valuesOf,
  type IndicatorKey,
} from "@/lib/mock/indicators";
import { gminaPanel, gminaRows, implementationMarks, MAP_COLORS, malopolskaBounds, whereMostNeeded } from "@/lib/server/map";
import { formatNumber } from "@/lib/text";
import { cn } from "@/lib/utils";

type View = "mapa" | "tabela" | null;
type Sort = "nazwa" | "wartosc";

interface MapState {
  innowacja?: string;
  gmina?: string;
  wskaznik?: IndicatorKey | null;
  widok?: View;
  sort?: Sort;
}

/** Every view of S4 has an address, so it works with links, the back button and without script. */
function mapHref(state: MapState): string {
  const params = new URLSearchParams();
  if (state.innowacja) params.set("innowacja", state.innowacja);
  if (state.gmina) params.set("gmina", state.gmina);
  if (state.wskaznik) params.set("wskaznik", indicatorSlugs[state.wskaznik]);
  if (state.widok) params.set("widok", state.widok);
  if (state.sort === "wartosc") params.set("sort", state.sort);
  const search = params.toString();
  return search ? `/mapa?${search}` : "/mapa";
}

function queryText(query: Record<string, string | string[] | undefined>, key: string): string | null {
  const value = query[key];
  return typeof value === "string" ? value : null;
}

export async function generateMetadata({ searchParams }: PageProps<"/mapa">): Promise<Metadata> {
  const query = await searchParams;
  const innovation = getInnovation(queryText(query, "innowacja") ?? "");
  const gmina = getGmina(queryText(query, "gmina"));
  if (gmina) return { title: t("map.meta.gmina", { name: gmina.name }) };
  if (innovation) return { title: t("map.innovation.title", { title: innovation.title }) };
  return { title: t("map.meta.title") };
}

/** S4 (FR-7.1 to FR-7.6): explore, "Gdzie jest najbardziej potrzebna" (J4) and the gmina panel (J5). */
export default async function MapPage({ searchParams }: PageProps<"/mapa">) {
  const query = await searchParams;
  const innovation = getInnovation(queryText(query, "innowacja") ?? "");
  const gmina = getGmina(queryText(query, "gmina"));
  const ranking = innovation ? whereMostNeeded(innovation) : null;
  const panel = gmina ? gminaPanel(gmina.terc) : null;
  const chosen = indicatorFromSlug(queryText(query, "wskaznik"));
  const indicator: IndicatorKey = chosen ?? ranking?.indicators[0] ?? "social-assistance";
  const widok = queryText(query, "widok");
  const view: View = widok === "mapa" || widok === "tabela" ? widok : null;
  const sort: Sort = queryText(query, "sort") === "wartosc" ? "wartosc" : "nazwa";

  const state: MapState = { innowacja: innovation?.id, gmina: gmina?.terc, wskaznik: chosen, widok: view, sort };
  const tableHref = mapHref({ ...state, widok: "tabela" });
  const mapViewHref = mapHref({ ...state, widok: "mapa" });
  const gminaHref = (terc: string) => mapHref({ ...state, gmina: terc });
  const base = mapHref({ ...state, gmina: undefined });
  const label = indicatorLabel(indicator);

  const values = valuesOf(indicator);
  const breaks = classBreaks(indicator);
  const settings: MapSettings = {
    label: t("map.canvasLabel", { name: label.name }),
    bounds: malopolskaBounds,
    colors: MAP_COLORS,
    classes: Object.fromEntries(Object.entries(values).map(([terc, value]) => [terc, classIndex(value, breaks)])),
    tooltips: Object.fromEntries(
      gminy.map((item) => [
        item.terc,
        values[item.terc] === undefined
          ? `${item.name}: ${t("map.legend.noData")}`
          : `${item.name}: ${formatNumber(values[item.terc])} ${label.unit}`,
      ]),
    ),
    marks: implementationMarks(innovation?.id),
    selected: gmina?.terc ?? null,
    highlighted: panel ? [] : (ranking?.ranked.map((row) => row.gmina.terc) ?? []),
  };

  const title = innovation ? t("map.innovation.title", { title: innovation.title }) : t("map.title");
  const lead = innovation ? t("map.innovation.lead") : t("map.lead");

  return (
    <div className="grid gap-8">
      <FocusOnMount key={gmina?.terc ?? "mapa"} targetId={panel ? "panel-gminy" : "naglowek-mapy"} />
      <header className="grid max-w-[48rem] gap-3">
        {innovation && (
          <Link href={`/innowacja/${innovation.id}`} className="no-print inline-flex min-h-11 items-center gap-2 justify-self-start font-bold">
            <ArrowLeft aria-hidden className="size-5" />
            {t("map.backToInnovation")}
          </Link>
        )}
        <h1 id="naglowek-mapy" tabIndex={-1} className="text-[1.75rem] leading-tight font-bold @3xl:text-[2.2rem]">
          {title}
        </h1>
        <p className="text-[1.1rem]">{lead}</p>
      </header>

      <form method="get" action="/mapa" className="no-print flex flex-wrap items-end gap-3">
        {innovation && <input type="hidden" name="innowacja" value={innovation.id} />}
        {gmina && <input type="hidden" name="gmina" value={gmina.terc} />}
        {view && <input type="hidden" name="widok" value={view} />}
        <div className="grid gap-1">
          <label htmlFor="wskaznik" className="font-bold">
            {t("map.indicator.label")}
          </label>
          <select id="wskaznik" name="wskaznik" defaultValue={indicatorSlugs[indicator]} className={controlClass}>
            {indicatorKeys.map((key) => (
              <option key={key} value={indicatorSlugs[key]}>
                {indicatorLabel(key).name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">
          {t("map.indicator.submit")}
        </Button>
      </form>

      {/* minmax(0, 1fr): the wide table scrolls in its own region, never the page (WCAG 1.4.10). */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 @4xl:grid-cols-[minmax(0,1fr)_22rem] @4xl:items-start">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @4xl:col-start-2 @4xl:row-start-1">
          {panel && innovation && (
            <Link href={base} className="no-print inline-flex min-h-11 items-center gap-2 justify-self-start font-bold">
              <ArrowLeft aria-hidden className="size-5" />
              {t("map.backToRanking")}
            </Link>
          )}
          {panel ? (
            <GminaPanelView panel={panel} innovationHref={(id) => `/innowacja/${id}`} />
          ) : ranking && innovation ? (
            <NeedRanking
              innovation={innovation}
              indicators={ranking.indicators}
              group={ranking.group}
              ranked={ranking.ranked}
              runningIn={ranking.runningIn}
              gminaHref={gminaHref}
            />
          ) : (
            <section aria-labelledby="jak-czytac" className="grid gap-2 rounded-lg border border-border bg-muted p-4">
              <h2 id="jak-czytac" className="text-[1.2rem] font-bold">
                {t("map.explore.title")}
              </h2>
              <p>{t("map.explore.p1")}</p>
              <p>{t("map.explore.p2")}</p>
            </section>
          )}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @4xl:col-start-1 @4xl:row-start-1">
          <div className="no-print flex flex-wrap gap-3">
            <Link
              href={tableHref}
              className={cn(
                buttonVariants({ variant: "secondary" }),
                view === "tabela" ? "hidden" : view === "mapa" ? "" : "hidden @4xl:inline-flex",
              )}
            >
              {t("map.showTable")}
            </Link>
            <Link
              href={mapViewHref}
              className={cn(buttonVariants({ variant: "secondary" }), view === "mapa" ? "hidden" : view === "tabela" ? "" : "@4xl:hidden")}
            >
              {t("map.showMap")}
            </Link>
          </div>
          <div className={cn(view === "tabela" ? "hidden" : view === "mapa" ? "grid gap-4" : "hidden @4xl:grid @4xl:gap-4")}>
            <GminaMap settings={settings} hrefBase={`${base}${base.includes("?") ? "&" : "?"}gmina=`} tableHref={tableHref} />
            <MapLegend indicator={indicator} breaks={breaks} colors={MAP_COLORS} />
          </div>
          <div className={cn(view === "mapa" ? "hidden" : view === "tabela" ? "block" : "@4xl:hidden")}>
            <GminaTable
              rows={gminaRows(indicator, sort)}
              indicator={indicator}
              sort={sort}
              sortHref={(next) => mapHref({ ...state, sort: next })}
              gminaHref={gminaHref}
            />
          </div>
          <IndicatorNote indicator={indicator} />
        </div>
      </div>
    </div>
  );
}
