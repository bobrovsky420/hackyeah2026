"use client";

import { Phone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Helpline } from "@/lib/contracts/contacts";
import { t } from "@/lib/i18n";
import { FocusOnMount } from "./focus-on-mount";
import { QuickExit } from "./quick-exit";

/** A number with its name and, once verified, its hours (FR-12.5 asks for honest hours). */
function HelplineRow({ line }: { line: Helpline }) {
  return (
    <li>
      <a
        href={line.href}
        className="btn flex min-h-14 items-center gap-4 rounded-lg border-2 border-input bg-background p-4 text-foreground no-underline hover:bg-accent hover:text-foreground"
      >
        <Phone aria-hidden className="size-6 shrink-0 text-primary" />
        <span className="grid">
          <span className="text-[1.5rem] leading-tight font-bold tabular-nums">{line.number}</span>
          <span>{line.name}</span>
          {line.hours && <span className="text-muted-foreground">{line.hours}</span>}
        </span>
      </a>
    </li>
  );
}

/**
 * S10 (FR-12.5): numbers before any other content, only the quick exit
 * above them; the two entry paths only reorder the list. Nothing typed is
 * stored.
 */
export function HumanHelp({
  placeName,
  helplines,
  titleAs: Title = "h1",
}: {
  placeName: string | null;
  /** From the server page: data/helplines.yaml or the fixtures. */
  helplines: { alarm: Helpline[]; support: Helpline[] };
  /** "h2" inside a page that has its own h1, such as the needs form (S9c). */
  titleAs?: "h1" | "h2";
}) {
  const [focus, setFocus] = useState<"self" | "someone" | null>(null);
  const ordered = focus
    ? [...helplines.support].sort((a, b) => Number(a.forWhom !== focus && a.forWhom !== "both") - Number(b.forWhom !== focus && b.forWhom !== "both"))
    : helplines.support;

  return (
    <div className="grid max-w-[40rem] gap-7">
      <FocusOnMount targetId="naglowek-drogi" />
      <QuickExit />
      <Title id="naglowek-drogi" tabIndex={-1} className="text-[1.75rem] leading-tight font-bold @3xl:text-[2.2rem]">
        {t("s10.title")}
      </Title>

      <section aria-labelledby="numery-alarmowe" className="grid gap-2">
        <h2 id="numery-alarmowe" className="text-[1.2rem] font-bold">
          {t("s10.emergency.title")}
        </h2>
        <ul className="grid gap-2">
          {helplines.alarm.map((line) => (
            <HelplineRow key={line.id} line={line} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="pomoc-rozmowa" className="grid gap-3">
        <h2 id="pomoc-rozmowa" className="text-[1.2rem] font-bold">
          {t("s10.talk.title")}
        </h2>
        <div role="group" aria-label={t("s10.paths.label")} className="flex flex-wrap gap-2">
          <Button variant="secondary" aria-pressed={focus === "self"} onClick={() => setFocus("self")}>
            {t("s10.paths.self")}
          </Button>
          <Button variant="secondary" aria-pressed={focus === "someone"} onClick={() => setFocus("someone")}>
            {t("s10.paths.someone")}
          </Button>
        </div>
        <ul className="grid gap-2">
          {ordered.map((line) => (
            <HelplineRow key={line.id} line={line} />
          ))}
        </ul>
      </section>

      <div className="grid gap-3 text-[1.1rem]">
        <p>{t("s10.care")}</p>
        <p>{placeName ? t("s10.ops.place", { place: placeName }) : t("s10.ops.generic")}</p>
        <p>{t("s10.individual")}</p>
      </div>

      <p>
        <Link href="/">{t("s10.back")}</Link>
      </p>
    </div>
  );
}
