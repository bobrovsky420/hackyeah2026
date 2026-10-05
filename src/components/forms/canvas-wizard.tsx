"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type SetStateAction } from "react";
import { HumanHelp } from "@/components/route/human-help";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox, CheckboxList, RadioList } from "@/components/ui/choice";
import { ErrorSummary, type FormError } from "@/components/ui/error-summary";
import { describedBy, Field, FieldError, Hint, Label, TextArea, TextInput } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import {
  CANVAS_STEPS,
  canvasSections,
  CANVAS_VERSION,
  hintKey,
  labelKey,
  MAX_PARTNERS,
  optionDescriptionKey,
  optionKey,
  OTHER_MAX,
  otherKey,
  PARTNER_NAME_MAX,
  PARTNER_ROLES,
  PARTNER_STATUSES,
  promptKey,
  stepErrors,
  stepLeadKey,
  stepTitleKey,
  type CanvasAnswers,
  type CanvasField,
  type CanvasPartner,
} from "@/lib/canvas";
import type { AssistantSuggestion, Helpline } from "@/lib/contracts";
import { hasMessage, t, type MessageKey } from "@/lib/i18n";
import { saveIdea } from "@/components/idea/saved-ideas";
import { CANVAS_DRAFT_KEY } from "@/lib/storage-keys";
import { pluralPl } from "@/lib/text";
import { FormFailed } from "./form-failed";
import { HONEYPOT_FIELD, Honeypot } from "./honeypot";
import { ScreenedNotice, useScreenedSubmit } from "./save-need-form";
import { EMAIL_PATTERN } from "./use-submit-form";

/** The canvas's blocks, then the author's contact and the summary. */
const STEP_IDS = [...CANVAS_STEPS.map((step) => step.id), "contact", "summary"];
const CONTACT = STEP_IDS.indexOf("contact");
const SUMMARY = STEP_IDS.indexOf("summary");

/** The draft in this browser: the answers only, never the author's name or e-mail. */
interface Draft {
  version: string;
  step: number;
  furthest: number;
  answers: CanvasAnswers;
  partners: CanvasPartner[];
  /** The short-form card this application grows from, when it was opened from one. */
  basedOn?: string;
}

/** A short-form card the wizard grows from: its fields to start with, and the assistant's suggestions per step. */
export interface CanvasBase {
  id: string;
  title: string;
  answers: CanvasAnswers;
  hints: Partial<Record<string, { kind: AssistantSuggestion["kind"]; text: string }[]>>;
}

const HINT_KIND_KEYS: Record<AssistantSuggestion["kind"], MessageKey> = {
  pytanie: "card.assistant.kind.pytanie",
  inspiracja: "card.assistant.kind.inspiracja",
  pomysl: "card.assistant.kind.pomysl",
};

function readDraft(): Draft | null {
  try {
    const draft = JSON.parse(localStorage.getItem(CANVAS_DRAFT_KEY) ?? "null") as Draft | null;
    return draft?.version === CANVAS_VERSION && typeof draft.answers === "object" && Array.isArray(draft.partners) ? draft : null;
  } catch {
    return null;
  }
}

function writeDraft(draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(CANVAS_DRAFT_KEY, JSON.stringify(draft));
    else localStorage.removeItem(CANVAS_DRAFT_KEY);
  } catch {
    // Private windows and blocked storage: the wizard works without a draft.
  }
}

const EMPTY: Draft = { version: CANVAS_VERSION, step: 0, furthest: 0, answers: { kind: "pomysl" }, partners: [] };

const sectionTitle = "text-[1.3rem] font-bold @3xl:text-[1.45rem]";

/**
 * Module III, the CANVAS application (wniosek CANVAS): the idea card asked
 * block by block along the INNO AGH Social Innovation Canvas
 * (src/lib/canvas.ts). One step at a time, each checked before the next;
 * the heading of a new step takes focus. The answers stay in this browser
 * until they are sent, and are sent as one card through the gate.
 */
export function CanvasWizard({
  helplines,
  base,
}: {
  helplines: { alarm: Helpline[]; support: Helpline[] };
  /** Opened with "Rozbuduj do wniosku CANVAS" from a short-form card (`?z=`). */
  base?: CanvasBase;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const { step, furthest, answers, partners } = draft;
  const [stepErrorsShown, setStepErrorsShown] = useState<FormError[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [isOrganisation, setIsOrganisation] = useState(false);
  const [email, setEmail] = useState("");
  const [consentStore, setConsentStore] = useState(false);
  const [consentPublish, setConsentPublish] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const stepSummaryRef = useRef<HTMLDivElement>(null);
  const { status, result, screened, doneRef, failedRef, submit } = useScreenedSubmit("/api/ideas");

  // The draft is read after the first render, so the server's HTML and the browser's first render agree.
  useEffect(() => {
    const saved = readDraft();
    // A draft of this card, or any draft without a card to grow from, is restored; a new card starts from its own fields.
    const restore = saved && (!base || saved.basedOn === base.id);
    // Restoring the draft from localStorage has to wait for the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (restore) setDraft({ ...saved, step: Math.min(saved.step, SUMMARY), furthest: Math.min(saved.furthest, SUMMARY) });
    else if (base) setDraft({ ...EMPTY, answers: { ...EMPTY.answers, ...base.answers }, basedOn: base.id });
    setLoaded(true);
    // Read once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loaded) writeDraft(status === "sent" ? null : draft);
  }, [loaded, status, draft]);

  // "Moje zgłoszenia": this browser remembers the card, so its author sees ROPS's reply.
  const sentId = status === "sent" && typeof result?.id === "string" ? result.id : null;
  const sentTitle = typeof answers.title === "string" ? answers.title.trim() : "";
  useEffect(() => {
    if (sentId) saveIdea(sentId, sentTitle);
  }, [sentId, sentTitle]);

  const setAnswers = (change: SetStateAction<CanvasAnswers>) =>
    setDraft((current) => ({ ...current, answers: typeof change === "function" ? change(current.answers) : change }));
  const setPartners = (change: SetStateAction<CanvasPartner[]>) =>
    setDraft((current) => ({ ...current, partners: typeof change === "function" ? change(current.partners) : change }));

  /** Moves to a step; its heading takes focus once it is shown. */
  function goTo(next: number) {
    setStepErrorsShown([]);
    setDraft((current) => ({ ...current, step: next, furthest: Math.max(current.furthest, next) }));
    requestAnimationFrame(() => document.getElementById("krok-tytul")?.focus());
  }

  function contactErrors(): FormError[] {
    const found: FormError[] = [];
    if (!name.trim()) found.push({ fieldId: "autor", message: t("idea.author.error") });
    if (!EMAIL_PATTERN.test(email.trim())) found.push({ fieldId: "email", message: t("forms.email.error") });
    if (!consentStore) found.push({ fieldId: "zgoda-przechowywanie", message: t("forms.consent.error") });
    return found;
  }

  function currentErrors(): FormError[] {
    if (step < CANVAS_STEPS.length) return stepErrors(CANVAS_STEPS[step], answers, partners);
    return step === CONTACT ? contactErrors() : [];
  }

  function next() {
    const found = currentErrors();
    setStepErrorsShown(found);
    if (found.length > 0) {
      requestAnimationFrame(() => stepSummaryRef.current?.focus());
      return;
    }
    goTo(step + 1);
  }

  function send() {
    // The contact is checked again: a reload keeps the answers but not the contact, so it may be empty.
    const found = contactErrors();
    if (found.length > 0) {
      goTo(CONTACT);
      setStepErrorsShown(found);
      return;
    }
    void submit([], {
      ...(draft.basedOn && { extends: draft.basedOn }),
      canvas: answers,
      partners,
      display_name: name.trim(),
      is_organisation: isOrganisation,
      email: email.trim(),
      consent_store: consentStore,
      consent_publish: consentPublish,
      [HONEYPOT_FIELD]: honeypot,
    });
  }

  function startOver() {
    if (!window.confirm(t("canvas.clear.confirm"))) return;
    setDraft(base ? { ...EMPTY, answers: { ...EMPTY.answers, ...base.answers }, basedOn: base.id } : EMPTY);
    goTo(0);
  }

  const setAnswer = (id: string, value: string | string[]) => setAnswers((current) => ({ ...current, [id]: value }));
  const textOf = (id: string) => (typeof answers[id] === "string" ? (answers[id] as string) : "");
  const listOf = (id: string) => (Array.isArray(answers[id]) ? (answers[id] as string[]) : []);
  const errorFor = (fieldId: string) => stepErrorsShown.find((error) => error.fieldId === fieldId)?.message;

  if (status === "screened" && screened === "redirected") {
    return <HumanHelp placeName={null} helplines={helplines} titleAs="h2" />;
  }

  if (status === "sent") {
    const ideaId = typeof result?.id === "string" ? result.id : null;
    const removed = typeof result?.redactions === "number" ? result.redactions : 0;
    return (
      <div ref={doneRef} tabIndex={-1} className="grid gap-4">
        <Notice tone="success" title={t("canvas.done.title")} titleAs="h2">
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
          <div className="flex flex-wrap gap-3">
            <Link href={`/pomysl/${ideaId}`} className={buttonVariants()}>
              {t("idea.done.open")}
            </Link>
            <Link href={`/pomysl/${ideaId}?asystent=1#asystent`} className={buttonVariants({ variant: "secondary" })}>
              {t("idea.done.assistant")}
            </Link>
          </div>
        )}
      </div>
    );
  }

  function renderField(field: CanvasField) {
    if (field.type === "choice") {
      return (
        <RadioList
          key={field.id}
          idPrefix={field.id}
          name={field.id}
          legend={t(labelKey(field.id))}
          hint={hasMessage(hintKey(field.id)) ? t(hintKey(field.id)) : undefined}
          error={errorFor(`${field.id}-0`)}
          options={field.options.map((code) => ({
            value: code,
            label: t(optionKey(field.id, code)),
            description: field.described ? t(optionDescriptionKey(field.id, code)) : undefined,
          }))}
          value={textOf(field.id)}
          onChange={(value) => setAnswer(field.id, value)}
        />
      );
    }
    if (field.type === "multi") {
      const other = otherKey(field.id);
      const otherError = errorFor(other);
      return (
        <div key={field.id} className="grid gap-3">
          <CheckboxList
            idPrefix={field.id}
            name={field.id}
            legend={t(labelKey(field.id))}
            hint={hasMessage(hintKey(field.id)) ? t(hintKey(field.id)) : undefined}
            error={errorFor(`${field.id}-0`)}
            options={field.options.map((code) => ({ value: code, label: t(optionKey(field.id, code)) }))}
            values={listOf(field.id)}
            onChange={(values) => setAnswer(field.id, values)}
          />
          {field.other && (
            <Field invalid={Boolean(otherError)}>
              <Label htmlFor={other}>{t("canvas.other.label")}</Label>
              <Hint id={`${other}-podpowiedz`}>{t("canvas.other.hint")}</Hint>
              {otherError && <FieldError id={`${other}-blad`}>{otherError}</FieldError>}
              <TextInput
                id={other}
                maxLength={OTHER_MAX}
                value={textOf(other)}
                onChange={(event) => setAnswer(other, event.target.value)}
                aria-invalid={otherError ? true : undefined}
                aria-describedby={describedBy(`${other}-podpowiedz`, otherError && `${other}-blad`)}
              />
            </Field>
          )}
        </div>
      );
    }
    if (field.type === "text") {
      const error = errorFor(field.id);
      const hintId = `${field.id}-podpowiedz`;
      const hint = hasMessage(hintKey(field.id)) ? t(hintKey(field.id)) : null;
      const common = {
        id: field.id,
        maxLength: field.max,
        value: textOf(field.id),
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy(hint && hintId, error && `${field.id}-blad`),
      } as const;
      return (
        <Field key={field.id} invalid={Boolean(error)}>
          <Label htmlFor={field.id}>{t(labelKey(field.id))}</Label>
          {hint && <Hint id={hintId}>{hint}</Hint>}
          {field.prompts && (
            <div className="grid gap-1 text-muted-foreground">
              <p>{t("canvas.prompts")}</p>
              <ul className="grid list-disc gap-0.5 pl-6">
                {Array.from({ length: field.prompts }, (_, index) => (
                  <li key={index}>{t(promptKey(field.id, index))}</li>
                ))}
              </ul>
            </div>
          )}
          {error && <FieldError id={`${field.id}-blad`}>{error}</FieldError>}
          {field.rows ? (
            <TextArea {...common} rows={field.rows} onChange={(event) => setAnswer(field.id, event.target.value)} />
          ) : (
            <TextInput {...common} onChange={(event) => setAnswer(field.id, event.target.value)} />
          )}
        </Field>
      );
    }
    return <div key={field.id}>{renderPartners()}</div>;
  }

  function updatePartner(index: number, change: Partial<CanvasPartner>) {
    setPartners((current) => current.map((partner, at) => (at === index ? { ...partner, ...change } : partner)));
  }

  function addPartner() {
    setPartners((current) => [...current, { name: "", roles: [], status: "potencjalny" }]);
    const index = partners.length;
    requestAnimationFrame(() => document.getElementById(`partner-${index}-nazwa`)?.focus());
  }

  function removePartner(index: number) {
    setPartners((current) => current.filter((_, at) => at !== index));
    requestAnimationFrame(() => document.getElementById("dodaj-partnera")?.focus());
  }

  function renderPartners() {
    return (
      <div className="grid gap-5">
        {partners.length === 0 && <p>{t("canvas.partners.none")}</p>}
        {partners.map((partner, index) => {
          const nameId = `partner-${index}-nazwa`;
          const error = errorFor(nameId);
          const number = index + 1;
          return (
            <fieldset key={index} className="grid gap-4 rounded-md border border-border p-4">
              <legend className="px-1 text-[1.1rem] font-bold">{t("canvas.partners.legend", { number })}</legend>
              <Field invalid={Boolean(error)}>
                <Label htmlFor={nameId}>{t("canvas.partners.name")}</Label>
                {error && <FieldError id={`${nameId}-blad`}>{error}</FieldError>}
                <TextInput
                  id={nameId}
                  maxLength={PARTNER_NAME_MAX}
                  value={partner.name}
                  onChange={(event) => updatePartner(index, { name: event.target.value })}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={describedBy(error && `${nameId}-blad`)}
                />
              </Field>
              <CheckboxList
                idPrefix={`partner-${index}-rola`}
                name={`partner-${index}-rola`}
                legend={t("canvas.partners.roles")}
                options={PARTNER_ROLES.map((code) => ({ value: code, label: t(optionKey("partner-role", code)) }))}
                values={partner.roles}
                onChange={(values) => updatePartner(index, { roles: PARTNER_ROLES.filter((code) => values.includes(code)) })}
              />
              <RadioList
                idPrefix={`partner-${index}-status`}
                name={`partner-${index}-status`}
                legend={t("canvas.partners.status")}
                options={PARTNER_STATUSES.map((code) => ({ value: code, label: t(optionKey("partner-status", code)) }))}
                value={partner.status}
                onChange={(value) => {
                  const status = PARTNER_STATUSES.find((code) => code === value);
                  if (status) updatePartner(index, { status });
                }}
              />
              <div>
                <Button variant="secondary" onClick={() => removePartner(index)}>
                  {t("canvas.partners.remove", { number })}
                </Button>
              </div>
            </fieldset>
          );
        })}
        {partners.length < MAX_PARTNERS ? (
          <div>
            <Button id="dodaj-partnera" variant="secondary" onClick={addPartner}>
              {t("canvas.partners.add")}
            </Button>
          </div>
        ) : (
          <p>{t("canvas.partners.limit", { max: MAX_PARTNERS })}</p>
        )}
      </div>
    );
  }

  function renderContact() {
    const authorError = errorFor("autor");
    const emailError = errorFor("email");
    return (
      <>
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
      </>
    );
  }

  function renderSummary() {
    const sections = canvasSections({ version: CANVAS_VERSION, answers, partners }, { core: true, empty: true });
    return (
      <div className="grid gap-6">
        {sections.map((section) => (
          <section key={section.id} aria-labelledby={`podsumowanie-${section.id}`} className="grid gap-3 border-t border-border pt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 id={`podsumowanie-${section.id}`} className="text-[1.15rem] font-bold">
                {section.title}
              </h3>
              <Button
                variant="text"
                aria-label={t("canvas.change.label", { step: section.title })}
                onClick={() => goTo(STEP_IDS.indexOf(section.id))}
              >
                {t("canvas.change")}
              </Button>
            </div>
            {section.rows.length === 0 ? (
              <p className="text-muted-foreground">{t("canvas.empty")}</p>
            ) : (
              <dl className="grid gap-x-6 gap-y-2 @xl:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
                {section.rows.map((row, index) => (
                  <div key={index} className="contents">
                    <dt className="font-bold">{row.label}</dt>
                    <dd className="whitespace-pre-line">{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        ))}
        <section aria-labelledby="podsumowanie-kontakt" className="grid gap-3 border-t border-border pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 id="podsumowanie-kontakt" className="text-[1.15rem] font-bold">
              {t("canvas.step.contact")}
            </h3>
            <Button variant="text" aria-label={t("canvas.change.label", { step: t("canvas.step.contact") })} onClick={() => goTo(CONTACT)}>
              {t("canvas.change")}
            </Button>
          </div>
          <p>
            {name.trim()}
            {email.trim() && `, ${email.trim()}`}
          </p>
        </section>
      </div>
    );
  }

  const stepId = STEP_IDS[step];
  const title = t(stepTitleKey(stepId));

  return (
    <div className="grid gap-6">
      {status === "failed" && <FormFailed ref={failedRef} />}
      {status === "screened" && screened && screened !== "redirected" && <ScreenedNotice ref={failedRef} outcome={screened} />}

      <details className="rounded-md border border-border p-4">
        <summary className="cursor-pointer font-bold">{t("canvas.steps")}</summary>
        <nav aria-label={t("canvas.steps")} className="mt-3">
          <ol className="grid list-decimal gap-1 pl-6">
            {STEP_IDS.map((id, index) => (
              <li key={id}>
                {index <= furthest && index !== step ? (
                  <Button variant="text" className="min-h-9 justify-start px-0 text-left" onClick={() => goTo(index)}>
                    {t(stepTitleKey(id))}
                  </Button>
                ) : (
                  <span aria-current={index === step ? "step" : undefined} className={index === step ? "font-bold" : "text-muted-foreground"}>
                    {t(stepTitleKey(id))}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      </details>

      <section aria-labelledby="krok-tytul" className="grid gap-6">
        <header className="grid gap-2">
          <p id="krok-postep" className="font-bold text-muted-foreground">
            {t("canvas.progress", { current: step + 1, total: STEP_IDS.length })}
          </p>
          <div aria-hidden className="h-2 overflow-hidden rounded-full border border-border bg-muted">
            <div className="h-full bg-primary" style={{ width: `${((step + 1) / STEP_IDS.length) * 100}%` }} />
          </div>
          <h2 id="krok-tytul" tabIndex={-1} className={sectionTitle}>
            {title}
          </h2>
          <p>{t(stepLeadKey(stepId))}</p>
        </header>

        {base?.hints[stepId] && base.hints[stepId]!.length > 0 && (
          <aside aria-labelledby="krok-podpowiedzi" className="grid gap-2 rounded-md border-2 border-border bg-muted p-4">
            <h3 id="krok-podpowiedzi" className="font-bold">
              {t("canvas.hints.title")}
            </h3>
            <ul className="grid list-disc gap-1 pl-5">
              {base.hints[stepId]!.map((hint, index) => (
                <li key={index}>
                  <span className="font-bold">{t(HINT_KIND_KEYS[hint.kind])}:</span> {hint.text}
                </li>
              ))}
            </ul>
          </aside>
        )}

        <ErrorSummary ref={stepSummaryRef} errors={stepErrorsShown} />

        <form
          noValidate
          className="grid gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (step === SUMMARY) send();
            else next();
          }}
        >
          <Honeypot value={honeypot} onChange={setHoneypot} />
          {step < CANVAS_STEPS.length && CANVAS_STEPS[step].fields.map(renderField)}
          {step === CONTACT && renderContact()}
          {step === SUMMARY && renderSummary()}

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
            {step === SUMMARY ? (
              <Button type="submit" aria-disabled={status === "sending" ? true : undefined}>
                {t(status === "sending" ? "forms.sending" : "canvas.submit")}
              </Button>
            ) : (
              <Button type="submit">{t("canvas.next")}</Button>
            )}
            {step > 0 && (
              <Button variant="secondary" onClick={() => goTo(step - 1)}>
                {t("canvas.back")}
              </Button>
            )}
            <Button variant="text" className="ml-auto" onClick={startOver}>
              {t("canvas.clear")}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
