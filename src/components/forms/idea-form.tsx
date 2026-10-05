"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { saveIdea } from "@/components/idea/saved-ideas";
import { HumanHelp } from "@/components/route/human-help";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox, CheckboxList, RadioList } from "@/components/ui/choice";
import { ErrorSummary, type FormError } from "@/components/ui/error-summary";
import { describedBy, Field, FieldError, Hint, Label, TextArea, TextInput } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { Helpline, IdeaKind, IdeaStage } from "@/lib/contracts";
import { t, type MessageKey } from "@/lib/i18n";
import { ideaKindCodes, ideaKindLabel, ideaStageCodes, ideaStageLabel, isIdeaKind, isIdeaStage, targetGroupCodes, targetGroupLabel } from "@/lib/labels";
import { pluralPl } from "@/lib/text";
import { FormFailed } from "./form-failed";
import { HONEYPOT_FIELD, Honeypot } from "./honeypot";
import { ScreenedNotice, useScreenedSubmit } from "./save-need-form";
import { EMAIL_PATTERN } from "./use-submit-form";

/** One text field of the card: its id, its limits and its message keys. */
interface TextSpec {
  id: string;
  min: number;
  max: number;
  rows?: number;
  label: MessageKey;
  hint: MessageKey;
  error: MessageKey;
}

const TITLE: TextSpec = { id: "nazwa-pomyslu", min: 3, max: 120, label: "idea.name.label", hint: "idea.name.hint", error: "idea.name.error" };
const DESCRIPTION: TextSpec = { id: "opis", min: 20, max: 1500, rows: 5, label: "idea.description.label", hint: "idea.description.hint", error: "idea.description.error" };
const ESSENCE: TextSpec = { id: "istota", min: 10, max: 1000, rows: 4, label: "idea.essence.label", hint: "idea.essence.hint", error: "idea.essence.error" };
const FOR_WHOM: TextSpec = { id: "dla-kogo", min: 3, max: 500, rows: 2, label: "idea.forWhom.label", hint: "idea.forWhom.hint", error: "idea.forWhom.error" };

/**
 * Module III, "Kreator pomysłów": the idea card (fiszka pomysłu) of a new
 * idea or a good practice tried in microscale, with what it is, its
 * essence, whom it is for and its stage. The gate screens the texts like a
 * saved need; once stored, the card's page shows similar innovations.
 */
export function IdeaForm({
  helplines,
}: {
  /** For the human help of S10 when the gate redirects the text (FR-12.5). */
  helplines: { alarm: Helpline[]; support: Helpline[] };
}) {
  const [kind, setKind] = useState<IdeaKind>("pomysl");
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<IdeaStage | "">("");
  const [groups, setGroups] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [isOrganisation, setIsOrganisation] = useState(false);
  const [email, setEmail] = useState("");
  const [consentStore, setConsentStore] = useState(false);
  const [consentPublish, setConsentPublish] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const { errors, status, result, screened, summaryRef, doneRef, failedRef, submit, errorFor } = useScreenedSubmit("/api/ideas");

  const value = (spec: TextSpec) => texts[spec.id] ?? "";
  const sentId = status === "sent" && typeof result?.id === "string" ? result.id : null;
  const sentTitle = (texts[TITLE.id] ?? "").trim();

  // "Moje zgłoszenia": this browser remembers the card, so its author sees ROPS's reply.
  useEffect(() => {
    if (sentId) saveIdea(sentId, sentTitle);
  }, [sentId, sentTitle]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: FormError[] = [];
    for (const spec of [TITLE, DESCRIPTION, ESSENCE, FOR_WHOM]) {
      if (value(spec).trim().length < spec.min) found.push({ fieldId: spec.id, message: t(spec.error) });
    }
    if (!stage) found.push({ fieldId: "etap-0", message: t("idea.stage.error") });
    if (!name.trim()) found.push({ fieldId: "autor", message: t("idea.author.error") });
    if (!EMAIL_PATTERN.test(email.trim())) found.push({ fieldId: "email", message: t("forms.email.error") });
    if (!consentStore) found.push({ fieldId: "zgoda-przechowywanie", message: t("forms.consent.error") });
    void submit(found, {
      kind,
      title: value(TITLE).trim(),
      description: value(DESCRIPTION).trim(),
      essence: value(ESSENCE).trim(),
      for_whom: value(FOR_WHOM).trim(),
      stage,
      target_groups: groups,
      display_name: name.trim(),
      is_organisation: isOrganisation,
      email: email.trim(),
      consent_store: consentStore,
      consent_publish: consentPublish,
      [HONEYPOT_FIELD]: honeypot,
    });
  }

  if (status === "screened" && screened === "redirected") {
    return <HumanHelp placeName={null} helplines={helplines} titleAs="h2" />;
  }

  if (status === "sent") {
    const ideaId = typeof result?.id === "string" ? result.id : null;
    const removed = typeof result?.redactions === "number" ? result.redactions : 0;
    return (
      <div ref={doneRef} tabIndex={-1} className="grid gap-4">
        <Notice tone="success" title={t("idea.done.title")} titleAs="h2">
          <p>{t("idea.done.text")}</p>
          <p>
            {t("idea.done.mine")} <Link href="/rozmowy">{t("shell.nav.mine")}</Link>.
          </p>
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
        {ideaId && (
          <div>
            <Link href={`/pomysl/${ideaId}`} className={buttonVariants()}>
              {t("idea.done.open")}
            </Link>
          </div>
        )}
      </div>
    );
  }

  function textField(spec: TextSpec) {
    const error = errorFor(spec.id);
    const hintId = `${spec.id}-podpowiedz`;
    const errorId = `${spec.id}-blad`;
    const common = {
      id: spec.id,
      maxLength: spec.max,
      value: value(spec),
      "aria-invalid": error ? true : undefined,
      "aria-describedby": describedBy(hintId, error && errorId),
    } as const;
    return (
      <Field invalid={Boolean(error)}>
        <Label htmlFor={spec.id}>{t(spec.label)}</Label>
        <Hint id={hintId}>{t(spec.hint)}</Hint>
        {error && <FieldError id={errorId}>{error}</FieldError>}
        {spec.rows ? (
          <TextArea {...common} rows={spec.rows} onChange={(event) => setTexts({ ...texts, [spec.id]: event.target.value })} />
        ) : (
          <TextInput {...common} onChange={(event) => setTexts({ ...texts, [spec.id]: event.target.value })} />
        )}
      </Field>
    );
  }

  const authorError = errorFor("autor");
  const emailError = errorFor("email");

  return (
    <div className="grid gap-6">
      {status === "failed" && <FormFailed ref={failedRef} />}
      {status === "screened" && screened && screened !== "redirected" && <ScreenedNotice ref={failedRef} outcome={screened} />}
      <ErrorSummary ref={summaryRef} errors={errors} />
      <form noValidate onSubmit={handleSubmit} className="grid gap-6">
        <Honeypot value={honeypot} onChange={setHoneypot} />
        <RadioList
          idPrefix="rodzaj"
          name="rodzaj"
          legend={t("idea.kind.legend")}
          options={ideaKindCodes.map((code) => ({ value: code, label: ideaKindLabel(code) }))}
          value={kind}
          onChange={(next) => isIdeaKind(next) && setKind(next)}
        />
        {textField(TITLE)}
        {textField(DESCRIPTION)}
        {textField(ESSENCE)}
        {textField(FOR_WHOM)}
        <CheckboxList
          idPrefix="grupy"
          name="grupy"
          legend={t("idea.groups.legend")}
          hint={t("idea.groups.hint")}
          options={targetGroupCodes.map((code) => ({ value: code, label: targetGroupLabel(code) }))}
          values={groups}
          onChange={setGroups}
        />
        <RadioList
          idPrefix="etap"
          name="etap"
          legend={t("idea.stage.legend")}
          error={errorFor("etap-0")}
          options={ideaStageCodes.map((code) => ({ value: code, label: ideaStageLabel(code) }))}
          value={stage}
          onChange={(next) => setStage(isIdeaStage(next) ? next : "")}
        />
        <Field invalid={Boolean(authorError)}>
          <Label htmlFor="autor">{t("idea.author.label")}</Label>
          {authorError && <FieldError id="autor-blad">{authorError}</FieldError>}
          <TextInput
            id="autor"
            autoComplete="name"
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={authorError ? true : undefined}
            aria-describedby={describedBy(authorError && "autor-blad")}
          />
        </Field>
        <Checkbox id="organizacja" checked={isOrganisation} onChange={setIsOrganisation}>
          {t("idea.isOrganisation")}
        </Checkbox>
        <Field invalid={Boolean(emailError)}>
          <Label htmlFor="email">{t("forms.email.label")}</Label>
          <Hint id="email-podpowiedz">{t("idea.email.hint")}</Hint>
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
          {t("idea.consent.store")}
        </Checkbox>
        <Checkbox id="zgoda-publikacja" checked={consentPublish} onChange={setConsentPublish}>
          {t("idea.consent.publish")}
        </Checkbox>
        <Hint>{t("idea.retention")}</Hint>
        <div>
          <Button type="submit" aria-disabled={status === "sending" ? true : undefined}>
            {t(status === "sending" ? "forms.sending" : "idea.submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
