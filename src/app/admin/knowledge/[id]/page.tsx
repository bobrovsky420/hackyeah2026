import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell } from "@/components/admin/admin-shell";
import { KnowledgeForm } from "@/components/admin/knowledge-form";
import { catalogue } from "@/lib/catalogue";
import { t } from "@/lib/i18n";
import { targetGroupCodes, targetGroupLabel } from "@/lib/labels";
import { knowledgeTypeCodes, knowledgeTypeLabel } from "@/server/admin/knowledge-labels";
import { repository } from "@/server/db";

export const metadata = { title: t("admin.knowledge.editTitle") };

/** One knowledge item: "nowy" adds one, a panel id edits it, a curated id edits that item of the data release. */
export default async function AdminKnowledgeItemPage({ params }: PageProps<"/admin/knowledge/[id]">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const { id } = await params;
  const entries = await repository().listKnowledgeEntries();
  const curated = catalogue().knowledge.byId.get(id);
  const own = entries.find((entry) => entry.id === id);
  const editOfCurated = curated ? entries.find((entry) => entry.base_id === id) : undefined;
  if (id !== "nowy" && !own && !curated) notFound();

  const entry = own ??
    editOfCurated ?? {
      id: null,
      base_id: curated ? id : null,
      title_pl: curated?.title ?? "",
      description_pl: "",
      url: curated?.url ?? "",
      type: (curated?.type ?? "guide") as "guide",
      target_groups: ["any"],
      always_show: false,
      hidden: false,
    };

  return (
    <AdminShell
      session={session}
      current="knowledge"
      title={id === "nowy" ? t("admin.knowledge.addTitle") : t("admin.knowledge.editTitle")}
      lead={curated ? t("admin.knowledge.curatedLead") : t("admin.knowledge.ownLead")}
    >
      <p>
        <Link href="/rops/wiedza">{t("admin.knowledge.back")}</Link>
      </p>
      <KnowledgeForm
        entry={entry}
        types={knowledgeTypeCodes.map((code) => ({ value: code, label: knowledgeTypeLabel(code) }))}
        groups={targetGroupCodes.map((code) => ({ value: code, label: targetGroupLabel(code) }))}
      />
    </AdminShell>
  );
}
