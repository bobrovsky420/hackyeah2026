import type { Metadata } from "next";
import Link from "next/link";
import { ConsolePage, DataTable, Empty, Filters, Td, Th } from "@/components/console/console-parts";
import { StatusForm } from "@/components/console/status-form";
import { contactStatuses, isOneOf, moderationStatuses } from "@/lib/console";
import { formatDateTime } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { getInnovation } from "@/lib/mock/data";
import { placeText } from "@/lib/places";
import { isAuthenticated } from "@/lib/server/auth";
import { getRoute } from "@/lib/server/routes";
import { store } from "@/lib/server/store";
import { fold } from "@/lib/text";

export const metadata: Metadata = { title: t("console.contacts.title") };

/** "Prośby o kontakt": requests to innovators and to the department (S7, 8.6). */
export default async function ContactsPage({ searchParams }: PageProps<"/rops/kontakty">) {
  if (!(await isAuthenticated())) return null;
  const query = await searchParams;
  const status = typeof query.status === "string" && isOneOf(contactStatuses, query.status) ? query.status : "";
  const gmina = typeof query.gmina === "string" ? query.gmina.trim() : "";
  const rows = store.contacts.filter((contact) => {
    const place = contact.route_id ? placeText(getRoute(contact.route_id)?.input.place_terc) : "";
    return (!status || contact.status === status) && (!gmina || fold(place).includes(fold(gmina)));
  });

  return (
    <ConsolePage title={t("console.contacts.title")} lead={t("console.contacts.lead")}>
      <Filters statuses={contactStatuses} current={{ status, gmina }} exportType="contacts" />
      <p role="status">{t("console.results", { count: rows.length })}</p>
      {rows.length === 0 ? (
        <Empty>{t("console.empty")}</Empty>
      ) : (
        <DataTable caption={t("console.contacts.title")}>
          <thead>
            <tr>
              <Th>{t("console.col.date")}</Th>
              <Th>{t("console.col.from")}</Th>
              <Th>{t("console.col.about")}</Th>
              <Th>{t("console.col.message")}</Th>
              <Th>{t("console.col.moderation")}</Th>
              <Th>{t("console.col.change")}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((contact) => {
              const innovation = contact.target.type === "innovation" ? getInnovation(contact.target.id) : undefined;
              return (
                <tr key={contact.id}>
                  <Td>{formatDateTime(contact.created_at)}</Td>
                  <Td id={`wpis-${contact.id}`}>
                    {contact.requester.name}
                    {contact.requester.organisation && <span className="block">{contact.requester.organisation}</span>}
                    <a className="block" href={`mailto:${contact.requester.email}`}>
                      {contact.requester.email}
                    </a>
                  </Td>
                  <Td>
                    {innovation ? <Link href={`/innowacja/${innovation.id}`}>{innovation.title}</Link> : t("console.target.advisor")}
                  </Td>
                  <Td>{contact.message}</Td>
                  <Td>{t(moderationStatuses[contact.moderation.status])}</Td>
                  <Td>
                    <StatusForm
                      kind="contact"
                      id={contact.id}
                      status={contact.status}
                      note={contact.note_pl}
                      options={contactStatuses}
                      describedBy={`wpis-${contact.id}`}
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </ConsolePage>
  );
}
