import type { Metadata } from "next";
import { ConsolePage } from "@/components/console/console-parts";
import type { RouteMode } from "@/lib/contracts/route";
import { formatDateTime } from "@/lib/dates";
import { t, type MessageKey } from "@/lib/i18n";
import { isAuthenticated } from "@/lib/server/auth";
import { store } from "@/lib/server/store";

export const metadata: Metadata = { title: t("console.stats.title") };

const modes: [RouteMode, MessageKey][] = [
  ["route", "console.stats.mode.route"],
  ["partial", "console.stats.mode.partial"],
  ["none", "console.stats.mode.none"],
  ["redirected", "console.stats.mode.redirected"],
  ["declined", "console.stats.mode.declined"],
  ["off_topic", "console.stats.mode.offTopic"],
];

const events: [string, MessageKey][] = [
  ["contact_requested", "console.stats.contacts"],
  ["need_saved", "console.stats.needs"],
  ["readiness_registered", "console.stats.readiness"],
  ["feedback_given:tak", "console.stats.feedback.yes"],
  ["feedback_given:czesciowo", "console.stats.feedback.partly"],
  ["feedback_given:nie", "console.stats.feedback.no"],
];

function Counts({ id, title, rows }: { id: string; title: string; rows: [string, MessageKey][] }) {
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <h2 id={id} className="text-[1.3rem] font-bold">
        {title}
      </h2>
      <dl className="grid gap-x-8 gap-y-2 rounded-lg border border-border p-4 @xl:grid-cols-[max-content_max-content]">
        {rows.map(([event, label]) => (
          <div key={event} className="contents">
            <dt>{t(label)}</dt>
            <dd className="font-bold tabular-nums">{store.counters.get(event) ?? 0}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** FR-10.2 and FR-10.3: the event counters, without cookies and without personal data. */
export default async function StatsPage() {
  if (!(await isAuthenticated())) return null;
  return (
    <ConsolePage title={t("console.stats.title")} lead={t("console.stats.lead", { date: formatDateTime(store.startedAt) })}>
      <Counts
        id="miary-drogi"
        title={t("console.stats.routes")}
        rows={modes.map(([mode, label]) => [`route_created:${mode}`, label])}
      />
      <Counts id="miary-zdarzenia" title={t("console.stats.events")} rows={events} />
    </ConsolePage>
  );
}
