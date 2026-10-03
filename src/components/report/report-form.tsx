"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FormFailed } from "@/components/forms/form-failed";
import { useSubmitForm } from "@/components/forms/use-submit-form";
import { Button } from "@/components/ui/button";
import { RadioList } from "@/components/ui/choice";
import { ErrorSummary, type FormError } from "@/components/ui/error-summary";
import { describedBy, Field, Hint, Label, TextArea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { reportReasons } from "@/lib/console";
import type { ContentReport } from "@/lib/contracts/records";
import { t } from "@/lib/i18n";

/** The two-field form of FR-12.9: a reason from the fixed list and an optional comment. */
export function ReportForm({
  target,
  backHref,
  backLabel,
}: {
  target: ContentReport["target"];
  backHref: string;
  backLabel: string;
}) {
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const { errors, status, summaryRef, doneRef, failedRef, submit, errorFor } = useSubmitForm("/api/reports");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: FormError[] = reason ? [] : [{ fieldId: "powod-0", message: t("report.reason.error") }];
    void submit(found, { target, reason, comment: comment.trim() || null });
  }

  if (status === "sent") {
    return (
      <div ref={doneRef} tabIndex={-1} className="grid gap-4">
        <Notice tone="success" title={t("report.done.title")} titleAs="h2">
          <p>{t("report.done.text")}</p>
        </Notice>
        <p>
          <Link href={backHref}>{backLabel}</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {status === "failed" && <FormFailed ref={failedRef} />}
      <ErrorSummary ref={summaryRef} errors={errors} />
      <form noValidate onSubmit={handleSubmit} className="grid gap-6">
        <RadioList
          idPrefix="powod"
          name="powod"
          legend={t("report.reason.legend")}
          options={Object.entries(reportReasons).map(([value, key]) => ({ value, label: t(key) }))}
          value={reason}
          onChange={setReason}
          error={errorFor("powod-0")}
        />
        <Field>
          <Label htmlFor="komentarz">{t("report.comment.label")}</Label>
          <Hint id="komentarz-podpowiedz">{t("report.comment.hint")}</Hint>
          <TextArea
            id="komentarz"
            rows={4}
            maxLength={1000}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            aria-describedby={describedBy("komentarz-podpowiedz")}
          />
        </Field>
        <div>
          <Button type="submit" aria-disabled={status === "sending" ? true : undefined}>
            {t(status === "sending" ? "forms.sending" : "report.submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
