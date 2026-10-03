"use client";

import { useActionState } from "react";
import { clusterNeedsAction, type ConsoleFormState } from "@/app/rops/actions";
import { submitTo } from "@/components/forms/submit";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** "Pogrupuj potrzeby" of the needs table (FR-5.4): one button and a status line. */
export function ClusterForm() {
  const [state, action, pending] = useActionState<ConsoleFormState, FormData>(clusterNeedsAction, { error: null, done: null });
  const message = pending ? t("console.clusters.working") : (state.error ?? state.done ?? "");

  return (
    <section aria-labelledby="grupy-potrzeb" className="grid gap-2 rounded-lg border border-border p-4">
      <h2 id="grupy-potrzeb" className="text-[1.2rem] font-bold">
        {t("console.clusters.title")}
      </h2>
      <p className="max-w-[44rem] text-muted-foreground">{t("console.clusters.lead")}</p>
      <form onSubmit={submitTo(action, pending)} className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button type="submit" variant="secondary" aria-disabled={pending ? true : undefined}>
          {t("console.clusters.submit")}
        </Button>
        <p role="status" className={cn("font-bold", state.error && !pending ? "text-destructive" : "text-success")}>
          {message}
        </p>
      </form>
    </section>
  );
}
