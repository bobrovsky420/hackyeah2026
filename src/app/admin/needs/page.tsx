import Link from "next/link";
import { updateNeedStatus } from "@/app/admin/actions";
import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell, wasSaved } from "@/components/admin/admin-shell";
import { DecisionForm, ModerationState } from "@/components/admin/decision-form";
import { Button } from "@/components/ui/button";
import { controlClass, Label } from "@/components/ui/field";
import { getGmina } from "@/lib/catalogue";
import type { NeedStatus } from "@/lib/contracts";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { roleLabel, targetGroupCodes, targetGroupLabel } from "@/lib/labels";
import { needStatusCodes, needStatusLabel } from "@/server/admin/labels";
import { repository } from "@/server/db";

export const metadata = { title: t("admin.needs.title") };

/** Module VI: the needs bank (FR-5.6, FR-5.7) with its filters, the publication decision and the status. */
export default async function AdminNeedsPage({ searchParams }: PageProps<"/admin/needs">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const query = await searchParams;
  const status = needStatusCodes.find((code) => code === query.status) as NeedStatus | undefined;
  const category = targetGroupCodes.find((code) => code === query.kategoria);
  const needs = await repository().listNeeds({ status, category });
  const back = "/rops/potrzeby";

  return (
    <AdminShell session={session} current="needs" title={t("admin.needs.title")} lead={t("admin.needs.lead")} saved={wasSaved(query)}>
      <form method="get" className="no-print grid gap-3 @xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] @xl:items-end">
        <div className="grid gap-1">
          <Label htmlFor="filtr-status">{t("admin.needs.status")}</Label>
          <select id="filtr-status" name="status" defaultValue={status ?? ""} className={controlClass}>
            <option value="">{t("admin.filter.all")}</option>
            {needStatusCodes.map((code) => (
              <option key={code} value={code}>
                {needStatusLabel(code)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="filtr-kategoria">{t("admin.needs.category")}</Label>
          <select id="filtr-kategoria" name="kategoria" defaultValue={category ?? ""} className={controlClass}>
            <option value="">{t("admin.filter.all")}</option>
            {targetGroupCodes.map((code) => (
              <option key={code} value={code}>
                {targetGroupLabel(code)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">
          {t("admin.filter.apply")}
        </Button>
      </form>
      {needs.length === 0 ? (
        <p>{t("admin.empty")}</p>
      ) : (
        <ul className="grid gap-4">
          {needs.map((need) => (
            <li key={need.id} className="grid gap-2 rounded-lg border border-border p-4">
              <h2 className="text-[1.1rem] font-bold">{need.summary_pl ?? need.problem_text.slice(0, 120)}</h2>
              <p className="text-muted-foreground">
                {formatDate(need.created_at)} · {getGmina(need.place_terc)?.name ?? t("admin.none")}
                {need.role && ` · ${roleLabel(need.role)}`}
                {need.target_groups.length > 0 && ` · ${need.target_groups.map(targetGroupLabel).join(", ")}`}
                {need.example && ` · ${t("admin.example")}`}
                {need.demo && ` · ${t("admin.demo")}`}
              </p>
              <p className="whitespace-pre-line">{need.problem_text}</p>
              <p>
                <span className="font-bold">{t("admin.needs.publish")}</span> {t(need.consents.publish_anonymised ? "admin.yes" : "admin.no")}
                {need.reporter.email && (
                  <>
                    {" · "}
                    <a href={`mailto:${need.reporter.email}`}>{need.reporter.email}</a>
                  </>
                )}
                {" · "}
                <Link href={`/potrzeba/${need.id}/fiszka`}>{t("admin.needs.brief")}</Link>
              </p>
              <ModerationState moderation={need.moderation} />
              {need.moderation.status === "do-weryfikacji" && need.consents.publish_anonymised && (
                <DecisionForm kind="need" id={need.id} back={back} approveLabel={t("admin.needs.approve")} />
              )}
              <form action={updateNeedStatus} className="no-print grid gap-2 @xl:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] @xl:items-end">
                <input type="hidden" name="id" value={need.id} />
                <input type="hidden" name="wroc" value={back} />
                <div className="grid gap-1">
                  <Label htmlFor={`status-${need.id}`}>{t("admin.needs.status")}</Label>
                  <select id={`status-${need.id}`} name="status" defaultValue={need.status} className={controlClass}>
                    {needStatusCodes.map((code) => (
                      <option key={code} value={code}>
                        {needStatusLabel(code)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`notatka-${need.id}`}>{t("admin.note")}</Label>
                  <input id={`notatka-${need.id}`} name="notatka" maxLength={500} defaultValue={need.note_pl ?? ""} className={controlClass} />
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
