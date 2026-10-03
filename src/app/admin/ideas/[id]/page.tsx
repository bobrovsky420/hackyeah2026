import Link from "next/link";
import { notFound } from "next/navigation";
import { updateIdea } from "@/app/admin/actions";
import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell, wasSaved } from "@/components/admin/admin-shell";
import { DecisionForm, ModerationState } from "@/components/admin/decision-form";
import { CanvasAnswers } from "@/components/idea/canvas-answers";
import { Button } from "@/components/ui/button";
import { controlClass, Hint, Label } from "@/components/ui/field";
import { getGmina, getInnovation } from "@/lib/catalogue";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { ideaKindLabel, ideaStageLabel, targetGroupLabel } from "@/lib/labels";
import { ideaStatusCodes, ideaStatusLabel } from "@/server/admin/labels";
import { repository } from "@/server/db";

export const metadata = { title: t("admin.ideas.one") };

/** Module VI: one idea card with its author's contact, the decision, the status and the reply the author reads. */
export default async function AdminIdeaPage({ params, searchParams }: PageProps<"/admin/ideas/[id]">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const { id } = await params;
  const query = await searchParams;
  const idea = await repository().getIdea(id);
  if (!idea) notFound();
  const back = `/rops/pomysly/${idea.id}`;
  const gmina = getGmina(idea.place_terc);

  return (
    <AdminShell session={session} current="ideas" title={idea.title} saved={wasSaved(query)}>
      <p>
        <Link href="/rops/pomysly">{t("admin.ideas.back")}</Link>
        {/* The demonstration data has no public card. */}
        {idea.demo ? ` · ${t("admin.demo")}` : <> · <Link href={`/pomysl/${idea.id}`}>{t("admin.ideas.public")}</Link></>}
      </p>
      <dl className="grid gap-x-6 gap-y-2 @xl:grid-cols-[max-content_minmax(0,1fr)]">
        <dt className="font-bold">{t("admin.ideas.submitted")}</dt>
        <dd>{formatDate(idea.created_at)}</dd>
        <dt className="font-bold">{t("card.kind")}</dt>
        <dd>{ideaKindLabel(idea.kind)}</dd>
        <dt className="font-bold">{t("card.stage")}</dt>
        <dd>{ideaStageLabel(idea.stage)}</dd>
        <dt className="font-bold">{t("card.place")}</dt>
        <dd>{gmina?.name ?? t("admin.none")}</dd>
        <dt className="font-bold">{t("card.groups")}</dt>
        <dd>{idea.target_groups.map(targetGroupLabel).join(", ") || t("admin.none")}</dd>
        <dt className="font-bold">{t("admin.ideas.author")}</dt>
        <dd>
          {idea.author.display_name}
          {idea.author.is_organisation && ` (${t("admin.ideas.organisation")})`}, <a href={`mailto:${idea.author.email}`}>{idea.author.email}</a>
        </dd>
        <dt className="font-bold">{t("admin.ideas.consentPublish")}</dt>
        <dd>{t(idea.consents.publish ? "admin.yes" : "admin.no")}</dd>
      </dl>

      <section aria-labelledby="fiszka-tresc" className="grid gap-3 border-t border-border pt-6">
        <h2 id="fiszka-tresc" className="text-[1.3rem] font-bold">
          {t("admin.ideas.content")}
        </h2>
        <h3 className="font-bold">{t("card.description")}</h3>
        <p className="whitespace-pre-line">{idea.description}</p>
        <h3 className="font-bold">{t("card.essence")}</h3>
        <p className="whitespace-pre-line">{idea.essence}</p>
        <h3 className="font-bold">{t("card.forWhom")}</h3>
        <p className="whitespace-pre-line">{idea.for_whom}</p>
      </section>

      {idea.canvas && (
        <section aria-labelledby="canvas" className="grid gap-3 border-t border-border pt-6">
          <h2 id="canvas" className="text-[1.3rem] font-bold">
            {t("card.canvas.title")}
          </h2>
          <CanvasAnswers canvas={idea.canvas} />
        </section>
      )}

      <section aria-labelledby="podobne" className="grid gap-3 border-t border-border pt-6">
        <h2 id="podobne" className="text-[1.3rem] font-bold">
          {t("card.similar.title")}
        </h2>
        {idea.similar === null ? (
          <p>{t("admin.ideas.similarPending")}</p>
        ) : idea.similar.length === 0 ? (
          <p>{t("card.similar.none")}</p>
        ) : (
          <ul className="grid list-disc gap-1 pl-6">
            {idea.similar.map((match) => (
              <li key={match.innovation_id}>
                <Link href={`/innowacja/${match.innovation_id}`}>{getInnovation(match.innovation_id)?.title ?? match.innovation_id}</Link>,{" "}
                {t("card.similar.score", { score: match.fit_score })}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="decyzja" className="grid gap-3 border-t border-border pt-6">
        <h2 id="decyzja" className="text-[1.3rem] font-bold">
          {t("admin.ideas.decision")}
        </h2>
        <p>{t("admin.ideas.decisionLead")}</p>
        <ModerationState moderation={idea.moderation} />
        <DecisionForm kind="idea" id={idea.id} back={back} approveLabel={t("admin.ideas.approve")} />
      </section>

      <section aria-labelledby="odpowiedz" className="grid gap-3 border-t border-border pt-6">
        <h2 id="odpowiedz" className="text-[1.3rem] font-bold">
          {t("admin.ideas.replyTitle")}
        </h2>
        {idea.reply && (
          <p className="text-muted-foreground">{t("admin.ideas.replyBy", { who: idea.reply.by, date: formatDate(idea.reply.at) })}</p>
        )}
        <form action={updateIdea} className="grid max-w-[48rem] gap-4">
          <input type="hidden" name="id" value={idea.id} />
          <input type="hidden" name="wroc" value={back} />
          <div className="grid gap-1">
            <Label htmlFor="status">{t("admin.ideas.statusField")}</Label>
            <select id="status" name="status" defaultValue={idea.status} className={controlClass}>
              {ideaStatusCodes.map((code) => (
                <option key={code} value={code}>
                  {ideaStatusLabel(code)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="odpowiedz-tekst">{t("admin.ideas.reply")}</Label>
            <Hint id="odpowiedz-podpowiedz">{t("admin.ideas.replyHint")}</Hint>
            <textarea
              id="odpowiedz-tekst"
              name="odpowiedz"
              rows={5}
              maxLength={2000}
              defaultValue={idea.reply?.text_pl ?? ""}
              className={controlClass}
              aria-describedby="odpowiedz-podpowiedz"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="notatka">{t("admin.note")}</Label>
            <Hint id="notatka-podpowiedz">{t("admin.noteHint")}</Hint>
            <textarea id="notatka" name="notatka" rows={2} maxLength={1000} defaultValue={idea.note_pl ?? ""} className={controlClass} aria-describedby="notatka-podpowiedz" />
          </div>
          <div>
            <Button type="submit">{t("admin.ideas.save")}</Button>
          </div>
        </form>
      </section>
    </AdminShell>
  );
}
