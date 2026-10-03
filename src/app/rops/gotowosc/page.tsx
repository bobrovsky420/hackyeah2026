import type { Metadata } from "next";
import { ConsolePage, DataTable, Empty, Filters, Td, Th } from "@/components/console/console-parts";
import { StatusForm } from "@/components/console/status-form";
import { isOneOf, verificationStatuses } from "@/lib/console";
import { formatDate, formatDateTime } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { targetGroupLabel } from "@/lib/labels";
import { placeText } from "@/lib/places";
import { isAuthenticated } from "@/lib/server/auth";
import { store } from "@/lib/server/store";
import { fold } from "@/lib/text";

export const metadata: Metadata = { title: t("console.readiness.title") };

/** "Gotowość do działania": the readiness registry with its verification (S7, 8.6). */
export default async function ReadinessPage({ searchParams }: PageProps<"/rops/gotowosc">) {
  if (!(await isAuthenticated())) return null;
  const query = await searchParams;
  const status = typeof query.status === "string" && isOneOf(verificationStatuses, query.status) ? query.status : "";
  const gmina = typeof query.gmina === "string" ? query.gmina.trim() : "";
  const rows = store.readiness.filter(
    (entry) =>
      (!status || entry.verification.status === status) && (!gmina || fold(placeText(entry.place_terc)).includes(fold(gmina))),
  );

  return (
    <ConsolePage title={t("console.readiness.title")} lead={t("console.readiness.lead")}>
      <Filters statuses={verificationStatuses} current={{ status, gmina }} exportType="readiness" />
      <p role="status">{t("console.results", { count: rows.length })}</p>
      {rows.length === 0 ? (
        <Empty>{t("console.empty")}</Empty>
      ) : (
        <DataTable caption={t("console.readiness.title")}>
          <thead>
            <tr>
              <Th>{t("console.col.date")}</Th>
              <Th>{t("console.col.name")}</Th>
              <Th>{t("console.col.place")}</Th>
              <Th>{t("console.col.topics")}</Th>
              <Th>{t("console.col.contact")}</Th>
              <Th>{t("console.col.showName")}</Th>
              <Th>{t("console.col.change")}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={entry.id}>
                <Td>
                  {formatDateTime(entry.created_at)}
                  <span className="mt-1 block text-[0.9rem] text-muted-foreground">
                    {t("console.retention", { date: formatDate(entry.retention_until) })}
                  </span>
                </Td>
                <Td id={`wpis-${entry.id}`}>
                  {entry.display_name}
                  {entry.is_organisation && <span className="block text-[0.9rem] text-muted-foreground">{t("console.organisation")}</span>}
                </Td>
                <Td>{placeText(entry.place_terc)}</Td>
                <Td>{entry.topics.map(targetGroupLabel).join(", ")}</Td>
                <Td>{entry.channel.value}</Td>
                <Td>{entry.consent_display_name ? t("console.yes") : t("console.no")}</Td>
                <Td>
                  <StatusForm
                    kind="readiness"
                    id={entry.id}
                    status={entry.verification.status}
                    note={entry.note_pl}
                    options={verificationStatuses}
                    describedBy={`wpis-${entry.id}`}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </ConsolePage>
  );
}
