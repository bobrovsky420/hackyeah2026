import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ConsolePage, DataTable, Empty, Td, Th } from "@/components/console/console-parts";
import { contactStatuses } from "@/lib/console";
import type { RouteMode } from "@/lib/contracts";
import { formatDateTime } from "@/lib/dates";
import { t, type MessageKey } from "@/lib/i18n";
import { targetGroupLabel } from "@/lib/labels";
import { isAuthenticated } from "@/server/console/auth";
import { loadStats, type ConsoleStats } from "@/server/console/stats";
import { repository } from "@/server/db";

export const metadata: Metadata = { title: t("console.stats.title") };

const modeKeys: Record<RouteMode, MessageKey> = {
  route: "console.stats.mode.route",
  partial: "console.stats.mode.partial",
  none: "console.stats.mode.none",
  redirected: "console.stats.mode.redirected",
  declined: "console.stats.mode.declined",
  off_topic: "console.stats.mode.offTopic",
};

const numberFormat = new Intl.NumberFormat("pl-PL");
const secondsFormat = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const costFormat = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

const count = (value: number) => numberFormat.format(value);
const seconds = (ms: number | null) =>
  ms === null ? t("console.stats.noData") : t("console.stats.seconds", { value: secondsFormat.format(ms / 1000) });

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <h2 id={id} className="text-[1.3rem] font-bold">
        {title}
      </h2>
      {note && <p className="text-muted-foreground">{note}</p>}
      {children}
    </section>
  );
}

/** Label and value pairs; numbers are formatted the Polish way. */
function Counts({ rows }: { rows: [string, number | string][] }) {
  return (
    <dl className="grid gap-x-8 gap-y-2 rounded-lg border border-border p-4 @xl:grid-cols-[max-content_max-content]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt>{label}</dt>
          <dd className="font-bold tabular-nums">{typeof value === "number" ? count(value) : value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A number cell, right-aligned for comparison. */
function Num({ children }: { children: ReactNode }) {
  return <Td className="text-right tabular-nums">{children}</Td>;
}

/** A two-column table: a label per row and its count. */
function CountTable({ caption, labelHeading, rows }: { caption: string; labelHeading: string; rows: { key: string; label: ReactNode; count: number }[] }) {
  if (rows.length === 0) return <Empty>{t("console.stats.empty")}</Empty>;
  return (
    <DataTable caption={caption} minWidth="min-w-[20rem]">
      <thead>
        <tr>
          <Th>{labelHeading}</Th>
          <Th>{t("console.stats.col.count")}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <Td>{row.label}</Td>
            <Num>{count(row.count)}</Num>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function ModelCalls({ llm }: { llm: ConsoleStats["llm"] }) {
  if (llm.providers.length === 0) return <Empty>{t("console.stats.empty")}</Empty>;
  const cells = (row: ConsoleStats["llm"]["total"]) => (
    <>
      <Num>{count(row.calls)}</Num>
      <Num>{count(row.failures)}</Num>
      <Num>{count(row.replayed)}</Num>
      <Num>{count(row.input_tokens)}</Num>
      <Num>{count(row.output_tokens)}</Num>
      <Num>{count(row.cache_read_tokens)}</Num>
      <Num>{costFormat.format(row.cost_usd)}</Num>
    </>
  );
  return (
    <DataTable caption={t("console.stats.llm")}>
      <thead>
        <tr>
          <Th>{t("console.stats.llm.provider")}</Th>
          <Th>{t("console.stats.llm.model")}</Th>
          <Th>{t("console.stats.llm.calls")}</Th>
          <Th>{t("console.stats.llm.failures")}</Th>
          <Th>{t("console.stats.llm.replayed")}</Th>
          <Th>{t("console.stats.llm.input")}</Th>
          <Th>{t("console.stats.llm.output")}</Th>
          <Th>{t("console.stats.llm.cacheRead")}</Th>
          <Th>{t("console.stats.llm.cost")}</Th>
        </tr>
      </thead>
      <tbody>
        {llm.providers.map((row) => (
          <tr key={`${row.provider}|${row.model}`}>
            <Td>{row.provider}</Td>
            <Td className="font-mono">{row.model}</Td>
            {cells(row)}
          </tr>
        ))}
        <tr className="font-bold">
          <Td>{t("console.stats.total")}</Td>
          <Td>{""}</Td>
          {cells(llm.total)}
        </tr>
      </tbody>
    </DataTable>
  );
}

/** FR-9.3, FR-10.2 and FR-10.3: the counters and the statistics, without cookies and without personal data. */
export default async function StatsPage() {
  if (!(await isAuthenticated())) return null;
  const stats = await loadStats(repository());
  const { events } = stats;

  return (
    <ConsolePage title={t("console.stats.title")} lead={t("console.stats.lead", { date: formatDateTime(stats.since) })}>
      <Section id="miary-drogi" title={t("console.stats.routes")}>
        <Counts rows={Object.entries(stats.routes_by_mode).map(([mode, value]) => [t(modeKeys[mode as RouteMode]), value])} />
      </Section>

      <Section id="miary-zdarzenia" title={t("console.stats.events")}>
        <Counts
          rows={[
            [t("console.stats.contacts"), events.contact_requested],
            [t("console.stats.needs"), events.need_saved],
            [t("console.stats.briefs"), events.brief_generated],
            [t("console.stats.readiness"), events.readiness_registered],
            [t("console.stats.reports"), events.content_reported],
            [t("console.stats.feedback.yes"), events.feedback_given.tak],
            [t("console.stats.feedback.partly"), events.feedback_given.czesciowo],
            [t("console.stats.feedback.no"), events.feedback_given.nie],
          ]}
        />
      </Section>

      <Section id="miary-czas" title={t("console.stats.latency")} note={t("console.stats.latencyNote")}>
        <Counts
          rows={[
            [t("console.stats.latency.count"), stats.latency.routes],
            [t("console.stats.latency.median"), seconds(stats.latency.median_ms)],
            [t("console.stats.latency.p95"), seconds(stats.latency.p95_ms)],
          ]}
        />
      </Section>

      <Section id="miary-innowacje" title={t("console.stats.topInnovations")} note={t("console.stats.topNote")}>
        {stats.top_innovations.length === 0 ? (
          <Empty>{t("console.stats.empty")}</Empty>
        ) : (
          <DataTable caption={t("console.stats.topInnovations")} minWidth="min-w-[30rem]">
            <thead>
              <tr>
                <Th>{t("console.stats.col.rank")}</Th>
                <Th>{t("console.stats.col.innovation")}</Th>
                <Th>{t("console.stats.col.routes")}</Th>
              </tr>
            </thead>
            <tbody>
              {stats.top_innovations.map((item, index) => (
                <tr key={item.innovation_id}>
                  <Num>{index + 1}</Num>
                  <Td>
                    <Link href={`/innowacja/${item.innovation_id}`}>{item.title}</Link>
                  </Td>
                  <Num>{count(item.routes)}</Num>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Section>

      <Section id="miary-kontakty" title={t("console.stats.contactsByStatus")} note={t("console.stats.storedNote")}>
        <CountTable
          caption={t("console.stats.contactsByStatus")}
          labelHeading={t("console.stats.col.status")}
          rows={[
            ...Object.entries(stats.contact_requests.by_status).map(([status, value]) => ({
              key: status,
              label: t(contactStatuses[status as keyof typeof contactStatuses]),
              count: value,
            })),
            { key: "razem", label: <strong>{t("console.stats.total")}</strong>, count: stats.contact_requests.total },
          ]}
        />
      </Section>

      <Section id="miary-kategorie" title={t("console.stats.needsByCategory")} note={t("console.stats.storedNote")}>
        <CountTable
          caption={t("console.stats.needsByCategory")}
          labelHeading={t("console.stats.col.category")}
          rows={stats.needs.by_category.map((row) => ({
            key: row.code,
            label: row.code ? targetGroupLabel(row.code) : t("console.stats.noCategory"),
            count: row.count,
          }))}
        />
      </Section>

      <Section id="miary-gminy" title={t("console.stats.needsByPlace")} note={t("console.stats.storedNote")}>
        <CountTable
          caption={t("console.stats.needsByPlace")}
          labelHeading={t("console.stats.col.place")}
          rows={stats.needs.by_gmina.map((row) => ({ key: row.terc ?? "", label: row.name, count: row.count }))}
        />
      </Section>

      <Section id="miary-model" title={t("console.stats.llm")} note={t("console.stats.llmNote")}>
        <ModelCalls llm={stats.llm} />
      </Section>
    </ConsolePage>
  );
}
