"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { JourneyMark } from "@/components/ui/journey-mark";
import { t, type MessageKey } from "@/lib/i18n";
import type { Journey } from "@/lib/journeys";

const CHOICES: { href: string; journey: Journey; title: MessageKey; text: MessageKey }[] = [
  { href: "#problem", journey: "need", title: "s1.choose.need.title", text: "s1.choose.need.text" },
  { href: "/zglos-pomysl", journey: "idea", title: "s1.choose.idea.title", text: "s1.choose.idea.text" },
  { href: "/chce-pomoc", journey: "help", title: "s1.choose.help.title", text: "s1.choose.help.text" },
  { href: "/zapytaj", journey: "ask", title: "s1.choose.ask.title", text: "s1.choose.ask.text" },
];

// Each tile in the colours of its journey (decision U.10); the chosen one on its tint.
const tileClass =
  "group flex h-full items-start gap-3 rounded-md border-2 border-journey-rule bg-background p-3 text-foreground no-underline hover:bg-journey-tint hover:text-foreground aria-[current=true]:border-journey-ink aria-[current=true]:bg-journey-tint aria-[current=true]:shadow-[inset_0_0_0_2px_var(--j-ink)]";

function TileBody({ journey, title, text }: { journey: Journey; title: MessageKey; text: MessageKey }): ReactNode {
  return (
    <>
      <JourneyMark journey={journey} className="hidden group-hover:bg-background group-aria-[current=true]:bg-background @md:grid" />
      <span className="grid gap-1">
        <span className="font-bold text-journey-ink underline underline-offset-4">{t(title)}</span>
        <span className="hidden text-[0.95rem] text-muted-foreground @md:block">{t(text)}</span>
      </span>
    </>
  );
}

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
          <li key={choice.href} data-journey={choice.journey}>
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
                <TileBody journey={choice.journey} title={choice.title} text={choice.text} />
              </a>
            ) : (
              <Link href={choice.href} className={tileClass}>
                <TileBody journey={choice.journey} title={choice.title} text={choice.text} />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
