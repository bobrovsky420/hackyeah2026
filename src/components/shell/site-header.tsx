"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { t, type MessageKey } from "@/lib/i18n";
import { publicPath } from "@/lib/page-routes";
import { cn } from "@/lib/utils";

const navigation: { href: string; label: MessageKey }[] = [
  { href: "/", label: "shell.nav.describe" },
  { href: "/mapa", label: "shell.nav.map" },
  { href: "/zglos-pomysl", label: "shell.nav.idea" },
  { href: "/zapytaj", label: "shell.nav.ask" },
  { href: "/partnerstwa", label: "shell.nav.partnerships" },
  { href: "/chce-pomoc", label: "shell.nav.help" },
  { href: "/jak-to-dziala", label: "shell.nav.how" },
];

export function SiteHeader() {
  const pathname = publicPath(usePathname());
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 py-4 @3xl:px-8">
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
        <div className="no-print @6xl:hidden">
          <button
            type="button"
            className="view-tool"
            aria-expanded={menuOpen}
            aria-controls="menu-glowne"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Menu aria-hidden className="size-5" />
            {t("shell.menu")}
          </button>
        </div>
        <nav
          id="menu-glowne"
          aria-label={t("shell.nav.label")}
          className={cn("no-print w-full @6xl:block @6xl:w-auto", menuOpen ? "block" : "hidden")}
        >
          <ul className="grid gap-1 @6xl:flex @6xl:gap-6">
            {navigation.map((item) => {
              const current = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "inline-flex min-h-11 items-center font-bold whitespace-nowrap",
                      current && "text-foreground no-underline shadow-[inset_0_-4px_0_var(--primary)]",
                    )}
                  >
                    {t(item.label)}
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
