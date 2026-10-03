"use client";

import { useState, type FormEvent } from "react";
import { ScreenedNotice, useScreenedSubmit } from "@/components/forms/save-need-form";
import { FormFailed } from "@/components/forms/form-failed";
import { HONEYPOT_FIELD, Honeypot } from "@/components/forms/honeypot";
import { PlaceCombobox, type PlaceValue } from "@/components/forms/place-combobox";
import { EMAIL_PATTERN } from "@/components/forms/use-submit-form";
import { HumanHelp } from "@/components/route/human-help";
import { Button } from "@/components/ui/button";
import { Checkbox, RadioList } from "@/components/ui/choice";
import { ErrorSummary, type FormError } from "@/components/ui/error-summary";
import { controlClass, describedBy, Field, FieldError, Hint, Label, TextArea, TextInput } from "@/components/ui/field";
import type { Helpline, Sector, ThreadTopic } from "@/lib/contracts";
import { t } from "@/lib/i18n";
import { isSector, isTopic, sectorCodes, sectorLabel, topicCodes, topicLabel } from "@/lib/labels";
import type { LocalityOption, PlaceOption } from "@/lib/place-options";
import { PrivateLink } from "./private-link";

export interface AskRef {
  type: "idea" | "innovation" | "partnership";
  id: string;
  label: string;
}

/**
 * Module V: a question to ROPS, a request for a mentor's support or an
 * answer to a partnership post. No account: the answer is a private link
 * to the conversation, remembered on this device.
 */
export function AskForm({
  topic: initialTopic,
  refItem,
  defaultSubject,
  places,
  localities,
  helplines,
}: {
  topic: ThreadTopic;
  refItem: AskRef | null;
  defaultSubject: string;
  places: PlaceOption[];
  localities: LocalityOption[];
  helplines: { alarm: Helpline[]; support: Helpline[] };
}) {
  const [topic, setTopic] = useState<ThreadTopic>(initialTopic);
  const [subject, setSubject] = useState(defaultSubject);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [sector, setSector] = useState<Sector | "">("");
  const [place, setPlace] = useState<PlaceValue>({ text: "", terc: null });
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const { errors, status, result, screened, summaryRef, doneRef, failedRef, submit, errorFor } = useScreenedSubmit("/api/threads");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: FormError[] = [];
    if (subject.trim().length < 3) found.push({ fieldId: "temat-rozmowy", message: t("talk.subject.error") });
    if (text.trim().length < 10) found.push({ fieldId: "wiadomosc", message: t("talk.message.error") });
    if (!name.trim()) found.push({ fieldId: "autor", message: t("talk.name.error") });
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) found.push({ fieldId: "email", message: t("forms.email.error") });
    if (!consent) found.push({ fieldId: "zgoda-przechowywanie", message: t("forms.consent.error") });
    void submit(found, {
      topic,
      subject: subject.trim(),
      message: text.trim(),
      display_name: name.trim(),
      organisation: organisation.trim() || null,
      sector: sector || null,
      place_terc: place.terc,
      email: email.trim() || null,
      ref_type: refItem?.type ?? null,
      ref_id: refItem?.id ?? null,
      consent_store: consent,
      [HONEYPOT_FIELD]: honeypot,
    });
  }

  if (status === "screened" && screened === "redirected") {
    return <HumanHelp placeName={places.find((option) => option.terc === place.terc)?.name ?? null} helplines={helplines} titleAs="h2" />;
  }
  if (status === "sent" && typeof result?.id === "string" && typeof result?.key === "string" && typeof result?.path === "string") {
    return (
      <div ref={doneRef} tabIndex={-1}>
        <PrivateLink id={result.id} keyValue={result.key} path={result.path} subject={subject.trim()} />
      </div>
    );
  }

  const subjectError = errorFor("temat-rozmowy");
  const textError = errorFor("wiadomosc");
  const nameError = errorFor("autor");
  const emailError = errorFor("email");

  return (
    <div className="grid gap-6">
      {status === "failed" && <FormFailed ref={failedRef} />}
      {status === "screened" && screened && screened !== "redirected" && <ScreenedNotice ref={failedRef} outcome={screened} />}
      <ErrorSummary ref={summaryRef} errors={errors} />
      {refItem && (
        <p className="rounded-md border-2 border-border p-3">
          <span className="font-bold">{t(`talk.ref.${refItem.type}`)}</span> {refItem.label}
        </p>
      )}
      <form noValidate onSubmit={handleSubmit} className="grid gap-6">
        <Honeypot value={honeypot} onChange={setHoneypot} />
        <RadioList
          idPrefix="rodzaj-rozmowy"
          name="rodzaj-rozmowy"
          legend={t("talk.topic.legend")}
          options={topicCodes.map((code) => ({ value: code, label: topicLabel(code) }))}
          value={topic}
          onChange={(next) => isTopic(next) && setTopic(next)}
        />
        <Field invalid={Boolean(subjectError)}>
          <Label htmlFor="temat-rozmowy">{t("talk.subject.label")}</Label>
          {subjectError && <FieldError id="temat-rozmowy-blad">{subjectError}</FieldError>}
          <TextInput
            id="temat-rozmowy"
            maxLength={150}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            aria-invalid={subjectError ? true : undefined}
            aria-describedby={describedBy(subjectError && "temat-rozmowy-blad")}
          />
        </Field>
        <Field invalid={Boolean(textError)}>
          <Label htmlFor="wiadomosc">{t("talk.message.label")}</Label>
          <Hint id="wiadomosc-podpowiedz">{t(`talk.message.hint.${topic}`)}</Hint>
          {textError && <FieldError id="wiadomosc-blad">{textError}</FieldError>}
          <TextArea
            id="wiadomosc"
            rows={6}
            maxLength={3000}
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-invalid={textError ? true : undefined}
            aria-describedby={describedBy("wiadomosc-podpowiedz", textError && "wiadomosc-blad")}
          />
        </Field>
        <Field invalid={Boolean(nameError)}>
          <Label htmlFor="autor">{t("talk.name.label")}</Label>
          <Hint id="autor-podpowiedz">{t("talk.name.hint")}</Hint>
          {nameError && <FieldError id="autor-blad">{nameError}</FieldError>}
          <TextInput
            id="autor"
            autoComplete="name"
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={describedBy("autor-podpowiedz", nameError && "autor-blad")}
          />
        </Field>
        <Field>
          <Label htmlFor="organizacja">{t("talk.organisation.label")}</Label>
          <TextInput id="organizacja" autoComplete="organization" maxLength={200} value={organisation} onChange={(event) => setOrganisation(event.target.value)} />
        </Field>
        <Field>
          <Label htmlFor="sektor">{t("talk.sector.label")}</Label>
          <Hint id="sektor-podpowiedz">{t("talk.sector.hint")}</Hint>
          <select
            id="sektor"
            value={sector}
            onChange={(event) => setSector(isSector(event.target.value) ? event.target.value : "")}
            className={controlClass}
            aria-describedby="sektor-podpowiedz"
          >
            <option value="">{t("talk.sector.none")}</option>
            {sectorCodes.map((code) => (
              <option key={code} value={code}>
                {sectorLabel(code)}
              </option>
            ))}
          </select>
        </Field>
        <PlaceCombobox id="miejsce" name="miejsce" places={places} localities={localities} value={place} onChange={setPlace} />
        <Field invalid={Boolean(emailError)}>
          <Label htmlFor="email">{t("forms.email.label")}</Label>
          <Hint id="email-podpowiedz">{t("talk.email.hint")}</Hint>
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
          checked={consent}
          onChange={setConsent}
          error={errorFor("zgoda-przechowywanie")}
          required
          hint={t("forms.consent.required")}
        >
          {t("talk.consent")}
        </Checkbox>
        <Hint>{t("talk.retention")}</Hint>
        <div>
          <Button type="submit" aria-disabled={status === "sending" ? true : undefined}>
            {t(status === "sending" ? "forms.sending" : "talk.submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
