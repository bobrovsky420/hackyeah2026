"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { ScreenedNotice, type Screened } from "@/components/forms/save-need-form";
import { HumanHelp } from "@/components/route/human-help";
import { Button } from "@/components/ui/button";
import { describedBy, Field, FieldError, Hint, Label, TextArea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { Helpline } from "@/lib/contracts";
import { t } from "@/lib/i18n";

/** The next message of the author or the mentor; the key of the private link proves who writes. */
export function ReplyForm({
  threadId,
  keyValue,
  asMentor,
  helplines,
}: {
  threadId: string;
  keyValue: string;
  asMentor: boolean;
  helplines: { alarm: Helpline[]; support: Helpline[] };
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [screened, setScreened] = useState<Screened | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;
    if (text.trim().length < 2) {
      setError(t("talk.reply.error"));
      document.getElementById("odpowiedz-rozmowa")?.focus();
      return;
    }
    setError(null);
    setScreened(null);
    setState("sending");
    try {
      const response = await fetch(`/api/threads/${encodeURIComponent(threadId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyValue, text: text.trim() }),
      });
      const body = ((await response.json().catch(() => null)) ?? {}) as Record<string, unknown>;
      const outcome = body.outcome === "redirected" || body.outcome === "declined" || body.outcome === "off_topic" ? body.outcome : null;
      if (outcome) {
        setScreened(outcome);
        setState("idle");
        requestAnimationFrame(() => noticeRef.current?.focus());
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setText("");
      setState("sent");
      router.refresh();
      requestAnimationFrame(() => noticeRef.current?.focus());
    } catch {
      setState("failed");
      requestAnimationFrame(() => noticeRef.current?.focus());
    }
  }

  if (screened === "redirected") return <HumanHelp placeName={null} helplines={helplines} titleAs="h2" />;

  return (
    <form noValidate onSubmit={handleSubmit} className="no-print grid gap-4">
      <div ref={noticeRef} tabIndex={-1}>
        {state === "sent" && (
          <Notice tone="success" title={t("talk.reply.sent")}>
            <p>{t(asMentor ? "talk.reply.sentMentor" : "talk.reply.sentText")}</p>
          </Notice>
        )}
        {state === "failed" && (
          <Notice tone="error" title={t("talk.reply.failedTitle")}>
            <p>{t("talk.reply.failed")}</p>
          </Notice>
        )}
        {screened && <ScreenedNotice outcome={screened} />}
      </div>
      <Field invalid={Boolean(error)}>
        <Label htmlFor="odpowiedz-rozmowa">{t(asMentor ? "talk.reply.labelMentor" : "talk.reply.label")}</Label>
        <Hint id="odpowiedz-rozmowa-podpowiedz">{t("talk.reply.hint")}</Hint>
        {error && <FieldError id="odpowiedz-rozmowa-blad">{error}</FieldError>}
        <TextArea
          id="odpowiedz-rozmowa"
          rows={4}
          maxLength={3000}
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy("odpowiedz-rozmowa-podpowiedz", error && "odpowiedz-rozmowa-blad")}
        />
      </Field>
      <div>
        <Button type="submit" aria-disabled={state === "sending" ? true : undefined}>
          {t(state === "sending" ? "forms.sending" : "talk.reply.submit")}
        </Button>
      </div>
    </form>
  );
}
