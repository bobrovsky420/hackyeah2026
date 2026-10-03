"use client";

import { useActionState, useState } from "react";
import { updateRecord, type ConsoleFormState } from "@/app/rops/actions";
import { smallLabel } from "@/components/console/console-parts";
import { submitTo } from "@/components/console/submit";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/ui/field";
import { t, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * The status select and the note field of a row (S7). The fields keep what
 * was saved (see submitTo), and the status line says "Zapisano." after every
 * save, never beside unsaved changes.
 */
export function StatusForm({
  kind,
  id,
  status,
  note,
  options,
  describedBy,
}: {
  kind: "need" | "contact" | "readiness";
  id: string;
  status: string;
  note: string | null;
  options: Record<string, MessageKey>;
  describedBy: string;
}) {
  const [value, setValue] = useState(status);
  const [text, setText] = useState(note ?? "");
  const [changed, setChanged] = useState(false);
  const [state, action, pending] = useActionState(
    async (previous: ConsoleFormState, form: FormData) => {
      const next = await updateRecord(previous, form);
      if (next.done) setChanged(false);
      return next;
    },
    { error: null, done: null },
  );
  const message = pending || changed ? "" : (state.error ?? state.done ?? "");

  return (
    <form onSubmit={submitTo(action, pending)} className="grid min-w-[14rem] gap-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-1">
        <label htmlFor={`status-${id}`} className={smallLabel}>
          {t("console.col.status")}
        </label>
        <select
          id={`status-${id}`}
          name="status"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setChanged(true);
          }}
          className={controlClass}
        >
          {Object.entries(options).map(([code, key]) => (
            <option key={code} value={code}>
              {t(key)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1">
        <label htmlFor={`uwagi-${id}`} className={smallLabel}>
          {t("console.decision.note")}
        </label>
        <input
          id={`uwagi-${id}`}
          name="note"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setChanged(true);
          }}
          className={controlClass}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button type="submit" variant="secondary" aria-describedby={describedBy} aria-disabled={pending ? true : undefined}>
          {t("console.save")}
        </Button>
        <p role="status" className={cn("font-bold", state.error ? "text-destructive" : "text-success")}>
          {message}
        </p>
      </div>
    </form>
  );
}
