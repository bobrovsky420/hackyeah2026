import Link from "next/link";
import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell, wasSaved } from "@/components/admin/admin-shell";
import { buttonVariants } from "@/components/ui/button";
import { controlClass, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { catalogue } from "@/lib/catalogue";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { knowledgeTypeLabel } from "@/server/admin/knowledge-labels";
import { repository } from "@/server/db";

export const metadata = { title: t("admin.knowledge.title") };

const MAX_RESULTS = 20;

/**
 * Module VI over module II: the knowledge of ROPS kept up to date in the
 * panel. The curated items of the data release can be edited or hidden,
 * new items (a film, a guide) added, and catalogue innovations verified,
 * corrected or hidden; every change shows on the routes at once.
 */
export default async function AdminKnowledgePage({ searchParams }: PageProps<"/admin/knowledge">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q.trim() : "";
  const repo = repository();
  const [entries, overrides] = await Promise.all([repo.listKnowledgeEntries(), repo.listInnovationOverrides()]);
  const editsByBase = new Map(entries.filter((entry) => entry.base_id).map((entry) => [entry.base_id, entry]));
  const { knowledge, innovations, innovationById } = catalogue();
  const curated = [...knowledge.byId];
  const added = entries.filter((entry) => !entry.base_id);
  const needle = search.toLocaleLowerCase("pl-PL");
  const found = needle
    ? innovations.filter((item) => `${item.title} ${item.organisation ?? ""}`.toLocaleLowerCase("pl-PL").includes(needle)).slice(0, MAX_RESULTS)
    : [];

  return (
    <AdminShell session={session} current="knowledge" title={t("admin.knowledge.title")} lead={t("admin.knowledge.lead")} saved={wasSaved(query)}>
      <section aria-labelledby="materialy-wiedzy" className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="materialy-wiedzy" className="text-[1.3rem] font-bold">
            {t("admin.knowledge.items")}
          </h2>
          <Link href="/rops/wiedza/nowy" className={buttonVariants()}>
            {t("admin.knowledge.add")}
          </Link>
        </div>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-4">{t("admin.knowledge.itemTitle")}</th>
              <th scope="col" className="py-2 pr-4">{t("admin.knowledge.type")}</th>
              <th scope="col" className="py-2 pr-4">{t("admin.knowledge.state")}</th>
              <th scope="col" className="py-2">
                <span className="sr-only">{t("admin.knowledge.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {added.map((entry) => (
              <tr key={entry.id} className="border-b border-border">
                <th scope="row" className="py-2 pr-4 font-normal">
                  <a href={entry.url}>{entry.title_pl}</a>
                </th>
                <td className="py-2 pr-4">{knowledgeTypeLabel(entry.type)}</td>
                <td className="py-2 pr-4">
                  {t(entry.hidden ? "admin.knowledge.hidden" : "admin.knowledge.added", { date: formatDate(entry.updated_at) })}
                </td>
                <td className="py-2">
                  <Link href={`/rops/wiedza/${entry.id}`}>{t("admin.knowledge.edit")}</Link>
                </td>
              </tr>
            ))}
            {curated.map(([id, link]) => {
              const edit = editsByBase.get(id);
              return (
                <tr key={id} className="border-b border-border">
                  <th scope="row" className="py-2 pr-4 font-normal">
                    <a href={edit?.url ?? link.url}>{edit?.title_pl ?? link.title}</a>
                  </th>
                  <td className="py-2 pr-4">{knowledgeTypeLabel(edit?.type ?? link.type)}</td>
                  <td className="py-2 pr-4">
                    {edit
                      ? t(edit.hidden ? "admin.knowledge.hidden" : "admin.knowledge.edited", { date: formatDate(edit.updated_at) })
                      : t("admin.knowledge.curated")}
                  </td>
                  <td className="py-2">
                    <Link href={`/rops/wiedza/${id}`}>{t("admin.knowledge.edit")}</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="innowacje" className="grid gap-4">
        <h2 id="innowacje" className="text-[1.3rem] font-bold">
          {t("admin.knowledge.innovations")}
        </h2>
        <p>{t("admin.knowledge.innovationsLead")}</p>
        <form method="get" role="search" className="no-print grid gap-2 @xl:grid-cols-[minmax(0,1fr)_auto] @xl:items-end">
          <div className="grid gap-1">
            <Label htmlFor="szukaj">{t("admin.knowledge.search")}</Label>
            <input id="szukaj" name="q" type="search" defaultValue={search} className={controlClass} />
          </div>
          <Button type="submit" variant="secondary">
            {t("admin.knowledge.searchSubmit")}
          </Button>
        </form>
        {search && (
          <div role="status">
            {found.length === 0 ? (
              <p>{t("admin.knowledge.noResults")}</p>
            ) : (
              <ul className="grid list-disc gap-1 pl-6">
                {found.map((item) => (
                  <li key={item.id}>
                    <Link href={`/rops/innowacje/${item.id}`}>{item.title}</Link>
                    {item.organisation && `, ${item.organisation}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {overrides.length > 0 && (
          <>
            <h3 className="font-bold">{t("admin.knowledge.withWord")}</h3>
            <ul className="grid list-disc gap-1 pl-6">
              {overrides.map((override) => (
                <li key={override.innovation_id}>
                  <Link href={`/rops/innowacje/${override.innovation_id}`}>
                    {innovationById.get(override.innovation_id)?.title ?? override.innovation_id}
                  </Link>
                  {" · "}
                  {t(
                    override.status === "zweryfikowane"
                      ? "admin.innovation.verified"
                      : override.status === "ukryte"
                        ? "admin.innovation.hidden"
                        : "admin.innovation.edited",
                  )}
                  {override.extra_materials.length > 0 && ` · ${t("admin.knowledge.extraCount", { count: override.extra_materials.length })}`}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </AdminShell>
  );
}
