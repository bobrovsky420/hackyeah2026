"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * "Policz ponownie" (FR-3.5): the pipeline runs again on the stored text,
 * bypassing the replay cache; the new route opens when it is ready.
 */
export function RecomputeButton({ routeId }: { routeId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "limited" | "failed">("idle");

  async function recompute() {
    if (state === "working") return;
    setState("working");
    try {
      const response = await fetch(`/api/routes/${encodeURIComponent(routeId)}/recompute`, { method: "POST" });
      if (response.status === 429) {
        setState("limited");
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { id } = (await response.json()) as { id: string };
      router.push(`/droga/${id}`);
    } catch {
      setState("failed");
    }
  }

  const message = {
    idle: "",
    working: t("s2.recompute.working"),
    limited: t("s1.limited.title"),
    failed: t("s2.recompute.failed"),
  }[state];

  return (
    <div className="no-print grid gap-2">
      <div>
        <Button
          variant="secondary"
          onClick={recompute}
          aria-describedby="policz-ponownie-opis"
          aria-disabled={state === "working" ? true : undefined}
        >
          <RefreshCw aria-hidden className={cn(state === "working" && "motion-safe:animate-spin")} />
          {t("s2.recompute.button")}
        </Button>
      </div>
      <p id="policz-ponownie-opis" className="text-muted-foreground">
        {t("s2.recompute.hint")}
      </p>
      <p role="status" className={cn(state === "limited" || state === "failed" ? "font-bold text-destructive" : "font-bold")}>
        {message}
      </p>
    </div>
  );
}
