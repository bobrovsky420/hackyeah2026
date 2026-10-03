import type { Metadata } from "next";
import { ClusterForm } from "@/components/console/cluster-form";
import { ConsolePage, DataTable, Empty, Filters, Td, Th } from "@/components/console/console-parts";
import { StatusForm } from "@/components/console/status-form";
import { isOneOf, moderationStatuses, needStatuses } from "@/lib/console";
import { formatDateTime } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { roleNoun, targetGroupCodes, targetGroupLabel } from "@/lib/labels";
import { placeText } from "@/lib/places";
import { isAuthenticated } from "@/server/console/auth";
import { placesMatching } from "@/server/console/place-filter";
import { repository } from "@/server/db";

export const metadata: Metadata = { title: t("console.needs.title") };

const categories = targetGroupCodes.map((code) => ({ value: code, label: targetGroupLabel(code) }));

/** "Potrzeby": the needs bank with filters, status, note, clusters (FR-5.4) and CSV export (S7, FR-9.2). */
export default async function NeedsPage({ searchParams }: PageProps<"/rops/needs">) {
  if (!(await isAuthenticated())) return null;
  const query = await searchParams;
  const status = typeof query.status === "string" && isOneOf(needStatuses, query.status) ? query.status : "";
  const gmina = typeof query.gmina === "string" ? query.gmina.trim() : "";
  const category = typeof query.kategoria === "string" && targetGroupCodes.includes(query.kategoria) ? query.kategoria : "";
  const repo = repository();
  const clusterNames = new Map((await repo.listClusters()).map((cluster) => [cluster.id, cluster.name_pl]));
  const rows = await repo.listNeeds({
    status: status || undefined,
    category: category || undefined,
    places: placesMatching(gmina),
  });

  return (
    <ConsolePage title={t("console.needs.title")} lead={t("console.needs.lead")}>
      <ClusterForm />
      <Filters statuses={needStatuses} current={{ status, gmina, category }} exportType="needs" categories={categories} />
      <p role="status">{t("console.results", { count: rows.length })}</p>
      {rows.length === 0 ? (
        <Empty>{t("console.empty")}</Empty>
      ) : (
        <DataTable caption={t("console.needs.title")}>
          <thead>
            <tr>
              <Th>{t("console.col.date")}</Th>
              <Th>{t("console.col.need")}</Th>
              <Th>{t("console.col.cluster")}</Th>
              <Th>{t("console.col.place")}</Th>
              <Th>{t("console.col.role")}</Th>
              <Th>{t("console.col.publish")}</Th>
              <Th>{t("console.col.change")}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((need) => (
              <tr key={need.id}>
                <Td>
                  {formatDateTime(need.created_at)}
                  {need.example && <span className="mt-1 block text-[0.9rem] font-bold text-muted-foreground">{t("console.example")}</span>}
                </Td>
                <Td id={`wpis-${need.id}`}>
                  {need.problem_text}
                  {need.target_groups.length > 0 && (
                    <span className="mt-1 block text-[0.9rem] text-muted-foreground">
                      {need.target_groups.map(targetGroupLabel).join(", ")}
                    </span>
                  )}
                </Td>
                <Td>
                  {(need.cluster_id && clusterNames.get(need.cluster_id)) ?? (
                    <span className="text-muted-foreground">{t("console.clusters.none")}</span>
                  )}
                </Td>
                <Td>{placeText(need.place_terc)}</Td>
                <Td>{need.role ? roleNoun(need.role) : ""}</Td>
                <Td>
                  {need.consents.publish_anonymised ? t("console.yes") : t("console.no")}
                  <span className="mt-1 block text-[0.9rem] text-muted-foreground">
                    {t(moderationStatuses[need.moderation.status])}
                  </span>
                </Td>
                <Td>
                  <StatusForm
                    kind="need"
                    id={need.id}
                    status={need.status}
                    note={need.note_pl}
                    options={needStatuses}
                    describedBy={`wpis-${need.id}`}
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
