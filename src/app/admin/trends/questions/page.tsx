import Link from "next/link";
import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { controlClass, Label } from "@/components/ui/field";
import { getGmina, getInnovation } from "@/lib/catalogue";
import { formatDateTime } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { roleLabel, targetGroupCodes, targetGroupLabel } from "@/lib/labels";
import { NO_GROUP, questions } from "@/server/admin/data";
import { routeModeLabel } from "@/server/admin/labels";
import { questionGroups } from "@/server/db/repository";

export const metadata = { title: t("admin.questions.title") };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (value: string | string[] | undefined) => (typeof value === "string" && DAY.test(value) ? value : undefined);
const GROUP_CODES = [...targetGroupCodes, NO_GROUP];
const groupLabel = (code: string) => (code === NO_GROUP ? t("admin.trends.noGroup") : targetGroupLabel(code));

/**
 * Module II, behind a bar of "Pytania według grup": the questions asked of
 * the route, with their groups, place, result and the recommended
 * innovations, filtered by group and by day.
 */
export default async function AdminQuestionsPage({ searchParams }: PageProps<"/admin/trends/questions">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const query = await searchParams;
  const group = GROUP_CODES.find((code) => code === query.grupa);
  const from = day(query.od);
  const to = day(query.do);
  const items = await questions({ group, from, to });

  return (
    <AdminShell session={session} current="trends" title={t("admin.questions.title")} lead={t("admin.questions.lead")}>
      <p>
        <Link href="/rops/trendy">{t("admin.questions.back")}</Link>
      </p>
      <form method="get" className="no-print grid gap-3 @xl:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_minmax(0,12rem)_auto] @xl:items-end">
        <div className="grid gap-1">
          <Label htmlFor="filtr-grupa">{t("admin.questions.group")}</Label>
          <select id="filtr-grupa" name="grupa" defaultValue={group ?? ""} className={controlClass}>
            <option value="">{t("admin.filter.all")}</option>
            {GROUP_CODES.map((code) => (
              <option key={code} value={code}>
                {groupLabel(code)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="filtr-od">{t("admin.questions.from")}</Label>
          <input id="filtr-od" name="od" type="date" defaultValue={from ?? ""} className={controlClass} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="filtr-do">{t("admin.questions.to")}</Label>
          <input id="filtr-do" name="do" type="date" defaultValue={to ?? ""} className={controlClass} />
        </div>
        <Button type="submit" variant="secondary">
          {t("admin.filter.apply")}
        </Button>
      </form>
      <p role="status" className="font-bold">
        {t("admin.questions.found", { count: items.length })}
      </p>
      {items.length > 0 && (
        <ul className="grid gap-4">
          {items.map((route) => {
            const groups = questionGroups(route);
            return (
              <li key={route.id} className="grid gap-2 rounded-lg border border-border p-4">
                <h2 className="text-[1.1rem] font-bold">{route.need_summary_pl ?? route.input.problem_text?.slice(0, 120) ?? t("admin.questions.noText")}</h2>
                <p className="text-muted-foreground">
                  {formatDateTime(route.created_at)} · {getGmina(route.input.place_terc)?.name ?? t("admin.none")}
                  {route.input.role && ` · ${roleLabel(route.input.role)}`} · {routeModeLabel(route.mode)}
                  {route.demo && ` · ${t("admin.demo")}`}
                </p>
                <p>
                  <span className="font-bold">{t("admin.questions.groups")}</span>{" "}
                  {groups.length > 0 ? groups.map(groupLabel).join(", ") : t("admin.trends.noGroup")}
                </p>
                <p className="whitespace-pre-line">{route.input.problem_text ?? t("admin.questions.noText")}</p>
                {route.solutions.length > 0 && (
                  <div>
                    <span className="font-bold">{t("admin.questions.solutions")}</span>
                    <ul className="list-disc pl-6">
                      {route.solutions.map((solution) => (
                        <li key={solution.innovation_id}>
                          <Link href={`/innowacja/${solution.innovation_id}`}>
                            {getInnovation(solution.innovation_id)?.title ?? solution.innovation_id}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p>
                  <Link href={`/droga/${route.id}`}>{t("admin.questions.openRoute")}</Link>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}
