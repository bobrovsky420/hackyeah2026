"use client";

import Link from "next/link";
import { NewBadge } from "@/components/ui/new-badge";
import { t } from "@/lib/i18n";
import { useMine } from "./use-mine";

/**
 * "Moje sprawy" in the bar above the header on a wide screen, where the
 * menu has no room for it: shown once this browser remembers a
 * conversation or an idea card, with "nowe" after an unread answer. A
 * narrower screen has it in the menu instead.
 */
export function MineLink() {
  const mine = useMine();
  if (!mine?.remembered) return null;
  return (
    <Link href="/rozmowy" className="hidden min-h-11 items-center gap-2 font-bold @6xl:inline-flex">
      {t("shell.nav.mine")}
      {mine.unread > 0 && (
        <>
          <NewBadge>{t("shell.nav.new")}</NewBadge>
          <span className="sr-only">{t("shell.nav.unread", { count: mine.unread })}</span>
        </>
      )}
    </Link>
  );
}
