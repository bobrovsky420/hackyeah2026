import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/info/info-page";
import { AskForm, type AskRef } from "@/components/talk/ask-form";
import { Notice } from "@/components/ui/notice";
import { getInnovation, helplines } from "@/lib/catalogue";
import { t } from "@/lib/i18n";
import { isTopic } from "@/lib/labels";
import { localityOptions, placeOptions } from "@/lib/places";
import { repository } from "@/server/db";

export const metadata: Metadata = { title: t("talk.ask.meta") };

/**
 * Module V: "Zapytaj ROPS". Opened plain, or from an innovation
 * (?innowacja=), an idea card (?pomysl=) or a partnership post
 * (?partnerstwo=), which the conversation then refers to.
 */
export default async function AskPage({ searchParams }: PageProps<"/ask">) {
  const query = await searchParams;
  const one = (name: string) => (typeof query[name] === "string" ? (query[name] as string) : null);
  let refItem: AskRef | null = null;
  const innovation = getInnovation(one("innowacja"));
  if (innovation) refItem = { type: "innovation", id: innovation.id, label: innovation.title };
  const ideaId = one("pomysl");
  const idea = ideaId ? await repository().getIdea(ideaId) : undefined;
  if (idea && !idea.demo) refItem = { type: "idea", id: idea.id, label: idea.title };
  const postId = one("partnerstwo");
  const post = postId ? await repository().getPost(postId) : undefined;
  if (post?.moderation.status === "zatwierdzone" && !post.demo) refItem = { type: "partnership", id: post.id, label: post.title };

  const topic = refItem?.type === "partnership" ? "partnerstwo" : isTopic(one("temat")) ? (one("temat") as "pytanie") : "pytanie";
  const defaultSubject =
    refItem?.type === "partnership"
      ? t("talk.subject.partnership", { title: refItem.label })
      : refItem
        ? t("talk.subject.about", { title: refItem.label })
        : "";

  return (
    <InfoPage journey="ask" title={t("talk.ask.title")} lead={t("talk.ask.lead")}>
      <Notice title={t("talk.ask.how.title")}>
        <p>{t("talk.ask.how.text")}</p>
        <p>
          <Link href="/rozmowy">{t("talk.ask.mine")}</Link> · <Link href="/partnerstwa">{t("talk.ask.board")}</Link>
        </p>
      </Notice>
      <AskForm
        topic={topic}
        refItem={refItem}
        defaultSubject={defaultSubject}
        places={placeOptions()}
        localities={localityOptions()}
        helplines={helplines()}
      />
    </InfoPage>
  );
}
