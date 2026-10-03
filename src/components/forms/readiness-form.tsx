"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, CheckboxList } from "@/components/ui/choice";
import { ErrorSummary, type FormError } from "@/components/ui/error-summary";
import { describedBy, Field, FieldError, Hint, Label, TextInput } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { t } from "@/lib/i18n";
import { targetGroupCodes, targetGroupLabel } from "@/lib/labels";
import { FormFailed } from "./form-failed";
import { PlaceCombobox, type PlaceValue } from "./place-combobox";
import { useSubmitForm } from "./use-submit-form";

/** S9b: readiness to act ("Chcę pomóc"), with separate consents to store and to show the name. */
export function ReadinessForm() {
  const [name, setName] = useState("");
  const [isOrganisation, setIsOrganisation] = useState(false);
  const [place, setPlace] = useState<PlaceValue>({ text: "", terc: null });
  const [topics, setTopics] = useState<string[]>([]);
  const [contact, setContact] = useState("");
  const [consentStore, setConsentStore] = useState(false);
  const [consentShowName, setConsentShowName] = useState(false);
  const { errors, status, summaryRef, doneRef, failedRef, submit, errorFor } = useSubmitForm("/api/gotowosc");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: FormError[] = [];
    if (!name.trim()) found.push({ fieldId: "nazwa", message: t("s9b.name.error") });
    if (!contact.trim()) found.push({ fieldId: "kontakt", message: t("s9b.contact.error") });
    if (!consentStore) found.push({ fieldId: "zgoda-przechowywanie", message: t("forms.consent.error") });
    void submit(found, {
      display_name: name.trim(),
      is_organisation: isOrganisation,
      place_terc: place.terc,
      topics,
      contact: contact.trim(),
      consent_store: consentStore,
      consent_display_name: consentShowName,
    });
  }

  if (status === "sent") {
    return (
      <div ref={doneRef} tabIndex={-1}>
        <Notice tone="success" title={t("s9b.done.title")} titleAs="h2">
          <p>{t("s9b.done.text")}</p>
        </Notice>
      </div>
    );
  }

  const nameError = errorFor("nazwa");
  const contactError = errorFor("kontakt");

  return (
    <div className="grid gap-6">
      {status === "failed" && <FormFailed ref={failedRef} />}
      <ErrorSummary ref={summaryRef} errors={errors} />
      <form noValidate onSubmit={handleSubmit} className="grid gap-6">
        <Field invalid={Boolean(nameError)}>
          <Label htmlFor="nazwa">{t("s9b.name.label")}</Label>
          {nameError && <FieldError id="nazwa-blad">{nameError}</FieldError>}
          <TextInput
            id="nazwa"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={describedBy(nameError && "nazwa-blad")}
          />
        </Field>
        <Checkbox id="organizacja" checked={isOrganisation} onChange={setIsOrganisation}>
          {t("s9b.isOrganisation")}
        </Checkbox>
        <PlaceCombobox id="miejsce" name="miejsce" value={place} onChange={setPlace} />
        <CheckboxList
          idPrefix="tematy"
          name="tematy"
          legend={t("s9b.topics.legend")}
          hint={t("s9b.topics.hint")}
          options={targetGroupCodes.map((code) => ({ value: code, label: targetGroupLabel(code) }))}
          values={topics}
          onChange={setTopics}
        />
        <Field invalid={Boolean(contactError)}>
          <Label htmlFor="kontakt">{t("s9b.contact.label")}</Label>
          <Hint id="kontakt-podpowiedz">{t("s9b.contact.hint")}</Hint>
          {contactError && <FieldError id="kontakt-blad">{contactError}</FieldError>}
          <TextInput
            id="kontakt"
            autoComplete="email"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            aria-invalid={contactError ? true : undefined}
            aria-describedby={describedBy("kontakt-podpowiedz", contactError && "kontakt-blad")}
          />
        </Field>
        <Checkbox
          id="zgoda-przechowywanie"
          checked={consentStore}
          onChange={setConsentStore}
          error={errorFor("zgoda-przechowywanie")}
        >
          {t("s9b.consent.store")}
        </Checkbox>
        <Checkbox id="zgoda-nazwa" checked={consentShowName} onChange={setConsentShowName}>
          {t("s9b.consent.showName")}
        </Checkbox>
        <Hint>{t("s9b.retention")}</Hint>
        <div>
          <Button type="submit" aria-disabled={status === "sending" ? true : undefined}>
            {t(status === "sending" ? "forms.sending" : "s9b.submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
