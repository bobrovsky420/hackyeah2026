"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { DocumentActions } from "@/components/document-actions";
import { FormFailed } from "@/components/forms/form-failed";
import { HONEYPOT_FIELD, Honeypot } from "@/components/forms/honeypot";
import { PlaceCombobox, type PlaceValue } from "@/components/forms/place-combobox";
import { ScreenedNotice, useScreenedSubmit } from "@/components/forms/save-need-form";
import { HumanHelp } from "@/components/route/human-help";
import { Button, buttonVariants } from "@/components/ui/button";
import { CheckboxList, RadioList } from "@/components/ui/choice";
import { ErrorSummary, type FormError } from "@/components/ui/error-summary";
import { describedBy, Field, Hint, Label, TextArea } from "@/components/ui/field";
import type { Helpline } from "@/lib/contracts";
import { t } from "@/lib/i18n";
import {
  CONSTRAINT_CODES,
  CONSTRAINTS,
  INSTITUTION_CODES,
  INSTITUTIONS,
  isInstitution,
  isScale,
  NOTE_MAX,
  SCALE_CODES,
  SCALES,
  type Constraint,
  type Institution,
  type Scale,
  type ServicePlan,
} from "@/lib/middleman";
import type { LocalityOption, PlaceOption } from "@/lib/place-options";

const sectionTitle = "text-[1.3rem] font-bold @3xl:text-[1.45rem]";

/**
 * Module VII, "Dostosuj do mojej instytucji": what the institution is, its
 * gmina, constraints and scale, and a note; then the service plan in
 * place of the form, printable and downloadable, with "Zmień odpowiedzi"
 * to ask again. The note goes through the gate on the server.
 */
export function AdaptForm({
  innovationId,
  groups,
  places,
  localities,
  helplines,
}: {
  innovationId: string;
  /** The innovation's target groups with their labels; a choice is asked only when there are several. */
  groups: { code: string; label: string }[];
  places: PlaceOption[];
  localities: LocalityOption[];
  helplines: { alarm: Helpline[]; support: Helpline[] };
}) {
  const [institution, setInstitution] = useState<Institution | "">("");
  const [place, setPlace] = useState<PlaceValue>({ text: "", terc: null });
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [scale, setScale] = useState<Scale | "">("");
  // No default: the first group is not the main one of every innovation.
  const [group, setGroup] = useState("");
  const [note, setNote] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [editing, setEditing] = useState(false);
  const { errors, status, result, screened, summaryRef, doneRef, failedRef, submit, errorFor } = useScreenedSubmit(
    `/api/innovations/${encodeURIComponent(innovationId)}/service`,
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: FormError[] = [];
    if (!institution) found.push({ fieldId: "instytucja-0", message: t("adapt.institution.error") });
    if (!scale) found.push({ fieldId: "skala-0", message: t("adapt.scale.error") });
    if (groups.length > 1 && !group) found.push({ fieldId: "grupa-0", message: t("adapt.group.error") });
    setEditing(false);
    void submit(found, {
      institution,
      place_terc: place.terc,
      constraints,
      scale,
      target_group: groups.length > 1 ? group : null,
      note: note.trim(),
      [HONEYPOT_FIELD]: honeypot,
    });
  }

  if (status === "screened" && screened === "redirected") {
    return <HumanHelp placeName={null} helplines={helplines} titleAs="h2" />;
  }

  const plan = status === "sent" && !editing ? (result?.plan as ServicePlan | undefined) : undefined;
  if (plan) {
    return (
      <div ref={doneRef} tabIndex={-1} className="grid gap-6">
        <PlanView plan={plan} />
        <DocumentActions markdown={String(result?.markdown ?? "")} filename={`plan-uslugi-${plan.innovation_id}.md`} />
        <div className="no-print flex flex-wrap gap-3">
          <Link href={`/zapytaj?innowacja=${encodeURIComponent(plan.innovation_id)}`} className={buttonVariants()}>
            {t("adapt.plan.next")}
          </Link>
          <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
            {t("adapt.again")}
          </Button>
        </div>
      </div>
    );
  }

  const noteHint = "notatka-podpowiedz";
  return (
    <div className="grid gap-6">
      {status === "failed" && <FormFailed ref={failedRef} />}
      {status === "screened" && screened && screened !== "redirected" && <ScreenedNotice ref={failedRef} outcome={screened} />}
      <ErrorSummary ref={summaryRef} errors={errors} />
      <form noValidate onSubmit={handleSubmit} className="grid gap-6">
        <Honeypot value={honeypot} onChange={setHoneypot} />
        <RadioList
          idPrefix="instytucja"
          name="instytucja"
          legend={t("adapt.institution.legend")}
          error={errorFor("instytucja-0")}
          options={INSTITUTION_CODES.map((code) => ({ value: code, label: t(INSTITUTIONS[code].label) }))}
          value={institution}
          onChange={(value) => setInstitution(isInstitution(value) ? value : "")}
        />
        <Field>
          <Hint>{t("adapt.place.hint")}</Hint>
          <PlaceCombobox id="gmina" name="gmina" places={places} localities={localities} value={place} onChange={setPlace} />
        </Field>
        <CheckboxList
          idPrefix="ograniczenia"
          name="ograniczenia"
          legend={t("adapt.constraints.legend")}
          hint={t("adapt.constraints.hint")}
          options={CONSTRAINT_CODES.map((code) => ({ value: code, label: t(CONSTRAINTS[code]) }))}
          values={constraints}
          onChange={(values) => setConstraints(CONSTRAINT_CODES.filter((code) => values.includes(code)))}
        />
        <RadioList
          idPrefix="skala"
          name="skala"
          legend={t("adapt.scale.legend")}
          error={errorFor("skala-0")}
          options={SCALE_CODES.map((code) => ({ value: code, label: t(SCALES[code]) }))}
          value={scale}
          onChange={(value) => setScale(isScale(value) ? value : "")}
        />
        {groups.length > 1 && (
          <RadioList
            idPrefix="grupa"
            name="grupa"
            legend={t("adapt.group.legend")}
            hint={t("adapt.group.hint")}
            error={errorFor("grupa-0")}
            options={groups.map((item) => ({ value: item.code, label: item.label }))}
            value={group}
            onChange={setGroup}
          />
        )}
        <Field>
          <Label htmlFor="notatka">{t("adapt.note.label")}</Label>
          <Hint id={noteHint}>{t("adapt.note.hint")}</Hint>
          <TextArea id="notatka" rows={3} maxLength={NOTE_MAX} value={note} onChange={(event) => setNote(event.target.value)} aria-describedby={describedBy(noteHint)} />
        </Field>
        <div className="grid gap-2">
          <div>
            <Button type="submit" aria-disabled={status === "sending" ? true : undefined}>
              {t(status === "sending" ? "forms.sending" : "adapt.submit")}
            </Button>
          </div>
          <p role="status" aria-live="polite">
            {status === "sending" ? t("adapt.pending") : ""}
          </p>
        </div>
      </form>
    </div>
  );
}

/** The plan, section by section, in the order of its file. */
function PlanView({ plan }: { plan: ServicePlan }) {
  return (
    <article aria-labelledby="plan-tytul" className="grid gap-6">
      <header className="grid gap-1">
        <h2 id="plan-tytul" className="text-[1.5rem] leading-tight font-bold">
          {t("adapt.plan.title", { title: plan.title })}
        </h2>
        <p className="text-muted-foreground">{[plan.institution_label, plan.place_name, plan.scale_label, plan.group_label].filter(Boolean).join(" · ")}</p>
      </header>
      <section aria-labelledby="plan-usluga" className="grid gap-2">
        <h3 id="plan-usluga" className={sectionTitle}>
          {t("adapt.plan.service")}
        </h3>
        <p>{plan.service}</p>
      </section>
      <section aria-labelledby="plan-role" className="grid gap-2">
        <h3 id="plan-role" className={sectionTitle}>
          {t("adapt.plan.roles")}
        </h3>
        <ul className="grid list-disc gap-1 pl-6">
          {plan.roles.map((role) => (
            <li key={role}>{role}</li>
          ))}
        </ul>
      </section>
      {plan.adaptations.length > 0 && (
        <section aria-labelledby="plan-dopasowanie" className="grid gap-2">
          <h3 id="plan-dopasowanie" className={sectionTitle}>
            {t("adapt.plan.adaptations")}
          </h3>
          <ul className="grid gap-2">
            {plan.adaptations.map((item, index) => (
              <li key={index} className="rounded-md border border-border p-3">
                {item.constraint && <span className="block font-bold">{item.constraint}</span>}
                {item.text}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="plan-kroki" className="grid gap-2">
        <h3 id="plan-kroki" className={sectionTitle}>
          {t("adapt.plan.steps")}
        </h3>
        <ol className="grid list-decimal gap-1 pl-6">
          {plan.first_steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="plan-potrzeby" className="grid gap-2">
        <h3 id="plan-potrzeby" className={sectionTitle}>
          {t("adapt.plan.needs")}
        </h3>
        <dl className="grid gap-x-6 gap-y-1 @xl:grid-cols-[max-content_minmax(0,1fr)]">
          {plan.needs.requires.length > 0 && (
            <>
              <dt className="font-bold">{t("adapt.plan.requires")}</dt>
              <dd>{plan.needs.requires.join(", ")}</dd>
            </>
          )}
          <dt className="font-bold">{t("adapt.plan.cost")}</dt>
          <dd>{plan.needs.cost}</dd>
          <dt className="font-bold">{t("adapt.plan.time")}</dt>
          <dd>{plan.needs.time}</dd>
          <dt className="font-bold">{t("adapt.plan.evidence")}</dt>
          <dd>{plan.needs.evidence}</dd>
        </dl>
      </section>
      <section aria-labelledby="plan-sciezki" className="grid gap-2">
        <h3 id="plan-sciezki" className={sectionTitle}>
          {t("adapt.plan.paths")}
        </h3>
        {plan.paths.length === 0 ? (
          <p>{t("adapt.plan.pathsNone")}</p>
        ) : (
          <ul className="grid gap-2">
            {plan.paths.map((path) => (
              <li key={path.name} className="grid gap-1 rounded-md border border-border p-3">
                <span className="font-bold">{path.name}</span>
                <span>{path.decision_maker}</span>
                <details>
                  <summary className="cursor-pointer">{t("adapt.plan.details")}</summary>
                  <p className="mt-2 text-muted-foreground">
                    {path.amount} {path.timing}
                  </p>
                </details>
                {path.source_url && (
                  <a href={path.source_url} className="justify-self-start">
                    {t("adapt.plan.source")}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="plan-wdrozenia" className="grid gap-2">
        <h3 id="plan-wdrozenia" className={sectionTitle}>
          {t("adapt.plan.implementers")}
        </h3>
        {plan.implementers.length === 0 ? (
          <p>{t("adapt.plan.implementersNone")}</p>
        ) : (
          <ul className="grid list-disc gap-1 pl-6">
            {plan.implementers.map((row, index) => (
              <li key={index}>{[row.organisation, row.place, row.year].filter(Boolean).join(", ")}</li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-muted-foreground">{t(plan.source === "model" ? "adapt.plan.model" : "adapt.plan.template")}</p>
    </article>
  );
}
