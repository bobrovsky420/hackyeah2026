"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { NewBadge } from "@/components/talk/my-threads";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { t, type MessageKey } from "@/lib/i18n";
import { forgetIdea, ideasSnapshot, parseIdeas, subscribeIdeas } from "./saved-ideas";

type Status = { status: string; reply_at: string | null };

/**
 * "Moje zgłoszenia": the idea cards sent from this browser, with their
 * status and "Nowa odpowiedź ROPS" where ROPS replied after the card was
 * last opened here. Nothing shows when the browser sent none.
 */
export function MyIdeas() {
  const snapshot = useSyncExternalStore(subscribeIdeas, ideasSnapshot, () => null);
  const items = useMemo(() => (snapshot === null ? null : parseIdeas(snapshot)), [snapshot]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const ids = useMemo(() => JSON.stringify((items ?? []).map((item) => item.id)), [items]);

  useEffect(() => {
    const asked = JSON.parse(ids) as string[];
    if (asked.length === 0) return;
    let cancelled = false;
    fetch("/api/ideas/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: asked }) })
      .then((response) => (response.ok ? response.json() : { ideas: [] }))
      .then((body: { ideas?: ({ id: string } & Status)[] }) => {
        if (!cancelled) setStatuses(Object.fromEntries((body.ideas ?? []).map(({ id, ...rest }) => [id, rest])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ids]);

  if (!items || items.length === 0) return null;

  return (
    <section aria-labelledby="moje-zgloszenia" className="grid gap-3">
      <h2 id="moje-zgloszenia" className="text-[1.3rem] font-bold @3xl:text-[1.45rem]">
        {t("talk.mine.ideas.title")}
      </h2>
      <ul className="grid gap-3">
        {items.map((item) => {
          const known = statuses[item.id];
          const fresh = Boolean(known?.reply_at && known.reply_at > item.seenAt);
          return (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
              <div className="grid gap-1">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link href={`/pomysl/${item.id}`} className="font-bold">
                    {item.title}
                  </Link>
                  {fresh && <NewBadge>{t("talk.mine.ideas.newReply")}</NewBadge>}
                </span>
                <span className="text-muted-foreground">
                  {t("talk.mine.saved", { date: formatDate(item.savedAt) })}
                  {known && ` · ${t("talk.mine.ideas.status", { status: t(`idea.status.${known.status}` as MessageKey) })}`}
                </span>
              </div>
              <Button type="button" variant="text" onClick={() => forgetIdea(item.id)}>
                {t("talk.mine.ideas.forget", { title: item.title })}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
