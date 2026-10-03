"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox, RadioList } from "@/components/ui/choice";
import { ErrorSummary, type FormError } from "@/components/ui/error-summary";
import { describedBy, Field, FieldError, Hint, Label, TextArea, TextInput } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { RoleCode } from "@/lib/contracts/catalogue";
import { t } from "@/lib/i18n";
import { isRoleCode, roleCodes, roleLabel } from "@/lib/labels";
import { pluralPl } from "@/lib/text";
import { FormFailed } from "./form-failed";
import { PlaceCombobox, type PlaceValue } from "./place-combobox";
import { EMAIL_PATTERN, useSubmitForm } from "./use-submit-form";

/** S9c: save a need in the needs bank, prefilled from the route it came from. */
export function SaveNeedForm({
  defaults,
  routeId,
  backHref,
}: {
  defaults: { text: string; place: PlaceValue; role: RoleCode | ""; summary: string | null; targetGroups: string[] };
  routeId: string | null;
  backHref: string | null;
}) {
  const [text, setText] = useState(defaults.text);
  const [place, setPlace] = useState<PlaceValue>(defaults.place);
  const [role, setRole] = useState<RoleCode | "">(defaults.role);
  const [email, setEmail] = useState("");
  const [consentStore, setConsentStore] = useState(false);
  const [consentPublish, setConsentPublish] = useState(false);
  const { errors, status, result, summaryRef, doneRef, failedRef, submit, errorFor } = useSubmitForm("/api/needs");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: FormError[] = [];
    if (text.trim().length < 20) found.push({ fieldId: "opis", message: t("s1.problem.errorShort") });
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) found.push({ fieldId: "email", message: t("forms.email.error") });
    if (!consentStore) found.push({ fieldId: "zgoda-przechowywanie", message: t("forms.consent.error") });
    void submit(found, {
      problem_text: text.trim(),
      summary_pl: defaults.summary,
      place_terc: place.terc,
      role: role || null,
      target_groups: defaults.targetGroups,
      email: email.trim() || null,
      consent_store: consentStore,
      consent_publish: consentPublish,
      route_id: routeId,
    });
  }

  if (status === "sent") {
    const needId = typeof result?.id === "string" ? result.id : null;
    const removed = typeof result?.redactions === "number" ? result.redactions : 0;
    return (
      <div ref={doneRef} tabIndex={-1} className="grid gap-4">
        <Notice tone="success" title={t("s9c.done.title")} titleAs="h2">
          <p>{t("s3.bank.text")}</p>
          {removed > 0 && (
            <p>
              {t("route.redacted.text", {
                count: removed,
                unit: pluralPl(removed, {
                  one: t("route.redacted.unit.one"),
                  few: t("route.redacted.unit.few"),
                  many: t("route.redacted.unit.many"),
                }),
              })}
            </p>
          )}
        </Notice>
        {needId && (
          <div className="grid gap-2">
            <p>{t("s9c.done.briefLead")}</p>
            <div>
              <Link href={`/potrzeba/${needId}/fiszka`} className={buttonVariants({ variant: "secondary" })}>
                {t("s9c.done.brief")}
              </Link>
            </div>
          </div>
        )}
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
      {status === "failed" && <FormFailed ref={failedRef} />}
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
