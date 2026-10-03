"use client";

import { LogOut } from "lucide-react";
import { useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { DRAFT_KEY } from "@/lib/storage-keys";

/* A page that says nothing about the tool or the topic. */
const NEUTRAL_PAGE = "https://www.google.pl/";
const DOUBLE_PRESS_MS = 1000;

/** Leaves at once: the typed text goes from the browser and the back button does not return here. */
function leave() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage blocked: nothing was kept there.
  }
  window.location.replace(NEUTRAL_PAGE);
}

/**
 * The quick exit of FR-12.5 (the Swiss victim-support pattern): a visible
 * "Wyjdź" and Escape pressed twice, on S10 and on routes whose sensitive
 * topics include violence or abuse. A plain link still works without script.
 */
export function QuickExit() {
  useEffect(() => {
    let last = 0;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const now = Date.now();
      if (now - last < DOUBLE_PRESS_MS) leave();
      last = now;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="no-print flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      <p id="szybkie-wyjscie-opis" className="text-muted-foreground">
        {t("exit.hint")}
      </p>
      <a
        href={NEUTRAL_PAGE}
        onClick={(event) => {
          event.preventDefault();
          leave();
        }}
        aria-describedby="szybkie-wyjscie-opis"
        className={buttonVariants()}
      >
        <LogOut aria-hidden />
        {t("exit.label")}
      </a>
    </div>
  );
}
