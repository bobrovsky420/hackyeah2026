"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { clarify, type ClarifyState } from "@/app/route/actions";
import { submitTo } from "@/components/forms/submit";
import { Button } from "@/components/ui/button";
import { RadioList } from "@/components/ui/choice";
import { t } from "@/lib/i18n";
import { targetGroupCodes, targetGroupLabel } from "@/lib/labels";

/**
 * FR-2.3 on S3: one question as a radio list, never a chat, when stage 1
 * found neither a target group nor a place. The answer reruns matching.
 */
export function ClarificationForm({ routeId }: { routeId: string }) {
  const [group, setGroup] = useState("");
  const [state, action, pending] = useActionState<ClarifyState, FormData>(clarify, { error: null });
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.error) errorRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [state]);

  return (
    <section aria-labelledby="doprecyzowanie" className="grid gap-4 rounded-lg border-2 border-primary bg-accent p-5">
      <div className="grid gap-1">
        <h2 id="doprecyzowanie" className="text-[1.3rem] font-bold">
          {t("s3.clarify.title")}
        </h2>
        <p>{t("s3.clarify.lead")}</p>
      </div>
      <form onSubmit={submitTo(action, pending)} className="grid gap-4">
        <input type="hidden" name="droga" value={routeId} />
        <div ref={errorRef}>
          <RadioList
            idPrefix="grupa"
            name="grupa"
            legend={t("s3.clarify.question")}
            options={targetGroupCodes.map((code) => ({ value: code, label: targetGroupLabel(code) }))}
            value={group}
            onChange={setGroup}
            error={state.error ?? undefined}
          />
        </div>
        <div>
          <Button type="submit" aria-disabled={pending ? true : undefined}>
            {t(pending ? "s3.clarify.pending" : "s3.clarify.submit")}
          </Button>
        </div>
        <p role="status" className="sr-only">
          {pending ? t("s3.clarify.pending") : ""}
        </p>
      </form>
    </section>
  );
}
