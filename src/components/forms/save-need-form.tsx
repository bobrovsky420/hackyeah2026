"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, RadioList } from "@/components/ui/choice";
import { ErrorSummary, type FormError } from "@/components/ui/error-summary";
import { describedBy, Field, FieldError, Hint, Label, TextArea, TextInput } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { t } from "@/lib/i18n";
import { isRoleCode, roleCodes, roleLabel } from "@/lib/labels";
import type { RoleCode } from "@/lib/mock/types";
import { DRAFT_KEY } from "@/lib/storage-keys";
import { PlaceCombobox, type PlaceValue } from "./place-combobox";
import { EMAIL_PATTERN, useMockForm } from "./use-mock-form";

/** S9c: save a need in the needs bank, prefilled with the text typed on S1. */
export function SaveNeedForm({ defaultText, backHref }: { defaultText: string; backHref: string | null }) {
  const [text, setText] = useState(defaultText);
  const [place, setPlace] = useState<PlaceValue>({ text: "", terc: null });
  const [role, setRole] = useState<RoleCode | "">("");
  const [email, setEmail] = useState("");
  const [consentStore, setConsentStore] = useState(false);
  const [consentPublish, setConsentPublish] = useState(false);
  const { errors, status, summaryRef, doneRef, submit, errorFor } = useMockForm();

  useEffect(() => {
    let draft: { problem?: unknown; place?: { text?: unknown; terc?: unknown }; role?: unknown };
    try {
      draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "{}");
    } catch {
      return; // No draft: the form keeps the route's summary.
    }
    /* eslint-disable react-hooks/set-state-in-effect -- the draft lives in the browser, readable only after mounting */
    if (typeof draft.problem === "string" && draft.problem.trim()) setText(draft.problem);
    if (typeof draft.place?.text === "string" && typeof draft.place.terc === "string") {
      setPlace({ text: draft.place.text, terc: draft.place.terc });
    }
    if (isRoleCode(draft.role)) setRole(draft.role);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: FormError[] = [];
    if (text.trim().length < 20) found.push({ fieldId: "opis", message: t("s1.problem.errorShort") });
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) found.push({ fieldId: "email", message: t("forms.email.error") });
    if (!consentStore) found.push({ fieldId: "zgoda-przechowywanie", message: t("forms.consent.error") });
    submit(found);
  }

  if (status === "sent") {
    return (
      <div ref={doneRef} tabIndex={-1} className="grid gap-4">
        <Notice tone="success" title={t("s9c.done.title")} titleAs="h2">
          <p>{t("s3.bank.text")}</p>
        </Notice>
        {backHref && (
          <p>
            <Link href={backHref}>{t("forms.backToRoute")}</Link>
          </p>
        )}
      </div>
    );
  }

  const textError = errorFor("opis");
  const emailError = errorFor("email");

  return (
    <div className="grid gap-6">
      <ErrorSummary ref={summaryRef} errors={errors} />
      <form noValidate onSubmit={handleSubmit} className="grid gap-6">
        <Field invalid={Boolean(textError)}>
          <Label htmlFor="opis">{t("s9c.text.label")}</Label>
          <Hint id="opis-podpowiedz">{t("s9c.text.hint")}</Hint>
          {textError && <FieldError id="opis-blad">{textError}</FieldError>}
          <TextArea
            id="opis"
            rows={6}
            maxLength={2000}
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-invalid={textError ? true : undefined}
            aria-describedby={describedBy("opis-podpowiedz", textError && "opis-blad")}
          />
        </Field>
        <PlaceCombobox id="miejsce" name="miejsce" value={place} onChange={setPlace} />
        <RadioList
          idPrefix="rola"
          name="rola"
          legend={t("s1.role.legend")}
          hint={t("s1.role.hint")}
          options={roleCodes.map((code) => ({ value: code, label: roleLabel(code) }))}
          value={role}
          onChange={(value) => setRole(isRoleCode(value) ? value : "")}
        />
        <Field invalid={Boolean(emailError)}>
          <Label htmlFor="email">{t("forms.email.label")}</Label>
          <Hint id="email-podpowiedz">{t("s9c.email.hint")}</Hint>
          {emailError && <FieldError id="email-blad">{emailError}</FieldError>}
          <TextInput
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={describedBy("email-podpowiedz", emailError && "email-blad")}
          />
        </Field>
        <Checkbox
          id="zgoda-przechowywanie"
          checked={consentStore}
          onChange={setConsentStore}
          error={errorFor("zgoda-przechowywanie")}
        >
          {t("s9c.consent.store")}
        </Checkbox>
        <Checkbox id="zgoda-publikacja" checked={consentPublish} onChange={setConsentPublish}>
          {t("s9c.consent.publish")}
        </Checkbox>
        <div>
          <Button type="submit" aria-disabled={status === "sending" ? true : undefined}>
            {t(status === "sending" ? "forms.sending" : "s9c.submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
