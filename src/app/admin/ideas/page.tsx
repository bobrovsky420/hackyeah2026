import Link from "next/link";
import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell } from "@/components/admin/admin-shell";
import { ModerationState } from "@/components/admin/decision-form";
import { StatusChip, statusTone } from "@/components/admin/status-chip";
import type { IdeaStatus } from "@/lib/contracts";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { ideaKindLabel, ideaStageCodes, ideaStageLabel, targetGroupCodes, targetGroupLabel } from "@/lib/labels";
import { filterIdeas, NO_GROUP } from "@/server/admin/data";
import { ideaForm, ideaFormCodes, ideaFormLabel, ideaStatusCodes, ideaStatusLabel } from "@/server/admin/labels";
import { repository } from "@/server/db";

export const metadata = { title: t("admin.ideas.title") };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (value: string | string[] | undefined) => (typeof value === "string" && DAY.test(value) ? value : undefined);
const filterClass = "inline-flex min-h-11 items-center aria-[current=page]:font-bold";

/** The list's address for a status and a form; the narrowing of the trends is left behind. */
function address({ status, forma }: { status?: string; forma?: string }): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (forma) params.set("forma", forma);
  const query = params.toString();
  return query ? `/rops/pomysly?${query}` : "/rops/pomysly";
}

/**
 * Module VI: the idea cards of module III, newest first, filtered by
 * status and by form (the short form or the CANVAS application); a bar of
 * the trends opens them narrowed to its group, stage, form or days, and
 * the page says so.
 */
export default async function AdminIdeasPage({ searchParams }: PageProps<"/admin/ideas">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const query = await searchParams;
  const status = ideaStatusCodes.find((code) => code === query.status) as IdeaStatus | undefined;
  const group = [...targetGroupCodes, NO_GROUP].find((code) => code === query.grupa);
  const stage = ideaStageCodes.find((code) => code === query.etap);
  const form = ideaFormCodes.find((code) => code === query.forma);
  const from = day(query.od);
  const to = day(query.do);
  const ideas = filterIdeas(
    (await repository().listIdeas()).filter((idea) => !status || idea.status === status),
    { group, stage, form, from, to },
  );
  const fromTrends = [
    group && t("admin.ideas.group", { group: group === NO_GROUP ? t("admin.trends.noGroup") : targetGroupLabel(group) }),
    stage && t("admin.ideas.stage", { stage: ideaStageLabel(stage) }),
    from && t("admin.filter.since", { date: formatDate(from) }),
    to && t("admin.filter.until", { date: formatDate(to) }),
  ].filter(Boolean);

  return (
    <AdminShell session={session} current="ideas" title={t("admin.ideas.title")} lead={t("admin.ideas.lead")}>
      <nav aria-label={t("admin.ideas.statusField")}>
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {[undefined, ...ideaStatusCodes].map((code) => (
            <li key={code ?? "wszystkie"}>
              <Link scroll={false} prefetch={false} href={address({ status: code, forma: form })} aria-current={status === code ? "page" : undefined} className={filterClass}>
                {code ? ideaStatusLabel(code) : t("admin.filter.all")}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-labelledby="forma-tytul" className="grid gap-1">
        <p id="forma-tytul" className="font-bold">
          {t("admin.ideas.formField")}
        </p>
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {[undefined, ...ideaFormCodes].map((code) => (
            <li key={code ?? "wszystkie"}>
              <Link scroll={false} prefetch={false} href={address({ status, forma: code })} aria-current={form === code ? "page" : undefined} className={filterClass}>
                {code ? ideaFormLabel(code) : t("admin.filter.all")}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {fromTrends.length > 0 && (
        <p role="status">
          {t("admin.filter.fromTrends", { filter: fromTrends.join(", ") })} <Link href="/rops/pomysly">{t("admin.filter.clear")}</Link>
        </p>
      )}
      {ideas.length === 0 ? (
        <p>{t("admin.empty")}</p>
      ) : (
        <ul className="grid gap-4">
          {ideas.map((idea) => (
            <li key={idea.id} className="grid gap-1 rounded-lg border border-border p-4">
              <h2 className="text-[1.15rem] font-bold">
                <Link href={`/rops/pomysly/${idea.id}`}>{idea.title}</Link>
              </h2>
              <p className="text-muted-foreground">
                {ideaForm(idea) === "canvas" && <span className="font-bold text-foreground">{ideaFormLabel("canvas")} · </span>}
                {formatDate(idea.created_at)} · {ideaKindLabel(idea.kind)} · {ideaStageLabel(idea.stage)} · {idea.author.display_name}
                {idea.demo && ` · ${t("admin.demo")}`}
              </p>
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{t("admin.ideas.status")}</span>
                <StatusChip tone={statusTone(idea.status)}>{ideaStatusLabel(idea.status)}</StatusChip>
                {idea.reply && <span>{t("admin.ideas.replied")}</span>}
              </p>
              <ModerationState moderation={idea.moderation} />
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
