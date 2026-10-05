"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MAP_ENABLED } from "@/lib/features";
import { t, type MessageKey } from "@/lib/i18n";
import { journeyOf } from "@/lib/journeys";
import { publicPath } from "@/lib/page-routes";
import { cn } from "@/lib/utils";
import { NewBadge } from "@/components/ui/new-badge";
import { useMine } from "./use-mine";

const navigation: { href: string; label: MessageKey }[] = [
  { href: "/", label: "shell.nav.describe" },
  ...(MAP_ENABLED ? [{ href: "/mapa", label: "shell.nav.map" } as const] : []),
  { href: "/zglos-pomysl", label: "shell.nav.idea" },
  { href: "/zapytaj", label: "shell.nav.ask" },
  { href: "/partnerstwa", label: "shell.nav.partnerships" },
  { href: "/chce-pomoc", label: "shell.nav.help" },
  { href: "/jak-to-dziala", label: "shell.nav.how" },
];

/**
 * "Moje sprawy": in the menu only once this browser remembers a
 * conversation or an idea card (FR-15.8), and only while the menu is
 * folded; a wide screen has it in the bar above the header (MineLink),
 * since eight items do not fit beside the logos.
 */
const MINE = { href: "/rozmowy", label: "shell.nav.mine" } as const satisfies { href: string; label: MessageKey };

export function SiteHeader() {
  const pathname = publicPath(usePathname());
  const [menuOpen, setMenuOpen] = useState(false);
  const mine = useMine();
  const unread = mine?.unread ?? 0;
  const items = mine?.remembered ? [...navigation.slice(0, -1), MINE, ...navigation.slice(-1)] : navigation;

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-2 gap-y-3 px-4 py-4 @md:gap-x-8 @3xl:px-8">
        <div className="flex items-center gap-2 @md:gap-4">
          {/*
            The mark of the Małopolska region, without its wordmark, before
            the HubMI.pl block and as tall as it; smaller on a phone, so the
            menu button stays on the same row.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/malopolska-znak.png" alt={t("shell.malopolska")} width={92} height={90} className="h-8 w-auto @md:h-[3.2rem]" />
          <Link
            href="/"
            className="grid leading-tight text-foreground no-underline hover:text-foreground"
            onClick={() => setMenuOpen(false)}
          >
            <span className="text-2xl font-extrabold tracking-tight">
              HubMI<span className="text-primary">.pl</span>
            </span>
            <span className="text-[0.95rem] text-muted-foreground">{t("shell.tagline")}</span>
          </Link>
        </div>
        <div className="no-print @6xl:hidden">
          <button
            type="button"
            className="view-tool"
            aria-expanded={menuOpen}
            aria-controls="menu-glowne"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {/* A new answer takes the icon's place: the phone header has no room for more. */}
            {unread > 0 ? (
              <span aria-hidden className="grid size-5 place-content-center rounded-full bg-primary text-[0.8rem] font-bold text-primary-foreground">
                {unread}
              </span>
            ) : (
              <Menu aria-hidden className="size-5" />
            )}
            {t("shell.menu")}
            {unread > 0 && <span className="sr-only">{t("shell.menu.unread", { count: unread })}</span>}
          </button>
        </div>
        <nav
          id="menu-glowne"
          aria-label={t("shell.nav.label")}
          className={cn("no-print w-full @6xl:block @6xl:w-auto", menuOpen ? "block" : "hidden")}
        >
          <ul className="grid gap-1 @6xl:flex @6xl:gap-6">
            {items.map((item) => {
              const current = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <li key={item.href} className={item.href === MINE.href ? "@6xl:hidden" : undefined}>
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    data-journey={journeyOf(item.href) ?? undefined}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "inline-flex min-h-11 items-center font-bold whitespace-nowrap",
                      // The current item is underlined in the colour of its journey (decision U.10).
                      current && "text-foreground no-underline shadow-[inset_0_-4px_0_var(--j-rule)]",
                    )}
                  >
                    {t(item.label)}
                    {item.href === MINE.href && unread > 0 && (
                      <span className="ml-2">
                        <NewBadge>{t("shell.nav.new")}</NewBadge>
                        <span className="sr-only">{t("shell.nav.unread", { count: unread })}</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
