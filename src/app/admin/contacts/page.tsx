import { updateContactStatus } from "@/app/admin/actions";
import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell, wasSaved } from "@/components/admin/admin-shell";
import { DecisionForm, ModerationState } from "@/components/admin/decision-form";
import { Button } from "@/components/ui/button";
import { controlClass, Label } from "@/components/ui/field";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { contactStatusCodes, contactStatusLabel } from "@/server/admin/labels";
import { repository } from "@/server/db";

export const metadata = { title: t("admin.contacts.title") };

/** Module VI: the contact requests of FR-6.4, which ROPS relays after its own check (principle E6). */
export default async function AdminContactsPage({ searchParams }: PageProps<"/admin/contacts">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const query = await searchParams;
  const contacts = await repository().listContacts();
  const back = "/rops/kontakty";

  return (
    <AdminShell session={session} current="contacts" title={t("admin.contacts.title")} lead={t("admin.contacts.lead")} saved={wasSaved(query)}>
      {contacts.length === 0 ? (
        <p>{t("admin.empty")}</p>
      ) : (
        <ul className="grid gap-4">
          {contacts.map((item) => (
            <li key={item.id} id={`wpis-${item.id}`} className="grid scroll-mt-6 gap-2 rounded-lg border border-border p-4">
              <h2 className="text-[1.1rem] font-bold">
                {item.requester.name}
                {item.requester.organisation && `, ${item.requester.organisation}`}
              </h2>
              <p className="text-muted-foreground">
                {formatDate(item.created_at)} · {t("admin.contacts.target", { type: item.target.type, id: item.target.id })} ·{" "}
                <a href={`mailto:${item.requester.email}`}>{item.requester.email}</a>
                {item.demo && ` · ${t("admin.demo")}`}
              </p>
              <p className="whitespace-pre-line">{item.message}</p>
              <p>
                <span className="font-bold">{t("admin.contacts.status")}</span> {contactStatusLabel(item.status)}
              </p>
              <ModerationState moderation={item.moderation} />
              {item.moderation.status === "do-weryfikacji" && (
                <DecisionForm kind="contact" id={item.id} back={back} approveLabel={t("admin.contacts.approve")} />
              )}
              <form action={updateContactStatus} className="no-print grid gap-2 @xl:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] @xl:items-end">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="wroc" value={back} />
                <div className="grid gap-1">
                  <Label htmlFor={`status-${item.id}`}>{t("admin.contacts.status")}</Label>
                  <select id={`status-${item.id}`} name="status" defaultValue={item.status} className={controlClass}>
                    {contactStatusCodes.map((code) => (
                      <option key={code} value={code}>
                        {contactStatusLabel(code)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`notatka-${item.id}`}>{t("admin.note")}</Label>
                  <input id={`notatka-${item.id}`} name="notatka" maxLength={500} defaultValue={item.note_pl ?? ""} className={controlClass} />
                </div>
                <Button type="submit" variant="secondary">
                  {t("admin.saveStatus")}
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
