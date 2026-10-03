import Link from "next/link";
import { t, type MessageKey } from "@/lib/i18n";

const pages: { href: string; label: MessageKey }[] = [
  { href: "/jak-to-dziala", label: "shell.footer.how" },
  { href: "/zasady", label: "shell.footer.rules" },
  { href: "/zrodla", label: "shell.footer.sources" },
  { href: "/prywatnosc", label: "shell.footer.privacy" },
  { href: "/dostepnosc", label: "shell.footer.accessibility" },
];

export function SiteFooter() {
  return (
    <footer className="no-print border-t border-border bg-muted">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 text-[0.95rem] @3xl:px-8">
        <nav aria-label={t("shell.footer.navLabel")}>
          <ul className="flex flex-wrap gap-x-6">
            {pages.map((page) => (
              <li key={page.href}>
                <Link href={page.href} className="inline-flex min-h-11 items-center">
                  {t(page.label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p>
          {t("shell.footer.catalogues")}{" "}
          <a href="https://innowacjespoleczne.pl/">{t("source.name.national")}</a> {t("common.and")}{" "}
          <a href="https://rops.krakow.pl/innowacje-spoleczne/biblioteka-innowacji-spolecznych">
            {t("source.name.rops")}
          </a>
          .
        </p>
        <p className="text-muted-foreground">{t("shell.footer.prototype")}</p>
      </div>
    </footer>
  );
}
