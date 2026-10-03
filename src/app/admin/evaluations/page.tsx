import Link from "next/link";
import { forwardEvaluation } from "@/app/admin/actions";
import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell, wasSaved } from "@/components/admin/admin-shell";
import { DecisionForm, ModerationState } from "@/components/admin/decision-form";
import { Button } from "@/components/ui/button";
import { controlClass, Label } from "@/components/ui/field";
import { getGmina, getInnovation } from "@/lib/catalogue";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { experienceLabel, testerRoleLabel } from "@/lib/labels";
import { repository } from "@/server/db";

export const metadata = { title: t("admin.evaluations.title") };

/**
 * Module VI over module IV: the evaluations of innovations. ROPS decides
 * whether one counts on the innovation's page and passes the texts and
 * the test sign-ups on to the innovators.
 */
export default async function AdminEvaluationsPage({ searchParams }: PageProps<"/admin/evaluations">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const query = await searchParams;
  const onlyTests = query.testy === "1";
  const evaluations = (await repository().listEvaluations()).filter((item) => !onlyTests || item.test_signup !== null);
  const back = onlyTests ? "/rops/opinie?testy=1" : "/rops/opinie";

  return (
    <AdminShell session={session} current="evaluations" title={t("admin.evaluations.title")} lead={t("admin.evaluations.lead")} saved={wasSaved(query)}>
      <nav aria-label={t("admin.filter.label")}>
        <ul className="flex flex-wrap gap-x-5">
          <li>
            <Link scroll={false} href="/rops/opinie" aria-current={!onlyTests ? "page" : undefined} className="inline-flex min-h-11 items-center aria-[current=page]:font-bold">
              {t("admin.filter.all")}
            </Link>
          </li>
          <li>
            <Link scroll={false} href="/rops/opinie?testy=1" aria-current={onlyTests ? "page" : undefined} className="inline-flex min-h-11 items-center aria-[current=page]:font-bold">
              {t("admin.evaluations.onlyTests")}
            </Link>
          </li>
        </ul>
      </nav>
      {evaluations.length === 0 ? (
        <p>{t("admin.empty")}</p>
      ) : (
        <ul className="grid gap-4">
          {evaluations.map((item) => {
            const innovation = getInnovation(item.innovation_id);
            return (
              <li key={item.id} className="grid gap-2 rounded-lg border border-border p-4">
                <h2 className="text-[1.15rem] font-bold">
                  <Link href={`/innowacja/${item.innovation_id}`}>{innovation?.title ?? item.innovation_id}</Link>
                </h2>
                <p className="text-muted-foreground">
                  {formatDate(item.created_at)}
                  {item.rating !== null && ` · ${t("admin.evaluations.rating", { rating: item.rating })}`}
                  {item.experience && ` · ${experienceLabel(item.experience)}`}
                  {item.demo && ` · ${t("admin.demo")}`}
                </p>
                {item.feedback && (
                  <p>
                    <span className="font-bold">{t("tester.feedback.label")}:</span> {item.feedback}
                  </p>
                )}
                {item.improvement && (
                  <p>
                    <span className="font-bold">{t("tester.improvement.label")}:</span> {item.improvement}
                  </p>
                )}
                {item.test_signup && (
                  <p>
                    <span className="font-bold">{t("admin.evaluations.signup")}</span> {testerRoleLabel(item.test_signup.as)}
                    {item.test_signup.place_terc && `, ${getGmina(item.test_signup.place_terc)?.name ?? item.test_signup.place_terc}`}
                  </p>
                )}
                <p>
                  <span className="font-bold">{t("admin.evaluations.author")}</span>{" "}
                  {item.author.display_name ?? t("admin.evaluations.anonymous")}
                  {item.author.email && (
                    <>
                      , <a href={`mailto:${item.author.email}`}>{item.author.email}</a>
                    </>
                  )}
                </p>
                <ModerationState moderation={item.moderation} />
                <DecisionForm kind="evaluation" id={item.id} back={back} approveLabel={t("admin.evaluations.approve")} />
                {item.forwarded_at ? (
                  <p className="font-bold">{t("admin.evaluations.forwarded", { date: formatDate(item.forwarded_at) })}</p>
                ) : (
                  <form action={forwardEvaluation} className="no-print grid gap-2 @xl:grid-cols-[minmax(0,1fr)_auto] @xl:items-end">
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="wroc" value={back} />
                    <div className="grid gap-1">
                      <Label htmlFor={`przekaz-${item.id}`}>{t("admin.evaluations.forwardNote")}</Label>
                      <input id={`przekaz-${item.id}`} name="notatka" maxLength={500} className={controlClass} />
                    </div>
                    <Button type="submit" variant="secondary">
                      {t("admin.evaluations.forward")}
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}
