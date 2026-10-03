"use client";

import { useState, type FormEvent } from "react";
import { ScreenedNotice, useScreenedSubmit } from "@/components/forms/save-need-form";
import { FormFailed } from "@/components/forms/form-failed";
import { HONEYPOT_FIELD, Honeypot } from "@/components/forms/honeypot";
import { PlaceCombobox, type PlaceValue } from "@/components/forms/place-combobox";
import { EMAIL_PATTERN } from "@/components/forms/use-submit-form";
import { HumanHelp } from "@/components/route/human-help";
import { Button } from "@/components/ui/button";
import { Checkbox, CheckboxList, RadioList } from "@/components/ui/choice";
import { ErrorSummary, type FormError } from "@/components/ui/error-summary";
import { describedBy, Field, FieldError, Hint, Label, TextArea, TextInput } from "@/components/ui/field";
import type { Helpline, Sector } from "@/lib/contracts";
import { t } from "@/lib/i18n";
import { isSector, sectorCodes, sectorLabel, targetGroupCodes, targetGroupLabel } from "@/lib/labels";
import type { LocalityOption, PlaceOption } from "@/lib/place-options";
import { PrivateLink } from "./private-link";

/** Module V: a post for the partnership board, shown after ROPS approves it. */
export function PartnershipForm({
  places,
  localities,
  helplines,
}: {
  places: PlaceOption[];
  localities: LocalityOption[];
  helplines: { alarm: Helpline[]; support: Helpline[] };
}) {
  const [kind, setKind] = useState<"szukam" | "oferuje">("szukam");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sector, setSector] = useState<Sector | "">("");
  const [seeking, setSeeking] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [place, setPlace] = useState<PlaceValue>({ text: "", terc: null });
  const [name, setName] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const { errors, status, result, screened, summaryRef, doneRef, failedRef, submit, errorFor } = useScreenedSubmit("/api/partnerships");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: FormError[] = [];
    if (title.trim().length < 5) found.push({ fieldId: "tytul-ogloszenia", message: t("talk.post.titleError") });
    if (description.trim().length < 20) found.push({ fieldId: "opis-ogloszenia", message: t("talk.post.descriptionError") });
    if (!sector) found.push({ fieldId: "sektor-0", message: t("talk.post.sectorError") });
    if (!name.trim()) found.push({ fieldId: "autor", message: t("talk.name.error") });
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) found.push({ fieldId: "email", message: t("forms.email.error") });
    if (!consent) found.push({ fieldId: "zgoda-przechowywanie", message: t("forms.consent.error") });
    void submit(found, {
      kind,
      title: title.trim(),
      description: description.trim(),
      sector: sector || null,
      seeking,
      target_groups: groups,
      place_terc: place.terc,
      display_name: name.trim(),
      organisation: organisation.trim() || null,
      email: email.trim() || null,
      consent_store: consent,
      [HONEYPOT_FIELD]: honeypot,
    });
  }

  if (status === "screened" && screened === "redirected") {
    return <HumanHelp placeName={places.find((option) => option.terc === place.terc)?.name ?? null} helplines={helplines} titleAs="h2" />;
  }
  if (status === "sent" && typeof result?.path === "string") {
    const [, id = "", key = ""] = /^\/rozmowa\/([^?]+)\?klucz=(.+)$/.exec(result.path) ?? [];
    return (
      <div ref={doneRef} tabIndex={-1} className="grid gap-4">
        <p className="font-bold">{t("talk.post.done")}</p>
        <PrivateLink id={id} keyValue={decodeURIComponent(key)} path={result.path} subject={title.trim()} />
      </div>
    );
  }

  const titleError = errorFor("tytul-ogloszenia");
  const descriptionError = errorFor("opis-ogloszenia");
  const nameError = errorFor("autor");
  const emailError = errorFor("email");

  return (
    <div className="grid gap-6">
      {status === "failed" && <FormFailed ref={failedRef} />}
      {status === "screened" && screened && screened !== "redirected" && <ScreenedNotice ref={failedRef} outcome={screened} />}
      <ErrorSummary ref={summaryRef} errors={errors} />
      <form noValidate onSubmit={handleSubmit} className="grid gap-6">
        <Honeypot value={honeypot} onChange={setHoneypot} />
        <RadioList
          idPrefix="rodzaj-ogloszenia"
          name="rodzaj-ogloszenia"
          legend={t("talk.post.kindLegend")}
          options={[
            { value: "szukam", label: t("talk.board.kind.szukam") },
            { value: "oferuje", label: t("talk.board.kind.oferuje") },
          ]}
          value={kind}
          onChange={(next) => setKind(next === "oferuje" ? "oferuje" : "szukam")}
        />
        <Field invalid={Boolean(titleError)}>
          <Label htmlFor="tytul-ogloszenia">{t("talk.post.title")}</Label>
          <Hint id="tytul-ogloszenia-podpowiedz">{t("talk.post.titleHint")}</Hint>
          {titleError && <FieldError id="tytul-ogloszenia-blad">{titleError}</FieldError>}
          <TextInput
            id="tytul-ogloszenia"
            maxLength={150}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-invalid={titleError ? true : undefined}
            aria-describedby={describedBy("tytul-ogloszenia-podpowiedz", titleError && "tytul-ogloszenia-blad")}
          />
        </Field>
        <Field invalid={Boolean(descriptionError)}>
          <Label htmlFor="opis-ogloszenia">{t("talk.post.description")}</Label>
          <Hint id="opis-ogloszenia-podpowiedz">{t("talk.post.descriptionHint")}</Hint>
          {descriptionError && <FieldError id="opis-ogloszenia-blad">{descriptionError}</FieldError>}
          <TextArea
            id="opis-ogloszenia"
            rows={5}
            maxLength={2000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            aria-invalid={descriptionError ? true : undefined}
            aria-describedby={describedBy("opis-ogloszenia-podpowiedz", descriptionError && "opis-ogloszenia-blad")}
          />
        </Field>
        <RadioList
          idPrefix="sektor"
          name="sektor"
          legend={t("talk.post.sectorLegend")}
          error={errorFor("sektor-0")}
          options={sectorCodes.map((code) => ({ value: code, label: sectorLabel(code) }))}
          value={sector}
          onChange={(next) => setSector(isSector(next) ? next : "")}
        />
        <CheckboxList
          idPrefix="szukane"
          name="szukane"
          legend={t("talk.post.seekingLegend")}
          hint={t("talk.post.optional")}
          options={sectorCodes.map((code) => ({ value: code, label: sectorLabel(code) }))}
          values={seeking}
          onChange={setSeeking}
        />
        <CheckboxList
          idPrefix="grupy"
          name="grupy"
          legend={t("talk.post.groupsLegend")}
          hint={t("talk.post.optional")}
          options={targetGroupCodes.map((code) => ({ value: code, label: targetGroupLabel(code) }))}
          values={groups}
          onChange={setGroups}
        />
        <PlaceCombobox id="miejsce" name="miejsce" places={places} localities={localities} value={place} onChange={setPlace} />
        <Field invalid={Boolean(nameError)}>
          <Label htmlFor="autor">{t("talk.name.label")}</Label>
          {nameError && <FieldError id="autor-blad">{nameError}</FieldError>}
          <TextInput
            id="autor"
            autoComplete="name"
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={describedBy(nameError && "autor-blad")}
          />
        </Field>
        <Field>
          <Label htmlFor="organizacja">{t("talk.organisation.label")}</Label>
          <Hint id="organizacja-podpowiedz">{t("talk.post.organisationHint")}</Hint>
          <TextInput id="organizacja" autoComplete="organization" maxLength={200} value={organisation} onChange={(event) => setOrganisation(event.target.value)} aria-describedby="organizacja-podpowiedz" />
        </Field>
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
          {t("talk.post.consent")}
        </Checkbox>
        <Hint>{t("talk.retention")}</Hint>
        <div>
          <Button type="submit" aria-disabled={status === "sending" ? true : undefined}>
            {t(status === "sending" ? "forms.sending" : "talk.post.submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
