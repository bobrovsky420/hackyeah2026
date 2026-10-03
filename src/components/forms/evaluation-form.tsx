"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { HumanHelp } from "@/components/route/human-help";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox, RadioList } from "@/components/ui/choice";
import { ErrorSummary, type FormError } from "@/components/ui/error-summary";
import { describedBy, Field, FieldError, Hint, Label, TextArea, TextInput } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { EvaluationExperience, Helpline, TesterRole } from "@/lib/contracts";
import { t, type MessageKey } from "@/lib/i18n";
import { experienceCodes, experienceLabel, isExperience, isTesterRole, testerRoleCodes, testerRoleLabel } from "@/lib/labels";
import type { LocalityOption, PlaceOption } from "@/lib/place-options";
import { pluralPl } from "@/lib/text";
import { FormFailed } from "./form-failed";
import { HONEYPOT_FIELD, Honeypot } from "./honeypot";
import { PlaceCombobox, type PlaceValue } from "./place-combobox";
import { ScreenedNotice, useScreenedSubmit } from "./save-need-form";
import { EMAIL_PATTERN } from "./use-submit-form";

/** The rating tiles, best first; "" is "Nie oceniam". */
const RATINGS: { value: string; label: MessageKey }[] = [
  { value: "5", label: "tester.rating.5" },
  { value: "4", label: "tester.rating.4" },
  { value: "3", label: "tester.rating.3" },
  { value: "2", label: "tester.rating.2" },
  { value: "1", label: "tester.rating.1" },
  { value: "", label: "tester.rating.none" },
];

/**
 * Module IV, "Tester innowacji": rate an innovation, say how one knows it,
 * give feedback, propose an improvement and sign up for its tests. Any of
 * them is enough; a sign-up asks for a name and an e-mail address.
 */
export function EvaluationForm({
  innovationId,
  innovationTitle,
  places,
  localities,
  helplines,
}: {
  innovationId: string;
  innovationTitle: string;
  places: PlaceOption[];
  localities: LocalityOption[];
  /** For the human help of S10 when the gate redirects the text (FR-12.5). */
  helplines: { alarm: Helpline[]; support: Helpline[] };
}) {
  const [rating, setRating] = useState("");
  const [experience, setExperience] = useState<EvaluationExperience | "">("");
  const [feedback, setFeedback] = useState("");
  const [improvement, setImprovement] = useState("");
  const [signup, setSignup] = useState(false);
  const [testerRole, setTesterRole] = useState<TesterRole | "">("");
  const [place, setPlace] = useState<PlaceValue>({ text: "", terc: null });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consentStore, setConsentStore] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const { errors, status, result, screened, summaryRef, doneRef, failedRef, submit, errorFor } = useScreenedSubmit(
    `/api/innovations/${encodeURIComponent(innovationId)}/evaluations`,
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: FormError[] = [];
    if (!rating && !feedback.trim() && !improvement.trim() && !signup) found.push({ fieldId: "ocena-0", message: t("tester.empty.error") });
    if (signup && !testerRole) found.push({ fieldId: "rola-testera-0", message: t("tester.signup.roleError") });
    if (signup && !name.trim()) found.push({ fieldId: "autor", message: t("tester.name.error") });
    if (signup && !email.trim()) found.push({ fieldId: "email", message: t("tester.email.required") });
    else if (email.trim() && !EMAIL_PATTERN.test(email.trim())) found.push({ fieldId: "email", message: t("forms.email.error") });
    if (!consentStore) found.push({ fieldId: "zgoda-przechowywanie", message: t("forms.consent.error") });
    void submit(found, {
      rating: rating ? Number(rating) : null,
      experience: experience || null,
      feedback: feedback.trim() || null,
      improvement: improvement.trim() || null,
      test_signup: signup,
      tester_role: signup ? testerRole : null,
      place_terc: signup ? place.terc : null,
      display_name: name.trim() || null,
      email: email.trim() || null,
      consent_store: consentStore,
      [HONEYPOT_FIELD]: honeypot,
    });
  }

  if (status === "screened" && screened === "redirected") {
    const placeName = places.find((option) => option.terc === place.terc)?.name ?? null;
    return <HumanHelp placeName={placeName} helplines={helplines} titleAs="h2" />;
  }

  if (status === "sent") {
    const removed = typeof result?.redactions === "number" ? result.redactions : 0;
    return (
      <div ref={doneRef} tabIndex={-1} className="grid gap-4">
        <Notice tone="success" title={t("tester.done.title")} titleAs="h2">
          <p>{t(signup ? "tester.done.signup" : "tester.done.text", { title: innovationTitle })}</p>
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
        <div>
          <Link href={`/innowacja/${innovationId}`} className={buttonVariants({ variant: "secondary" })}>
            {t("tester.back")}
          </Link>
        </div>
      </div>
    );
  }

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
          idPrefix="ocena"
          name="ocena"
          legend={t("tester.rating.legend")}
          hint={t("tester.rating.hint")}
          error={errorFor("ocena-0")}
          options={RATINGS.map((option) => ({ value: option.value, label: t(option.label) }))}
          value={rating}
          onChange={setRating}
        />
        <RadioList
          idPrefix="doswiadczenie"
          name="doswiadczenie"
          legend={t("tester.experience.legend")}
          hint={t("tester.optional")}
          options={experienceCodes.map((code) => ({ value: code, label: experienceLabel(code) }))}
          value={experience}
          onChange={(next) => setExperience(isExperience(next) ? next : "")}
        />
        <Field>
          <Label htmlFor="opinia">{t("tester.feedback.label")}</Label>
          <Hint id="opinia-podpowiedz">{t("tester.feedback.hint")}</Hint>
          <TextArea
            id="opinia"
            rows={4}
            maxLength={1500}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            aria-describedby="opinia-podpowiedz"
          />
        </Field>
        <Field>
          <Label htmlFor="usprawnienie">{t("tester.improvement.label")}</Label>
          <Hint id="usprawnienie-podpowiedz">{t("tester.improvement.hint")}</Hint>
          <TextArea
            id="usprawnienie"
            rows={4}
            maxLength={1500}
            value={improvement}
            onChange={(event) => setImprovement(event.target.value)}
            aria-describedby="usprawnienie-podpowiedz"
          />
        </Field>
        <Checkbox id="testy" checked={signup} onChange={setSignup} hint={t("tester.signup.hint")}>
          {t("tester.signup.label")}
        </Checkbox>
        {signup && (
          <div className="grid gap-6 border-l-4 border-border pl-4">
            <RadioList
              idPrefix="rola-testera"
              name="rola-testera"
              legend={t("tester.signup.roleLegend")}
              error={errorFor("rola-testera-0")}
              options={testerRoleCodes.map((code) => ({ value: code, label: testerRoleLabel(code) }))}
              value={testerRole}
              onChange={(next) => setTesterRole(isTesterRole(next) ? next : "")}
            />
            <PlaceCombobox id="miejsce" name="miejsce" places={places} localities={localities} value={place} onChange={setPlace} />
          </div>
        )}
        <Field invalid={Boolean(nameError)}>
          <Label htmlFor="autor">{t("tester.name.label")}</Label>
          <Hint id="autor-podpowiedz">{t("tester.name.hint")}</Hint>
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
        <Field invalid={Boolean(emailError)}>
          <Label htmlFor="email">{t("forms.email.label")}</Label>
          <Hint id="email-podpowiedz">{t("tester.email.hint")}</Hint>
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
          required
          hint={t("forms.consent.required")}
        >
          {t("tester.consent.store")}
        </Checkbox>
        <Hint>{t("tester.retention")}</Hint>
        <div>
          <Button type="submit" aria-disabled={status === "sending" ? true : undefined}>
            {t(status === "sending" ? "forms.sending" : "tester.submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
