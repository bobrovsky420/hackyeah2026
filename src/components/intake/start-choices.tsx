"use client";

import Link from "next/link";
import { t, type MessageKey } from "@/lib/i18n";

const CHOICES: { href: string; title: MessageKey; text: MessageKey }[] = [
  { href: "#problem", title: "s1.choose.need.title", text: "s1.choose.need.text" },
  { href: "/zglos-pomysl", title: "s1.choose.idea.title", text: "s1.choose.idea.text" },
  { href: "/chce-pomoc", title: "s1.choose.help.title", text: "s1.choose.help.text" },
  { href: "/zapytaj", title: "s1.choose.ask.title", text: "s1.choose.ask.text" },
];

const tileClass =
  "grid h-full content-start gap-1 rounded-md border-2 border-input bg-background p-3 text-foreground no-underline hover:border-primary hover:bg-accent hover:text-foreground aria-[current=true]:border-primary aria-[current=true]:shadow-[inset_0_0_0_2px_var(--primary)]";

/**
 * S1's four ways in, above the form: a need (this page; the tile moves focus
 * to the description), an idea, help, a question to ROPS. Phrased as what a
 * person has, so nobody with an idea or an offer of help lands on a form
 * that is not theirs. Two by two at every width; on a phone the titles
 * alone, so the form stays near the top.
 */
export function StartChoices() {
  return (
    <nav aria-labelledby="co-chcesz" className="no-print grid gap-2">
      <p id="co-chcesz" className="font-bold">
        {t("s1.choose.title")}
      </p>
      <ul className="grid grid-cols-2 gap-2">
        {CHOICES.map((choice) => (
          <li key={choice.href}>
            {choice.href.startsWith("#") ? (
              <a
                href={choice.href}
                aria-current="true"
                className={tileClass}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById("problem")?.focus();
                }}
              >
                <span className="font-bold text-primary underline underline-offset-4">{t(choice.title)}</span>
                <span className="hidden text-[0.95rem] text-muted-foreground @md:block">{t(choice.text)}</span>
              </a>
            ) : (
              <Link href={choice.href} className={tileClass}>
                <span className="font-bold text-primary underline underline-offset-4">{t(choice.title)}</span>
                <span className="hidden text-[0.95rem] text-muted-foreground @md:block">{t(choice.text)}</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
