import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { assignMentor, replyThread, resetAuthorLink, updateThreadStatus } from "@/app/admin/actions";
import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell, wasSaved } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { controlClass, Hint, Label } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { getGmina, getInnovation } from "@/lib/catalogue";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { sectorLabel, targetGroupLabel, threadStatusCodes, threadStatusLabel, topicLabel } from "@/lib/labels";
import { flashLinkFor } from "@/server/admin/link-flash";
import { repository } from "@/server/db";

export const metadata = { title: t("admin.threads.one") };

/**
 * Module V in the panel: one conversation. ROPS answers under the
 * reviewer's name, sets the status, invites a mentor with a private link
 * of their own and, for an author who lost theirs, makes a new link.
 */
export default async function AdminThreadPage({ params, searchParams }: PageProps<"/admin/threads/[id]">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const { id } = await params;
  const query = await searchParams;
  const repo = repository();
  const [thread, mentors] = await Promise.all([repo.getThread(id), repo.listMentors()]);
  if (!thread) notFound();
  const flash = await flashLinkFor(thread.id);
  // The full address to send on: the panel is opened on the same host as the public pages.
  const requestHeaders = await headers();
  const origin = `${requestHeaders.get("x-forwarded-proto") ?? "http"}://${requestHeaders.get("host") ?? "localhost:3000"}`;
  const back = `/rops/rozmowy/${thread.id}`;
  const post = thread.ref?.type === "partnership" ? await repo.getPost(thread.ref.id) : undefined;

  return (
    <AdminShell session={session} current="threads" title={thread.subject} saved={wasSaved(query)}>
      <p>
        <Link href="/rops/rozmowy">{t("admin.threads.back")}</Link>
      </p>
      {flash && (
        <div role="status">
          <Notice tone="success" title={t(flash.kind === "mentor" ? "admin.threads.mentorLink" : "admin.threads.authorLink")}>
            <p>{t("admin.threads.linkOnce")}</p>
            <p className="font-mono break-all">{`${origin}${flash.path}`}</p>
          </Notice>
        </div>
      )}
      <dl className="grid gap-x-6 gap-y-2 @xl:grid-cols-[max-content_minmax(0,1fr)]">
        <dt className="font-bold">{t("admin.threads.topic")}</dt>
        <dd>{topicLabel(thread.topic)}</dd>
        <dt className="font-bold">{t("admin.threads.author")}</dt>
        <dd>
          {thread.author.display_name}
          {thread.author.organisation && `, ${thread.author.organisation}`}
          {thread.author.sector && ` (${sectorLabel(thread.author.sector)})`}
          {thread.demo && ` · ${t("admin.demo")}`}
          {thread.author.email && (
            <>
              , <a href={`mailto:${thread.author.email}`}>{thread.author.email}</a>
            </>
          )}
        </dd>
        <dt className="font-bold">{t("card.place")}</dt>
        <dd>{getGmina(thread.place_terc)?.name ?? t("admin.none")}</dd>
        {thread.target_groups.length > 0 && (
          <>
            <dt className="font-bold">{t("card.groups")}</dt>
            <dd>{thread.target_groups.map(targetGroupLabel).join(", ")}</dd>
          </>
        )}
        {thread.ref && (
          <>
            <dt className="font-bold">{t("admin.threads.ref")}</dt>
            <dd>
              {thread.ref.type === "innovation" && <Link href={`/innowacja/${thread.ref.id}`}>{getInnovation(thread.ref.id)?.title ?? thread.ref.id}</Link>}
              {thread.ref.type === "idea" && <Link href={`/rops/pomysly/${thread.ref.id}`}>{t("talk.thread.refIdea")}</Link>}
              {thread.ref.type === "partnership" && <Link href="/rops/partnerstwa">{post?.title ?? t("talk.thread.refPartnership")}</Link>}
            </dd>
          </>
        )}
      </dl>

      <section aria-labelledby="wiadomosci-panel" className="grid gap-4 border-t border-border pt-6">
        <h2 id="wiadomosci-panel" className="text-[1.3rem] font-bold">
          {t("talk.thread.messages")}
        </h2>
        <ol className="grid gap-3">
          {thread.messages.map((item) => (
            <li key={item.id} className={item.author === "uzytkownik" ? "grid gap-1 rounded-lg border-2 border-border p-4" : "grid gap-1 rounded-lg border-2 border-foreground bg-muted p-4"}>
              <p className="font-bold">
                {item.author === "uzytkownik"
                  ? thread.author.display_name
                  : item.author === "rops"
                    ? t("talk.thread.rops", { name: item.name ?? "ROPS" })
                    : t("talk.thread.mentorSays", { name: item.name ?? "" })}
                <span className="font-normal text-muted-foreground"> · {formatDate(item.at)}</span>
              </p>
              <p className="whitespace-pre-line">{item.text}</p>
            </li>
          ))}
        </ol>
        <form action={replyThread} className="no-print grid max-w-[48rem] gap-3">
          <input type="hidden" name="id" value={thread.id} />
          <input type="hidden" name="wroc" value={back} />
          <div className="grid gap-1">
            <Label htmlFor="odpowiedz-rops">{t("admin.threads.reply")}</Label>
            <Hint id="odpowiedz-rops-podpowiedz">{t("admin.threads.replyHint")}</Hint>
            <textarea id="odpowiedz-rops" name="odpowiedz" rows={4} maxLength={3000} required className={controlClass} aria-describedby="odpowiedz-rops-podpowiedz" />
          </div>
          <div>
            <Button type="submit">{t("admin.threads.send")}</Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="mentor" className="grid gap-3 border-t border-border pt-6">
        <h2 id="mentor" className="text-[1.3rem] font-bold">
          {t("admin.threads.mentorTitle")}
        </h2>
        <p>{thread.mentor ? t("admin.threads.mentorNow", { name: thread.mentor.name }) : t("admin.threads.noMentor")}</p>
        {mentors.some((mentor) => mentor.active) ? (
          <form action={assignMentor} className="no-print grid gap-2 @xl:grid-cols-[minmax(0,1fr)_auto] @xl:items-end">
            <input type="hidden" name="id" value={thread.id} />
            <input type="hidden" name="wroc" value={back} />
            <div className="grid gap-1">
              <Label htmlFor="wybor-mentora">{t("admin.threads.chooseMentor")}</Label>
              <select id="wybor-mentora" name="mentor" defaultValue={thread.mentor?.id ?? ""} className={controlClass}>
                {mentors
                  .filter((mentor) => mentor.active)
                  .map((mentor) => (
                    <option key={mentor.id} value={mentor.id}>
                      {mentor.name}: {mentor.expertise_pl}
                    </option>
                  ))}
              </select>
            </div>
            <Button type="submit" variant="secondary">
              {t(thread.mentor ? "admin.threads.newMentorLink" : "admin.threads.invite")}
            </Button>
          </form>
        ) : (
          <p>
            <Link href="/rops/mentorzy">{t("admin.threads.addMentors")}</Link>
          </p>
        )}
      </section>

      <section aria-labelledby="status-rozmowy" className="grid gap-3 border-t border-border pt-6">
        <h2 id="status-rozmowy" className="text-[1.3rem] font-bold">
          {t("admin.threads.statusTitle")}
        </h2>
        <form action={updateThreadStatus} className="no-print grid gap-2 @xl:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] @xl:items-end">
          <input type="hidden" name="id" value={thread.id} />
          <input type="hidden" name="wroc" value={back} />
          <div className="grid gap-1">
            <Label htmlFor="status-wybor">{t("admin.threads.status")}</Label>
            <select id="status-wybor" name="status" defaultValue={thread.status} className={controlClass}>
              {threadStatusCodes.map((code) => (
                <option key={code} value={code}>
                  {threadStatusLabel(code)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="notatka-rozmowy">{t("admin.note")}</Label>
            <input id="notatka-rozmowy" name="notatka" maxLength={1000} defaultValue={thread.note_pl ?? ""} className={controlClass} />
          </div>
          <Button type="submit" variant="secondary">
            {t("admin.saveStatus")}
          </Button>
        </form>
        <form action={resetAuthorLink} className="no-print">
          <input type="hidden" name="id" value={thread.id} />
          <input type="hidden" name="wroc" value={back} />
          <p className="mb-2 text-muted-foreground">{t("admin.threads.resetHint")}</p>
          <Button type="submit" variant="text">
            {t("admin.threads.reset")}
          </Button>
        </form>
      </section>
    </AdminShell>
  );
}
