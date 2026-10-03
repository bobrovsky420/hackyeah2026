import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/info/info-page";
import { Button, buttonVariants } from "@/components/ui/button";
import { controlClass, Label } from "@/components/ui/field";
import { getGmina } from "@/lib/catalogue";
import type { Sector } from "@/lib/contracts";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { isSector, sectorCodes, sectorLabel, targetGroupLabel } from "@/lib/labels";
import { repository } from "@/server/db";
import { isReal } from "@/server/db/repository";

export const metadata: Metadata = { title: t("talk.board.title") };

/**
 * Module V: the partnership board. Only posts ROPS approved; no contact is
 * shown, "Chcę współpracować" opens a conversation with ROPS, which
 * connects the two sides.
 */
export default async function PartnershipsPage({ searchParams }: PageProps<"/partnerships">) {
  const query = await searchParams;
  const sector = isSector(query.sektor) ? (query.sektor as Sector) : null;
  const posts = (await repository().listPosts({ moderation: "zatwierdzone" })).filter(
    (post) => isReal(post) && (!sector || post.sector === sector || post.seeking.includes(sector)),
  );

  return (
    <InfoPage title={t("talk.board.title")} lead={t("talk.board.lead")}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <form method="get" className="no-print grid gap-2 @xl:grid-cols-[minmax(0,18rem)_auto] @xl:items-end">
          <div className="grid gap-1">
            <Label htmlFor="sektor">{t("talk.board.filter")}</Label>
            <select id="sektor" name="sektor" defaultValue={sector ?? ""} className={controlClass}>
              <option value="">{t("talk.board.allSectors")}</option>
              {sectorCodes.map((code) => (
                <option key={code} value={code}>
                  {sectorLabel(code)}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary">
            {t("talk.board.show")}
          </Button>
        </form>
        <Link href="/partnerstwa/nowe" className={buttonVariants()}>
          {t("talk.board.add")}
        </Link>
      </div>
      {posts.length === 0 ? (
        <p>{t("talk.board.empty")}</p>
      ) : (
        <ul className="grid gap-4">
          {posts.map((post) => (
            <li key={post.id}>
              <article aria-labelledby={`ogloszenie-${post.id}`} className="grid gap-2 rounded-lg border border-border p-5">
                <p className="justify-self-start rounded-sm border-2 border-foreground px-2 text-[0.9rem] font-bold">
                  {t(post.kind === "szukam" ? "talk.board.kind.szukam" : "talk.board.kind.oferuje")}
                </p>
                <h2 id={`ogloszenie-${post.id}`} className="text-[1.2rem] font-bold">
                  {post.title}
                </h2>
                <p className="text-muted-foreground">
                  {post.author.organisation ?? post.author.display_name} · {sectorLabel(post.sector)}
                  {getGmina(post.place_terc) && ` · ${getGmina(post.place_terc)?.name}`} · {formatDate(post.created_at)}
                </p>
                <p className="whitespace-pre-line">{post.description}</p>
                {post.seeking.length > 0 && (
                  <p>
                    <span className="font-bold">{t("talk.board.seeking")}</span> {post.seeking.map(sectorLabel).join(", ")}
                  </p>
                )}
                {post.target_groups.length > 0 && (
                  <p>
                    <span className="font-bold">{t("talk.board.groups")}</span> {post.target_groups.map(targetGroupLabel).join(", ")}
                  </p>
                )}
                <div className="no-print">
                  <Link href={`/zapytaj?partnerstwo=${post.id}`} className={buttonVariants({ variant: "secondary" })}>
                    {t("talk.board.respond")}
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </InfoPage>
  );
}
