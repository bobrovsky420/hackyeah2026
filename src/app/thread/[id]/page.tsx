import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RememberThread } from "@/components/talk/remember-thread";
import { ReplyForm } from "@/components/talk/reply-form";
import { Notice } from "@/components/ui/notice";
import { getGmina, getInnovation, helplines } from "@/lib/catalogue";
import type { Thread } from "@/lib/contracts";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { threadStatusLabel, topicLabel } from "@/lib/labels";
import { repository } from "@/server/db";
import { roleFor } from "@/server/threads";

/** A private page: never indexed, and its address never sent on to another site. */
export const metadata: Metadata = { title: t("talk.thread.meta"), robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const time = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" });

function refLink(ref: Thread["ref"]): { href: string; label: string } | null {
  if (!ref) return null;
  if (ref.type === "innovation") return { href: `/innowacja/${ref.id}`, label: getInnovation(ref.id)?.title ?? ref.id };
  if (ref.type === "idea") return { href: `/pomysl/${ref.id}`, label: t("talk.thread.refIdea") };
  return { href: "/partnerstwa", label: t("talk.thread.refPartnership") };
}

/**
 * Module V: one conversation, opened by its private link. The author and
 * the mentor write here; ROPS writes from its panel. A wrong key and an
 * unknown conversation look the same: not found.
 */
export default async function ThreadPage({ params, searchParams }: PageProps<"/thread/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const key = typeof query.klucz === "string" ? query.klucz : null;
  const thread = await repository().getThread(id);
  const role = thread ? roleFor(thread, key) : null;
  if (!thread || !role || !key) notFound();
  const ref = refLink(thread.ref);
  const gmina = getGmina(thread.place_terc);

  return (
    <article aria-labelledby="naglowek-rozmowy" className="grid max-w-[48rem] gap-8">
      {role === "uzytkownik" && <RememberThread id={thread.id} keyValue={key} subject={thread.subject} />}
      <header className="grid gap-2">
        <p className="font-bold text-muted-foreground">{topicLabel(thread.topic)}</p>
        <h1 id="naglowek-rozmowy" tabIndex={-1} className="text-[1.75rem] leading-tight font-bold @3xl:text-[2.2rem]">
          {thread.subject}
        </h1>
        <p>
          <span className="font-bold">{t("talk.thread.status")}</span> {threadStatusLabel(thread.status)}
          {gmina && ` · ${gmina.name}`}
          {ref && (
            <>
              {" · "}
              <Link href={ref.href}>{ref.label}</Link>
            </>
          )}
        </p>
        {thread.mentor && <p>{t("talk.thread.mentor", { name: thread.mentor.name })}</p>}
      </header>

      <Notice title={t(role === "mentor" ? "talk.thread.mentorNotice.title" : "talk.thread.private.title")}>
        <p>{t(role === "mentor" ? "talk.thread.mentorNotice.text" : "talk.thread.private.text")}</p>
      </Notice>

      <section aria-labelledby="wiadomosci" className="grid gap-4">
        <h2 id="wiadomosci" className="text-[1.3rem] font-bold">
          {t("talk.thread.messages")}
        </h2>
        <ol className="grid gap-4">
          {thread.messages.map((item) => {
            const who =
              item.author === "uzytkownik"
                ? role === "uzytkownik"
                  ? t("talk.thread.you")
                  : thread.author.display_name
                : item.author === "rops"
                  ? t("talk.thread.rops", { name: item.name ?? "ROPS" })
                  : t("talk.thread.mentorSays", { name: item.name ?? "" });
            return (
              <li
                key={item.id}
                className={
                  item.author === "uzytkownik"
                    ? "grid gap-1 rounded-lg border-2 border-border p-4"
                    : "grid gap-1 rounded-lg border-2 border-foreground bg-muted p-4"
                }
              >
                <p className="font-bold">
                  {who}
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {formatDate(item.at)}, {time.format(new Date(item.at))}
                  </span>
                </p>
                <p className="whitespace-pre-line">{item.text}</p>
              </li>
            );
          })}
        </ol>
        {thread.messages.at(-1)?.author !== "rops" && thread.status !== "zamknieta" && (
          <p className="text-muted-foreground">{t("talk.thread.waiting")}</p>
        )}
      </section>

      {thread.status === "zamknieta" && <p>{t("talk.thread.closed")}</p>}
      <ReplyForm threadId={thread.id} keyValue={key} asMentor={role === "mentor"} helplines={helplines()} />
    </article>
  );
}
