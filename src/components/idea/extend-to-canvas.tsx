"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { buttonVariants } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { ideasSnapshot, parseIdeas, subscribeIdeas } from "./saved-ideas";

/**
 * "Rozbuduj do wniosku CANVAS" on a short-form card, in the browser that
 * sent it only: the wizard starts from the card's fields and its
 * assistant's suggestions, and the application links back to the card.
 */
export function ExtendToCanvas({ ideaId }: { ideaId: string }) {
  const snapshot = useSyncExternalStore(subscribeIdeas, ideasSnapshot, () => null);
  const mine = useMemo(() => (snapshot === null ? false : parseIdeas(snapshot).some((item) => item.id === ideaId)), [snapshot, ideaId]);
  if (!mine) return null;
  return (
    <Link href={`/zglos-pomysl/canvas?z=${encodeURIComponent(ideaId)}`} className={buttonVariants({ variant: "secondary" })}>
      {t("card.extend")}
    </Link>
  );
}
