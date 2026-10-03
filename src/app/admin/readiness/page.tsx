import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell, wasSaved } from "@/components/admin/admin-shell";
import { DecisionForm } from "@/components/admin/decision-form";
import { getGmina } from "@/lib/catalogue";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { targetGroupLabel } from "@/lib/labels";
import { repository } from "@/server/db";

export const metadata = { title: t("admin.readiness.title") };

/** Module VI: the readiness registrations of FR-6.5; a name is shown on routes only after verification here. */
export default async function AdminReadinessPage({ searchParams }: PageProps<"/admin/readiness">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const query = await searchParams;
  const entries = await repository().listReadiness();

  return (
    <AdminShell session={session} current="readiness" title={t("admin.readiness.title")} lead={t("admin.readiness.lead")} saved={wasSaved(query)}>
      {entries.length === 0 ? (
        <p>{t("admin.empty")}</p>
      ) : (
        <ul className="grid gap-4">
          {entries.map((item) => (
            <li key={item.id} className="grid gap-2 rounded-lg border border-border p-4">
              <h2 className="text-[1.1rem] font-bold">{item.display_name}</h2>
              <p className="text-muted-foreground">
                {formatDate(item.created_at)} · {getGmina(item.place_terc)?.name ?? t("admin.none")}
                {item.topics.length > 0 && ` · ${item.topics.map(targetGroupLabel).join(", ")}`}
                {item.example && ` · ${t("admin.example")}`}
                {item.demo && ` · ${t("admin.demo")}`}
              </p>
              <p>
                {item.channel.value} · {t(item.consent_display_name ? "admin.readiness.nameConsent" : "admin.readiness.noNameConsent")}
              </p>
              <p className="font-bold">{t(`admin.verification.${item.verification.status}`)}</p>
              {item.verification.status === "niezweryfikowane" && (
                <DecisionForm kind="readiness" id={item.id} back="/rops/gotowosc" approveLabel={t("admin.readiness.approve")} />
              )}
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
