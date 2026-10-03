"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent, type Ref } from "react";
import { HumanHelp } from "@/components/route/human-help";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox, RadioList } from "@/components/ui/choice";
import { ErrorSummary, type FormError } from "@/components/ui/error-summary";
import { describedBy, Field, FieldError, Hint, Label, TextArea, TextInput } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { RoleCode } from "@/lib/contracts/catalogue";
import type { Helpline } from "@/lib/contracts/contacts";
import { t } from "@/lib/i18n";
import { isRoleCode, roleCodes, roleLabel } from "@/lib/labels";
import type { PlaceOption } from "@/lib/place-options";
import { pluralPl } from "@/lib/text";
import { FormFailed } from "./form-failed";
import { HONEYPOT_FIELD, Honeypot } from "./honeypot";
import { PlaceCombobox, type PlaceValue } from "./place-combobox";
import { EMAIL_PATTERN } from "./use-submit-form";

/** The gate's answers to a need that is not one (7.12): human help first, or a respectful no. */
type Screened = "redirected" | "declined" | "off_topic";

/**
 * The form's POST (as useSubmitForm does it), which also reads the gate's
 * outcome: 200 with `{outcome: "redirected"}` or 422 with `declined` or
 * `off_topic` (9.2), so the form can answer each in its own way.
 */
function useSaveNeed() {
  const [errors, setErrors] = useState<FormError[]>([]);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "screened" | "failed">("idle");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [screened, setScreened] = useState<Screened | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  const failedRef = useRef<HTMLDivElement>(null);

  async function submit(found: FormError[], payload: unknown) {
    if (status === "sending") return;
    setErrors(found);
    if (found.length > 0) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setStatus("sending");
    try {
      const response = await fetch("/api/needs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = ((await response.json().catch(() => null)) ?? {}) as Record<string, unknown>;
      const outcome = body.outcome === "redirected" || body.outcome === "declined" || body.outcome === "off_topic" ? body.outcome : null;
      if (outcome && (response.ok || response.status === 422)) {
        setScreened(outcome);
        setStatus("screened");
        requestAnimationFrame(() => (outcome === "redirected" ? document.getElementById("naglowek-drogi") : failedRef.current)?.focus());
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setResult(body);
      setStatus("sent");
      requestAnimationFrame(() => doneRef.current?.focus());
    } catch {
      setStatus("failed");
      requestAnimationFrame(() => failedRef.current?.focus());
    }
  }

  function errorFor(fieldId: string): string | undefined {
    return errors.find((error) => error.fieldId === fieldId)?.message;
  }

  return { errors, status, result, screened, summaryRef, doneRef, failedRef, submit, errorFor };
}

/** The respectful no of S11 for a text the needs bank does not take; the form stays filled. */
function ScreenedNotice({ outcome, ref }: { outcome: Exclude<Screened, "redirected">; ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} tabIndex={-1}>
      {outcome === "declined" ? (
        <Notice tone="error" title={t("s11.title")} titleAs="h2">
          <p>{t("s11.text1")}</p>
          <p>{t("s11.text2")}</p>
          <p>
            <Link href="/zasady">{t("s11.rules")}</Link>
          </p>
        </Notice>
      ) : (
        <Notice tone="error" title={t("s11.offTopic.title")} titleAs="h2">
          <p>{t("s11.offTopic.text1")}</p>
        </Notice>
      )}
    </div>
  );
}

/** S9c: save a need in the needs bank, prefilled from the route it came from. */
export function SaveNeedForm({
  defaults,
  routeId,
  backHref,
  places,
  helplines,
}: {
  defaults: { text: string; place: PlaceValue; role: RoleCode | ""; targetGroups: string[] };
  routeId: string | null;
  backHref: string | null;
  places: PlaceOption[];
  /** For the human help of S10 when the gate redirects the text (FR-12.5). */
  helplines: { alarm: Helpline[]; support: Helpline[] };
}) {
  const [text, setText] = useState(defaults.text);
  const [place, setPlace] = useState<PlaceValue>(defaults.place);
  const [role, setRole] = useState<RoleCode | "">(defaults.role);
  const [email, setEmail] = useState("");
  const [consentStore, setConsentStore] = useState(false);
  const [consentPublish, setConsentPublish] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const { errors, status, result, screened, summaryRef, doneRef, failedRef, submit, errorFor } = useSaveNeed();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: FormError[] = [];
    if (text.trim().length < 20) found.push({ fieldId: "opis", message: t("s1.problem.errorShort") });
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) found.push({ fieldId: "email", message: t("forms.email.error") });
    if (!consentStore) found.push({ fieldId: "zgoda-przechowywanie", message: t("forms.consent.error") });
    void submit(found, {
      problem_text: text.trim(),
      place_terc: place.terc,
      role: role || null,
      target_groups: defaults.targetGroups,
      email: email.trim() || null,
      consent_store: consentStore,
      consent_publish: consentPublish,
      route_id: routeId,
      [HONEYPOT_FIELD]: honeypot,
    });
  }

  if (status === "screened" && screened === "redirected") {
    const placeName = places.find((option) => option.terc === place.terc)?.name ?? null;
    return <HumanHelp placeName={placeName} helplines={helplines} titleAs="h2" />;
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
      {status === "screened" && screened && screened !== "redirected" && <ScreenedNotice ref={failedRef} outcome={screened} />}
      <ErrorSummary ref={summaryRef} errors={errors} />
      <form noValidate onSubmit={handleSubmit} className="grid gap-6">
        <Honeypot value={honeypot} onChange={setHoneypot} />
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
        <PlaceCombobox id="miejsce" name="miejsce" places={places} value={place} onChange={setPlace} />
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
