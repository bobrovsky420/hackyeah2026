"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { t, type MessageKey } from "@/lib/i18n";

export type AssistantPart = "develop" | "show" | "inspire";

const PART_KEYS: Record<AssistantPart, MessageKey> = {
  develop: "card.assistant.part.develop",
  show: "card.assistant.part.show",
  inspire: "card.assistant.part.inspire",
};

type State = "waiting" | "working" | "done" | "failed";

/** Where focus goes once the page shows the results: the section heading of the first one. */
export const FOCUS_FLAG = "assistant:focus";

/**
 * The idea assistant as one action (FR-13.7): one press runs the parts not
 * run yet, side by side, and a list in a live region says how each goes;
 * once all are settled the page shows the stored results and focus moves to
 * the first (AssistantFocus). `autoStart` runs it on arrival, as the link
 * from the confirmation after sending does.
 */
export function AssistantRun({ ideaId, parts, autoStart = false }: { ideaId: string; parts: AssistantPart[]; autoStart?: boolean }) {
  const router = useRouter();
  const [states, setStates] = useState<Record<AssistantPart, State> | null>(null);
  const started = useRef(false);
  const running = states !== null && Object.values(states).includes("working");

  async function run() {
    if (running) return;
    setStates(Object.fromEntries(parts.map((part) => [part, "working"])) as Record<AssistantPart, State>);
    const results = await Promise.all(
      parts.map(async (part) => {
        try {
          const response = await fetch(`/api/ideas/${encodeURIComponent(ideaId)}/assistant`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ task: part }),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          setStates((current) => current && { ...current, [part]: "done" });
          return true;
        } catch {
          setStates((current) => current && { ...current, [part]: "failed" });
          return false;
        }
      }),
    );
    if (results.some(Boolean)) {
      try {
        sessionStorage.setItem(FOCUS_FLAG, ideaId);
      } catch {
        // Without storage the results still show; focus stays where it is.
      }
      router.refresh();
    }
  }

  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    void run();
    // Runs once on arrival; `run` reads only the id and the parts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  return (
    <div className="grid gap-3">
      <p>{t("card.assistant.will", { parts: parts.map((part) => t(PART_KEYS[part])).join(", ") })}</p>
      <div>
        <Button type="button" onClick={() => void run()} aria-disabled={running ? true : undefined}>
          {t(parts.length === 3 ? "card.assistant.run" : "card.assistant.runRest")}
        </Button>
      </div>
      <div role="status" aria-live="polite" className="grid gap-1">
        {states && (
          <>
            {running && <p>{t("card.assistant.progress.intro")}</p>}
            <ul className="grid gap-1">
              {parts.map((part) => (
                <li key={part} className={states[part] === "failed" ? "font-bold text-destructive" : undefined}>
                  {t(`card.assistant.progress.${states[part]}` as MessageKey, { part: t(PART_KEYS[part]) })}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/** After a run, moves focus to the first result once the page shows it; `shown` changes when one appears. */
export function AssistantFocus({ ideaId, targetId, shown }: { ideaId: string; targetId: string | null; shown: number }) {
  useEffect(() => {
    if (!targetId) return;
    try {
      if (sessionStorage.getItem(FOCUS_FLAG) !== ideaId) return;
      sessionStorage.removeItem(FOCUS_FLAG);
    } catch {
      return;
    }
    document.getElementById(targetId)?.focus();
  }, [ideaId, targetId, shown]);
  return null;
}
