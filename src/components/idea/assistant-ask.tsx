"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { t } from "@/lib/i18n";

/**
 * Asks the idea assistant for its "Rozwiń pomysł" suggestions: one press,
 * since a run costs a model call; says that it works, shows the stored
 * result when it is there and offers another try after a failure.
 */
export function AssistantAsk({ ideaId }: { ideaId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");
  const failedRef = useRef<HTMLDivElement>(null);

  async function request() {
    setState("working");
    try {
      const response = await fetch(`/api/ideas/${encodeURIComponent(ideaId)}/assistant`, { method: "POST" });
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
          {t("card.assistant.ask")}
        </Button>
      </div>
      <p role="status" aria-live="polite">
        {state === "working" ? t("card.assistant.pending") : ""}
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
