"use client";

import { CircleCheck } from "lucide-react";
import { createContext, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { moderate, type ConsoleFormState } from "@/app/rops/actions";
import { smallLabel } from "@/components/console/console-parts";
import { submitTo } from "@/components/forms/submit";
import { Button } from "@/components/ui/button";
import { controlClass, FieldError } from "@/components/ui/field";
import { rejectReasons } from "@/lib/console";
import { t, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/*
 * A decision removes the row it was made in, so its confirmation lives with
 * the queue: a status line under the queue heading (WCAG 4.1.3), and the
 * focus moves to that heading instead of falling back to the page.
 */

interface Message {
  text: string;
  count: number;
}

type Report = (queue: string, text: string) => void;

const QueueMessages = createContext<{ messages: Record<string, Message>; report: Report }>({
  messages: {},
  report: () => {},
});

export function QueueMessagesProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Record<string, Message>>({});
  const report: Report = (queue, text) =>
    setMessages((current) => ({ ...current, [queue]: { text, count: (current[queue]?.count ?? 0) + 1 } }));
  return <QueueMessages value={{ messages, report }}>{children}</QueueMessages>;
}

/** The live region under a queue heading; a new key makes a repeated message speak again. */
export function QueueStatus({ queue }: { queue: string }) {
  const message = useContext(QueueMessages).messages[queue];
  return (
    <p role="status">
      {message && (
        <span key={message.count} className="mt-2 flex items-start gap-2 font-bold text-success">
          <CircleCheck aria-hidden className="mt-1 size-5 shrink-0" />
          <span>{message.text}</span>
        </span>
      )}
    </p>
  );
}

/**
 * Approve or reject an entry of a moderation queue (FR-12.8). Rejecting
 * needs a reason from the fixed list; the buttons are described by the row
 * they act on. A refused rejection keeps the note (see submitTo).
 */
export function DecisionForm({
  kind,
  id,
  queue,
  approve,
  describedBy,
  withReason = true,
}: {
  kind: "need" | "contact" | "readiness" | "declined" | "report";
  id: string;
  queue: string;
  approve: { value: "zatwierdz" | "zweryfikuj" | "przejrzane"; label: MessageKey };
  describedBy: string;
  withReason?: boolean;
}) {
  const { report } = useContext(QueueMessages);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const reasonRef = useRef<HTMLSelectElement>(null);
  const [state, action, pending] = useActionState(
    async (previous: ConsoleFormState, form: FormData) => {
      const next = await moderate(previous, form);
      if (next.done) {
        report(queue, next.done);
        document.getElementById(queue)?.focus();
      }
      return next;
    },
    { error: null, done: null },
  );

  useEffect(() => {
    if (state.error) reasonRef.current?.focus();
  }, [state]);

  const reasonId = `powod-${id}`;
  const errorId = `powod-blad-${id}`;
  const busy = pending ? true : undefined;

  return (
    <form onSubmit={submitTo(action, pending)} className="grid min-w-[15rem] gap-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      {withReason && (
        <div className={cn("grid gap-1", state.error && "border-l-4 border-destructive pl-3")}>
          <label htmlFor={reasonId} className={smallLabel}>
            {t("console.decision.reason")}
          </label>
          {state.error && <FieldError id={errorId}>{state.error}</FieldError>}
          <select
            ref={reasonRef}
            id={reasonId}
            name="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? errorId : undefined}
            className={controlClass}
          >
            <option value="">{t("console.decision.reasonNone")}</option>
            {Object.entries(rejectReasons).map(([code, key]) => (
              <option key={code} value={code}>
                {t(key)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid gap-1">
        <label htmlFor={`notatka-${id}`} className={smallLabel}>
          {t("console.decision.note")}
        </label>
        <input
          id={`notatka-${id}`}
          name="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={controlClass}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value={approve.value} aria-describedby={describedBy} aria-disabled={busy}>
          {t(approve.label)}
        </Button>
        {withReason && (
          <Button
            type="submit"
            name="decision"
            value="odrzuc"
            variant="secondary"
            aria-describedby={describedBy}
            aria-disabled={busy}
          >
            {t("console.decision.reject")}
          </Button>
        )}
      </div>
    </form>
  );
}
