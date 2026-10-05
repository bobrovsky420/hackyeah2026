"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { NewBadge } from "@/components/ui/new-badge";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { forgetThread, parseSaved, savedSnapshot, subscribeSaved } from "./saved-threads";

/** When ROPS or a mentor last answered, per conversation id; from POST /api/threads/status. */
type Answers = Record<string, string | null>;

/**
 * "Moje rozmowy": the conversations this browser remembers, each with its
 * private link, and "Nowa odpowiedź" where ROPS or a mentor answered after
 * it was last opened here. The server is asked with the keys the browser
 * already holds and answers with dates only.
 */
export function MyThreads() {
  // The server renders nothing: the list lives only in this browser.
  const snapshot = useSyncExternalStore(subscribeSaved, savedSnapshot, () => null);
  const items = useMemo(() => (snapshot === null ? null : parseSaved(snapshot)), [snapshot]);
  const [answers, setAnswers] = useState<Answers>({});
  const asked = useMemo(() => JSON.stringify((items ?? []).map(({ id, key }) => ({ id, key }))), [items]);

  useEffect(() => {
    const threads = JSON.parse(asked) as { id: string; key: string }[];
    if (threads.length === 0) return;
    let cancelled = false;
    fetch("/api/threads/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threads }) })
      .then((response) => (response.ok ? response.json() : { threads: [] }))
      .then((body: { threads?: { id: string; last_answer_at: string | null }[] }) => {
        if (!cancelled) setAnswers(Object.fromEntries((body.threads ?? []).map((item) => [item.id, item.last_answer_at])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [asked]);

  if (items === null) return null;
  if (items.length === 0) return <p>{t("talk.mine.empty")}</p>;

  const isNew = (item: (typeof items)[number]) => {
    const answered = answers[item.id];
    return Boolean(answered && answered > (item.seenAt ?? item.savedAt));
  };
  const fresh = items.filter(isNew).length;

  return (
    <div className="grid gap-3">
      <p role="status" className="font-bold">
        {fresh > 0 ? t("talk.mine.newSummary", { count: fresh }) : ""}
      </p>
      <ul className="grid gap-3">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
            <div className="grid gap-1">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link href={`/rozmowa/${item.id}?klucz=${encodeURIComponent(item.key)}`} className="font-bold">
                  {item.subject}
                </Link>
                {isNew(item) && <NewBadge>{t("talk.mine.newAnswer")}</NewBadge>}
              </span>
              <span className="text-muted-foreground">{t("talk.mine.saved", { date: formatDate(item.savedAt) })}</span>
            </div>
            <Button type="button" variant="text" onClick={() => forgetThread(item.id)}>
              {t("talk.mine.forget", { subject: item.subject })}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
