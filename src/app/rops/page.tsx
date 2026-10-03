import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ConsolePage, DataTable, Empty, Td, Th } from "@/components/console/console-parts";
import { DecisionForm, QueueMessagesProvider, QueueStatus } from "@/components/console/decision-form";
import { isOneOf, logActionLabel, reportReasons, targetLabel } from "@/lib/console";
import type { ContentReport } from "@/lib/contracts/records";
import { formatDateTime } from "@/lib/dates";
import { t, type MessageKey } from "@/lib/i18n";
import { getInnovation } from "@/lib/catalogue";
import { placeText } from "@/lib/places";
import { isAuthenticated } from "@/lib/server/auth";
import { loadQueues } from "@/server/console/queries";
import type { GateTextKind, ScreeningCategory } from "@/server/contracts";
import { repository } from "@/server/db";

export const metadata: Metadata = { title: t("console.moderation.title") };

/** Where a declined text was sent (FR-12.7). */
const reviewKindKeys = {
  need: "console.review.kind.need",
  saved_need: "console.review.kind.savedNeed",
  contact: "console.review.kind.contact",
  readiness: "console.review.kind.readiness",
  offer: "console.review.kind.offer",
} as const satisfies Record<GateTextKind, MessageKey>;

const categoryKeys = {
  need: "console.review.category.need",
  crisis: "console.review.category.crisis",
  individual_case: "console.review.category.individualCase",
  harm: "console.review.category.harm",
  off_topic: "console.review.category.offTopic",
  spam: "console.review.category.spam",
} as const satisfies Record<ScreeningCategory, MessageKey>;

function categoryLabel(category: string): string {
  return isOneOf(categoryKeys, category) ? t(categoryKeys[category]) : category;
}

/** What a content report points at, with a link where the content has a page. */
function ReportTarget({ target }: { target: ContentReport["target"] }) {
  if (target.type === "route") return <Link href={`/droga/${target.id}`}>{t("console.report.route", { id: target.id })}</Link>;
  if (target.type === "brief") return <Link href={`/potrzeba/${target.id}/fiszka`}>{t("console.report.brief", { id: target.id })}</Link>;
  if (target.type === "innovation") {
    const item = getInnovation(target.id);
    return <Link href={`/innowacja/${target.id}`}>{item?.title ?? target.id}</Link>;
  }
  return <>{t("console.report.need", { id: target.id })}</>;
}

/** A queue; its heading takes the focus after a decision, with the status line below it. */
function Queue({ id, title, count, children }: { id: string; title: string; count: number; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <div>
        <h2 id={id} tabIndex={-1} className="text-[1.3rem] font-bold">
          {t("console.queue.heading", { title, count })}
        </h2>
        <QueueStatus queue={id} />
      </div>
      {count === 0 ? <Empty>{t("console.queue.empty")}</Empty> : children}
    </section>
  );
}

/** The moderation tab of FR-12.8, first because it is the daily job. */
export default async function ModerationPage() {
  if (!(await isAuthenticated())) return null;
  const repo = repository();
  const [{ needs, contacts, readiness, reports, declined }, log] = await Promise.all([loadQueues(repo), repo.listModerationLog(20)]);

  return (
    <ConsolePage title={t("console.moderation.title")} lead={t("console.moderation.lead")}>
      <QueueMessagesProvider>
        <Queue id="kolejka-potrzeby" title={t("console.queue.needs")} count={needs.length}>
          <DataTable caption={t("console.queue.needs")}>
            <thead>
              <tr>
                <Th>{t("console.col.date")}</Th>
                <Th>{t("console.col.place")}</Th>
                <Th>{t("console.col.need")}</Th>
                <Th>{t("console.col.decision")}</Th>
              </tr>
            </thead>
            <tbody>
              {needs.map((need) => (
                <tr key={need.id}>
                  <Td>{formatDateTime(need.created_at)}</Td>
                  <Td>{placeText(need.place_terc)}</Td>
                  <Td id={`wpis-${need.id}`}>{need.problem_text}</Td>
                  <Td>
                    <DecisionForm
                      kind="need"
                      id={need.id}
                      queue="kolejka-potrzeby"
                      approve={{ value: "zatwierdz", label: "console.decision.publish" }}
                      describedBy={`wpis-${need.id}`}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Queue>

        <Queue id="kolejka-kontakty" title={t("console.queue.contacts")} count={contacts.length}>
          <DataTable caption={t("console.queue.contacts")}>
            <thead>
              <tr>
                <Th>{t("console.col.date")}</Th>
                <Th>{t("console.col.from")}</Th>
                <Th>{t("console.col.about")}</Th>
                <Th>{t("console.col.message")}</Th>
                <Th>{t("console.col.decision")}</Th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => {
                const innovation = contact.target.type === "innovation" ? getInnovation(contact.target.id) : undefined;
                return (
                  <tr key={contact.id}>
                    <Td>{formatDateTime(contact.created_at)}</Td>
                    <Td id={`wpis-${contact.id}`}>{contact.requester.name}</Td>
                    <Td>
                      {innovation ? <Link href={`/innowacja/${innovation.id}`}>{innovation.title}</Link> : t("console.target.advisor")}
                    </Td>
                    <Td>{contact.message}</Td>
                    <Td>
                      <DecisionForm
                        kind="contact"
                        id={contact.id}
                        queue="kolejka-kontakty"
                        approve={{ value: "zatwierdz", label: "console.decision.relay" }}
                        describedBy={`wpis-${contact.id}`}
                      />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </Queue>

        <Queue id="kolejka-gotowosc" title={t("console.queue.readiness")} count={readiness.length}>
          <DataTable caption={t("console.queue.readiness")}>
            <thead>
              <tr>
                <Th>{t("console.col.date")}</Th>
                <Th>{t("console.col.name")}</Th>
                <Th>{t("console.col.place")}</Th>
                <Th>{t("console.col.contact")}</Th>
                <Th>{t("console.col.decision")}</Th>
              </tr>
            </thead>
            <tbody>
              {readiness.map((entry) => (
                <tr key={entry.id}>
                  <Td>{formatDateTime(entry.created_at)}</Td>
                  <Td id={`wpis-${entry.id}`}>{entry.display_name}</Td>
                  <Td>{placeText(entry.place_terc)}</Td>
                  <Td>{entry.channel.value}</Td>
                  <Td>
                    <DecisionForm
                      kind="readiness"
                      id={entry.id}
                      queue="kolejka-gotowosc"
                      approve={{ value: "zweryfikuj", label: "console.decision.verify" }}
                      describedBy={`wpis-${entry.id}`}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Queue>

        <Queue id="kolejka-zgloszenia" title={t("console.queue.reports")} count={reports.length}>
          <DataTable caption={t("console.queue.reports")}>
            <thead>
              <tr>
                <Th>{t("console.col.date")}</Th>
                <Th>{t("console.col.about")}</Th>
                <Th>{t("console.col.reason")}</Th>
                <Th>{t("console.col.comment")}</Th>
                <Th>{t("console.col.decision")}</Th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id}>
                  <Td>{formatDateTime(report.created_at)}</Td>
                  <Td id={`wpis-${report.id}`}>
                    <ReportTarget target={report.target} />
                  </Td>
                  <Td>{t(reportReasons[report.reason])}</Td>
                  <Td>{report.comment ?? ""}</Td>
                  <Td>
                    <DecisionForm
                      kind="report"
                      id={report.id}
                      queue="kolejka-zgloszenia"
                      approve={{ value: "zatwierdz", label: "console.decision.accept" }}
                      describedBy={`wpis-${report.id}`}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Queue>

        <Queue id="kolejka-odmowy" title={t("console.queue.declined")} count={declined.length}>
          <DataTable caption={t("console.queue.declined")}>
            <thead>
              <tr>
                <Th>{t("console.col.date")}</Th>
                <Th>{t("console.col.code")}</Th>
                <Th>{t("console.col.source")}</Th>
                <Th>{t("console.col.category")}</Th>
                <Th>{t("console.col.text")}</Th>
                <Th>{t("console.col.decision")}</Th>
              </tr>
            </thead>
            <tbody>
              {declined.map((item) => (
                <tr key={item.id}>
                  <Td>{formatDateTime(item.created_at)}</Td>
                  <Td id={`wpis-${item.id}`} className="font-mono">
                    {item.reference_code ?? item.id}
                  </Td>
                  <Td>{t(reviewKindKeys[item.kind])}</Td>
                  <Td>{item.mild ? t("console.review.mild") : categoryLabel(item.category)}</Td>
                  <Td>
                    {item.text ?? t("console.review.noText")}
                    {item.text_until && (
                      <span className="mt-1 block text-[0.9rem] text-muted-foreground">
                        {t("console.review.textUntil", { date: formatDateTime(item.text_until) })}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <DecisionForm
                      kind="declined"
                      id={item.id}
                      queue="kolejka-odmowy"
                      approve={{ value: "przejrzane", label: "console.decision.reviewed" }}
                      describedBy={`wpis-${item.id}`}
                      withReason={false}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Queue>
      </QueueMessagesProvider>

      <section aria-labelledby="dziennik" className="grid gap-3">
        <h2 id="dziennik" className="text-[1.3rem] font-bold">
          {t("console.log.title")}
        </h2>
        {log.length === 0 ? (
          <Empty>{t("console.log.empty")}</Empty>
        ) : (
          <DataTable caption={t("console.log.title")}>
            <thead>
              <tr>
                <Th>{t("console.col.date")}</Th>
                <Th>{t("console.col.who")}</Th>
                <Th>{t("console.col.action")}</Th>
                <Th>{t("console.col.entry")}</Th>
                <Th>{t("console.col.reason")}</Th>
                <Th>{t("console.decision.note")}</Th>
              </tr>
            </thead>
            <tbody>
              {log.map((entry) => (
                <tr key={`${entry.ts}-${entry.target_id}`}>
                  <Td>{formatDateTime(entry.ts)}</Td>
                  <Td>{entry.reviewer}</Td>
                  <Td>{logActionLabel(entry)}</Td>
                  <Td>
                    {targetLabel(entry.target_type)}
                    <span className="block font-mono text-[0.9rem]">{entry.target_id}</span>
                  </Td>
                  <Td>{entry.reason_pl ?? ""}</Td>
                  <Td>{entry.note_pl ?? ""}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>
    </ConsolePage>
  );
}
