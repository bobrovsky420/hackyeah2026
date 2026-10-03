import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { Innovation } from "@/lib/contracts/catalogue";
import { t } from "@/lib/i18n";
import { indicatorLabel, targetGroupLabel } from "@/lib/labels";
import { indicatorFacts, indicatorValue, toMedian, type IndicatorKey } from "@/lib/mock/indicators";
import type { GminaPanel, GminaRow, RankedGmina } from "@/lib/server/map";
import { SUPPRESS_BELOW } from "@/lib/server/map";
import { formatNumber } from "@/lib/text";

/* The parts of S4 around the map: legend, table, the ranked list and the gmina panel. */

const IOSS = "https://obserwator.rops.krakow.pl/";
const MARK = "#f2a900";

/** A value against the Małopolska median in words (FR-7.4), never a place in a league. */
export function medianText(ratio: number): string {
  const percent = Math.round(Math.abs(ratio - 1) * 100);
  if (percent < 5) return t("map.median.near");
  return t(ratio > 1 ? "map.median.above" : "map.median.below", { percent });
}

/** Counts under five are not shown (FR-7.4). */
export function countText(count: number): string {
  if (count === 0) return "0";
  return count < SUPPRESS_BELOW ? t("map.suppressed") : String(count);
}

function valueText(key: IndicatorKey, value: number): string {
  return `${formatNumber(value)} ${indicatorLabel(key).unit}`;
}

export function MapLegend({ indicator, breaks, colors }: { indicator: IndicatorKey; breaks: number[]; colors: string[] }) {
  const facts = indicatorFacts(indicator);
  const label = indicatorLabel(indicator);
  const limits = [facts.min, ...breaks, facts.max];
  return (
    <div className="grid gap-2">
      <p className="font-bold">
        {t("map.legend.title", { name: label.name, unit: label.unit, year: facts.year })}
      </p>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
        {colors.map((color, index) => (
          <li key={color} className="flex items-center gap-2">
            <span aria-hidden className="inline-block size-5 shrink-0 rounded-sm border border-border" style={{ backgroundColor: color }} />
            {t(index < colors.length - 1 ? "map.legend.range" : "map.legend.rangeLast", {
              from: formatNumber(limits[index]),
              to: formatNumber(limits[index + 1]),
            })}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block size-5 shrink-0 rounded-sm border-2 border-dashed border-input bg-white" />
          {t("map.legend.noData")}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block size-4 shrink-0 rounded-full border-2 border-foreground" style={{ backgroundColor: MARK }} />
          {t("map.legend.implementations")}
        </li>
      </ul>
      <p>{t("map.legend.median", { median: formatNumber(facts.median), unit: label.unit })}</p>
    </div>
  );
}

/** The limits and the source of the shown indicator, printed next to it in both views (FR-7.4). */
export function IndicatorNote({ indicator }: { indicator: IndicatorKey }) {
  return (
    <div className="grid gap-1 text-muted-foreground">
      <p>
        <span className="font-bold">{t("map.caveat")}</span> {indicatorLabel(indicator).caveat}
      </p>
      <p>{t("map.attribution", { year: indicatorFacts(indicator).year })}</p>
    </div>
  );
}

/** The table view (FR-7.5): the same rows as the map, sortable by links, operable by keyboard. */
export function GminaTable({
  rows,
  indicator,
  sort,
  sortHref,
  gminaHref,
}: {
  rows: GminaRow[];
  indicator: IndicatorKey;
  sort: "nazwa" | "wartosc";
  sortHref: (sort: "nazwa" | "wartosc") => string;
  gminaHref: (terc: string) => string;
}) {
  const label = indicatorLabel(indicator);
  const header = "border-b-2 border-input bg-muted px-3 py-2 text-left align-bottom font-bold";
  const cell = "border-b border-border px-3 py-2 align-top";
  return (
    <div role="region" aria-labelledby="tabela-gmin" tabIndex={0} className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[44rem] border-collapse">
        <caption id="tabela-gmin" className="px-3 py-2 text-left font-bold">
          {t("map.table.caption", { name: label.name })}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={header} aria-sort={sort === "nazwa" ? "ascending" : undefined}>
              <Link href={sortHref("nazwa")}>{t("map.table.gmina")}</Link>
            </th>
            <th scope="col" className={header}>
              {t("map.table.powiat")}
            </th>
            <th scope="col" className={header} aria-sort={sort === "wartosc" ? "descending" : undefined}>
              <Link href={sortHref("wartosc")}>{t("map.table.value", { unit: label.unit })}</Link>
            </th>
            <th scope="col" className={header}>
              {t("map.table.median")}
            </th>
            <th scope="col" className={header}>
              {t("map.table.implementations")}
            </th>
            <th scope="col" className={header}>
              {t("map.table.needs")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.gmina.terc}>
              <th scope="row" className={`${cell} text-left font-normal`}>
                <Link href={gminaHref(row.gmina.terc)}>{row.gmina.name}</Link>
                <span className="block text-[0.9rem] text-muted-foreground">{row.gmina.kind}</span>
              </th>
              <td className={cell}>{row.gmina.powiat}</td>
              <td className={`${cell} tabular-nums`}>{row.value === null ? t("map.legend.noData") : formatNumber(row.value)}</td>
              <td className={cell}>{row.ratio === null ? "" : medianText(row.ratio)}</td>
              <td className={`${cell} tabular-nums`}>{row.implementations}</td>
              <td className={cell}>{countText(row.needs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * "Gdzie jest najbardziej potrzebna" (J4, FR-7.4): the gminas where the
 * need indicator stands highest against the median and the innovation does
 * not run yet, each with "Zaproponuj gminie".
 */
export function NeedRanking({
  innovation,
  indicators,
  group,
  ranked,
  runningIn,
  gminaHref,
}: {
  innovation: Innovation;
  indicators: IndicatorKey[];
  group: string | null;
  ranked: RankedGmina[];
  runningIn: { terc: string; name: string }[];
  gminaHref: (terc: string) => string;
}) {
  const names = indicators.map((key) => indicatorLabel(key).name);
  return (
    <section aria-labelledby="gdzie-potrzebna" className="grid gap-4">
      <div className="grid gap-1.5">
        <h2 id="gdzie-potrzebna" className="text-[1.3rem] font-bold">
          {t("map.ranking.title")}
        </h2>
        <p>
          {t("map.ranking.indicator", { names: names.join(t("map.ranking.and")) })}
          {group && ` ${t("map.ranking.why", { group: targetGroupLabel(group) })}`}
        </p>
        <p className="text-muted-foreground">{t("map.ranking.order")}</p>
      </div>
      <ul className="grid gap-3">
        {ranked.map((row) => (
          <li key={row.gmina.terc} className="grid gap-1.5 rounded-lg border border-border p-3">
            <h3 id={`gmina-${row.gmina.terc}`} className="font-bold">
              <Link href={gminaHref(row.gmina.terc)}>{row.gmina.name}</Link>
              <span className="block text-[0.9rem] font-normal text-muted-foreground">{t("map.powiat", { powiat: row.gmina.powiat })}</span>
            </h3>
            {row.values.map((item) => (
              <p key={item.key}>
                {indicatorLabel(item.key).name}: {valueText(item.key, item.value)}, {medianText(item.ratio)}
              </p>
            ))}
            <div className="no-print">
              <Link
                href={`/kontakt?innowacja=${innovation.id}&gmina=${row.gmina.terc}&cel=propozycja`}
                className={buttonVariants({ variant: "secondary" })}
              >
                {t("map.ranking.propose", { name: row.gmina.name })}
              </Link>
            </div>
          </li>
        ))}
      </ul>
      <p>
        {runningIn.length > 0
          ? t("map.ranking.running", { places: runningIn.map((gmina) => gmina.name).join(", ") })
          : t("map.ranking.notRunning")}
      </p>
    </section>
  );
}

/** The gmina panel of J5 (FR-7.4): indicators with year and source, innovations present, needs and peers. */
export function GminaPanelView({ panel, innovationHref }: { panel: GminaPanel; innovationHref: (id: string) => string }) {
  const { gmina } = panel;
  const keys: IndicatorKey[] = ["social-assistance", "ageing", "unemployment", "civic-density"];
  return (
    <section aria-labelledby="panel-gminy" className="grid gap-5">
      <div className="grid gap-1">
        <h2 id="panel-gminy" tabIndex={-1} className="text-[1.4rem] font-bold">
          {gmina.name}
        </h2>
        <p className="text-muted-foreground">{t("map.gmina.kind", { kind: gmina.kind, powiat: gmina.powiat })}</p>
      </div>

      <div className="grid gap-2">
        <h3 className="font-bold">{t("map.gmina.indicators")}</h3>
        <dl className="grid gap-2">
          {keys.map((key) => {
            const value = indicatorValue(gmina.terc, key);
            return (
              <div key={key}>
                <dt>{indicatorLabel(key).name}</dt>
                <dd className="font-bold">
                  {value === null
                    ? t("map.legend.noData")
                    : `${valueText(key, value)} (${indicatorFacts(key).year}), ${medianText(toMedian(value, key))}`}
                </dd>
              </div>
            );
          })}
        </dl>
        <p className="text-muted-foreground">{t("map.gmina.source")}</p>
      </div>

      <div className="grid gap-2">
        <h3 className="font-bold">{t("map.gmina.running")}</h3>
        {panel.running.length === 0 ? (
          <p>{t("map.gmina.noneRunning")}</p>
        ) : (
          <ul className="grid list-disc gap-1 pl-6">
            {panel.running.map(({ implementation, innovation }) => (
              <li key={implementation.id}>
                {innovation ? <Link href={innovationHref(innovation.id)}>{innovation.title}</Link> : implementation.innovation_id}
                {implementation.organisation && `, ${implementation.organisation}`}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p>
        <span className="font-bold">{t("map.gmina.needs")}</span> {countText(panel.needs)}
      </p>

      <div className="grid gap-2">
        <h3 className="font-bold">{t("map.gmina.peers")}</h3>
        {panel.peers.length === 0 ? (
          <p>{t("map.gmina.noPeers")}</p>
        ) : (
          <ul className="grid gap-3">
            {panel.peers.map((peer) => {
              const id = `sasiad-${peer.gmina.terc}-${peer.innovation.id}`;
              return (
                <li key={id} className="grid gap-1.5 rounded-lg border border-border p-3">
                  <p id={id}>{t("map.gmina.peer", { name: peer.gmina.name, km: peer.km, title: peer.innovation.title })}</p>
                  <div className="no-print">
                    <Link
                      href={`/kontakt?innowacja=${peer.innovation.id}&gmina=${peer.gmina.terc}&cel=polaczenie`}
                      className={buttonVariants({ variant: "secondary" })}
                      aria-describedby={id}
                    >
                      {t("map.gmina.connect")}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p>
        <a href={IOSS}>{t("map.gmina.ioss")}</a>
      </p>
    </section>
  );
}
