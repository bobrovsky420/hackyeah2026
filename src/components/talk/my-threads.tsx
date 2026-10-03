"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { forgetThread, parseSaved, savedSnapshot, subscribeSaved } from "./saved-threads";

/** "Moje rozmowy": the conversations this browser remembers, each with its private link. */
export function MyThreads() {
  // The server renders nothing: the list lives only in this browser.
  const snapshot = useSyncExternalStore(subscribeSaved, savedSnapshot, () => null);
  const items = useMemo(() => (snapshot === null ? null : parseSaved(snapshot)), [snapshot]);

  if (items === null) return null;
  if (items.length === 0) return <p>{t("talk.mine.empty")}</p>;

  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
          <div className="grid gap-1">
            <Link href={`/rozmowa/${item.id}?klucz=${encodeURIComponent(item.key)}`} className="font-bold">
              {item.subject}
            </Link>
            <span className="text-muted-foreground">{t("talk.mine.saved", { date: formatDate(item.savedAt) })}</span>
          </div>
          <Button
            type="button"
            variant="text"
            onClick={() => forgetThread(item.id)}
          >
            {t("talk.mine.forget", { subject: item.subject })}
          </Button>
        </li>
      ))}
    </ul>
  );
}
