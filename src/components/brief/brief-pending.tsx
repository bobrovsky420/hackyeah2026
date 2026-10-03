"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FocusOnMount } from "@/components/route/focus-on-mount";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { t } from "@/lib/i18n";

/**
 * S6 before the brief exists: asks POST /api/needs/{id}/brief once, says
 * that it is being prepared, and shows the stored brief when it is there.
 * A failure keeps the page with a way to try again.
 */
export function BriefPending({ needId }: { needId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"working" | "failed">("working");
  const started = useRef(false);
  const failedRef = useRef<HTMLDivElement>(null);

  async function request() {
    try {
      const response = await fetch(`/api/needs/${encodeURIComponent(needId)}/brief`, { method: "POST" });
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
    <div className="grid max-w-[48rem] gap-6">
      <FocusOnMount targetId="naglowek-fiszki" />
      <header className="grid gap-2">
        <p className="font-bold text-muted-foreground">{t("brief.eyebrow")}</p>
        <h1 id="naglowek-fiszki" tabIndex={-1} className="text-[1.75rem] leading-tight font-bold @3xl:text-[2.2rem]">
          {t("brief.pending.title")}
        </h1>
      </header>
      <p role="status" aria-live="polite">
        {state === "working" ? t("brief.pending.text") : ""}
      </p>
      {state === "failed" && (
        <div ref={failedRef} tabIndex={-1} className="grid gap-3">
          <Notice tone="error" title={t("brief.pending.failedTitle")} titleAs="h2">
            <p>{t("brief.pending.failed")}</p>
          </Notice>
          <div>
            <Button type="button" onClick={() => {
                setState("working");
                void request();
              }}>
              {t("brief.pending.retry")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
