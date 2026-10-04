"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { t, type MessageKey } from "@/lib/i18n";

const LABELS = {
  develop: { ask: "card.assistant.ask", pending: "card.assistant.pending" },
  show: { ask: "card.assistant.show.ask", pending: "card.assistant.show.pending" },
} as const satisfies Record<string, { ask: MessageKey; pending: MessageKey }>;

/**
 * Asks the idea assistant for one task's run ("Rozwiń pomysł" or "Pokaż"):
 * one press, since a run costs a model call; says that it works, shows the
 * stored result when it is there and offers another try after a failure.
 */
export function AssistantAsk({ ideaId, task = "develop" }: { ideaId: string; task?: keyof typeof LABELS }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");
  const failedRef = useRef<HTMLDivElement>(null);

  async function request() {
    setState("working");
    try {
      const response = await fetch(`/api/ideas/${encodeURIComponent(ideaId)}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      router.refresh();
    } catch {
      setState("failed");
      requestAnimationFrame(() => failedRef.current?.focus());
    }
  }

  return (
    <div className="grid gap-3">
      <div>
        <Button type="button" onClick={() => void request()} aria-disabled={state === "working" ? true : undefined}>
          {t(LABELS[task].ask)}
        </Button>
      </div>
      <p role="status" aria-live="polite">
        {state === "working" ? t(LABELS[task].pending) : ""}
      </p>
      {state === "failed" && (
        <div ref={failedRef} tabIndex={-1}>
          <Notice tone="error" title={t("card.assistant.failedTitle")} titleAs="h3">
            <p>{t("card.assistant.failed")}</p>
          </Notice>
        </div>
      )}
    </div>
  );
}
