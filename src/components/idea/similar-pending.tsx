"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { t } from "@/lib/i18n";

/**
 * The card's similar innovations before they exist: asks
 * POST /api/ideas/{id}/similar once, says that it is searching, and shows
 * the stored result when it is there. A failure offers another try.
 */
export function SimilarPending({ ideaId }: { ideaId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"working" | "failed">("working");
  const started = useRef(false);
  const failedRef = useRef<HTMLDivElement>(null);

  async function request() {
    try {
      const response = await fetch(`/api/ideas/${encodeURIComponent(ideaId)}/similar`, { method: "POST" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      router.refresh();
    } catch {
      setState("failed");
      requestAnimationFrame(() => failedRef.current?.focus());
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void request();
    // Runs once on mount; `request` only reads the id and the router.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-3">
      <p role="status" aria-live="polite">
        {state === "working" ? t("card.similar.pending") : ""}
      </p>
      {state === "failed" && (
        <div ref={failedRef} tabIndex={-1} className="grid gap-3">
          <Notice tone="error" title={t("card.similar.failedTitle")} titleAs="h3">
            <p>{t("card.similar.failed")}</p>
          </Notice>
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setState("working");
                void request();
              }}
            >
              {t("card.similar.retry")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
