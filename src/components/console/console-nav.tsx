"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const sections: { href: string; label: MessageKey }[] = [
  { href: "/rops", label: "console.nav.moderation" },
  { href: "/rops/potrzeby", label: "console.nav.needs" },
  { href: "/rops/kontakty", label: "console.nav.contacts" },
  { href: "/rops/gotowosc", label: "console.nav.readiness" },
  { href: "/rops/miary", label: "console.nav.stats" },
];

/** The console's tabs as navigation links: every tab has an address. */
export function ConsoleNav() {
  const pathname = usePathname();
  return (
    <nav aria-label={t("console.nav.label")} className="no-print border-b border-border">
      <ul className="flex flex-wrap gap-x-6">
        {sections.map((section) => {
          const current = pathname === section.href;
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center font-bold",
                  current && "text-foreground no-underline shadow-[inset_0_-4px_0_var(--primary)]",
                )}
              >
                {t(section.label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
