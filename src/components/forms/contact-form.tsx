"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { ErrorSummary, type FormError } from "@/components/ui/error-summary";
import { describedBy, Field, FieldError, Hint, Label, TextArea, TextInput } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { t } from "@/lib/i18n";
import { EMAIL_PATTERN, useMockForm } from "./use-mock-form";

/** S9a: a contact request, passed on by ROPS (never an e-mail of a private person). */
export function ContactForm({
  defaultMessage,
  backHref,
  backLabel,
}: {
  defaultMessage: string;
  backHref: string;
  backLabel: string;
}) {
  const [name, setName] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(defaultMessage);
  const [consent, setConsent] = useState(false);
  const { errors, status, summaryRef, doneRef, submit, errorFor } = useMockForm();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: FormError[] = [];
    if (!name.trim()) found.push({ fieldId: "imie", message: t("forms.name.error") });
    if (!EMAIL_PATTERN.test(email.trim())) found.push({ fieldId: "email", message: t("forms.email.error") });
    if (!message.trim()) found.push({ fieldId: "wiadomosc", message: t("s9a.message.error") });
    if (!consent) found.push({ fieldId: "zgoda", message: t("forms.consent.error") });
    submit(found);
  }

  if (status === "sent") {
    return (
      <div ref={doneRef} tabIndex={-1} className="grid gap-4">
        <Notice tone="success" title={t("s9a.done.title")} titleAs="h2">
          <p>{t("s9a.done.text")}</p>
        </Notice>
        <p>
          <Link href={backHref}>{backLabel}</Link>
        </p>
      </div>
    );
  }

  const nameError = errorFor("imie");
  const emailError = errorFor("email");
  const messageError = errorFor("wiadomosc");

  return (
    <div className="grid gap-6">
      <ErrorSummary ref={summaryRef} errors={errors} />
      <form noValidate onSubmit={handleSubmit} className="grid gap-6">
        <Field invalid={Boolean(nameError)}>
          <Label htmlFor="imie">{t("forms.name.label")}</Label>
          {nameError && <FieldError id="imie-blad">{nameError}</FieldError>}
          <TextInput
            id="imie"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={describedBy(nameError && "imie-blad")}
          />
        </Field>
        <Field>
          <Label htmlFor="organizacja">{t("forms.organisation.label")}</Label>
          <Hint id="organizacja-podpowiedz">{t("forms.optional")}</Hint>
          <TextInput
            id="organizacja"
            autoComplete="organization"
            value={organisation}
            onChange={(event) => setOrganisation(event.target.value)}
            aria-describedby="organizacja-podpowiedz"
          />
        </Field>
        <Field invalid={Boolean(emailError)}>
          <Label htmlFor="email">{t("forms.email.label")}</Label>
          <Hint id="email-podpowiedz">{t("s9a.email.hint")}</Hint>
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
        <Field invalid={Boolean(messageError)}>
          <Label htmlFor="wiadomosc">{t("s9a.message.label")}</Label>
          <Hint id="wiadomosc-podpowiedz">{t("s9a.message.hint")}</Hint>
          {messageError && <FieldError id="wiadomosc-blad">{messageError}</FieldError>}
          <TextArea
            id="wiadomosc"
            rows={6}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            aria-invalid={messageError ? true : undefined}
            aria-describedby={describedBy("wiadomosc-podpowiedz", messageError && "wiadomosc-blad")}
          />
        </Field>
        <Checkbox id="zgoda" checked={consent} onChange={setConsent} error={errorFor("zgoda")}>
          {t("s9a.consent")}
        </Checkbox>
        <div>
          <Button type="submit" aria-disabled={status === "sending" ? true : undefined}>
            {t(status === "sending" ? "forms.sending" : "s9a.submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
