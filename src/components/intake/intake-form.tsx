"use client";

import { ArrowRight, Check, Circle, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { PlaceCombobox, type PlaceValue } from "@/components/forms/place-combobox";
import { Button } from "@/components/ui/button";
import { RadioList } from "@/components/ui/choice";
import { ErrorSummary, type FormError } from "@/components/ui/error-summary";
import { describedBy, Field, FieldError, Hint, Label, TextArea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { t, type MessageKey } from "@/lib/i18n";
import { isRoleCode, roleCodes, roleLabel } from "@/lib/labels";
import { placeLabeller, type LocalityOption, type PlaceOption } from "@/lib/place-options";
import { DRAFT_KEY } from "@/lib/storage-keys";
import type { RoleCode } from "@/lib/contracts";
import { groupThousands, pluralPl } from "@/lib/text";
import { cn } from "@/lib/utils";

const MIN_LENGTH = 20;
const MAX_LENGTH = 2000;
const STEP_MS = 1500;


interface Draft {
  problem: string;
  place: PlaceValue;
  role: RoleCode | "";
}

const steps: MessageKey[] = ["s1.waiting.step1", "s1.waiting.step2", "s1.waiting.step3"];

const examples: { label: MessageKey; text: MessageKey; placeTerc?: string; role: RoleCode }[] = [
  { label: "s1.examples.seniors.label", text: "s1.examples.seniors.text", placeTerc: "1207062", role: "pracownik-instytucji" },
  { label: "s1.examples.schoolStress.label", text: "s1.examples.schoolStress.text", role: "pracownik-instytucji" },
  { label: "s1.examples.caregivers.label", text: "s1.examples.caregivers.text", role: "pracownik-instytucji" },
  { label: "s1.examples.vocational.label", text: "s1.examples.vocational.text", role: "pracownik-instytucji" },
];

function readDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return {
      problem: typeof parsed.problem === "string" ? parsed.problem : "",
      place: {
        text: typeof parsed.place?.text === "string" ? parsed.place.text : "",
        terc: typeof parsed.place?.terc === "string" ? parsed.place.terc : null,
      },
      role: isRoleCode(parsed.role) ? parsed.role : "",
    };
  } catch {
    return null;
  }
}

function writeDraft(draft: Draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage blocked: going back will show an empty form.
  }
}

/**
 * Screen S1 and its waiting state. The text survives going back ("Zmień
 * opis") through sessionStorage; nothing leaves the browser except the call
 * to the mock API. The gminas of the picker come from the server page.
 */
export function IntakeForm({
  children,
  places,
  localities,
}: {
  children: ReactNode;
  places: PlaceOption[];
  localities: LocalityOption[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({ problem: "", place: { text: "", terc: null }, role: "" });
  const [errors, setErrors] = useState<FormError[]>([]);
  const [phase, setPhase] = useState<"form" | "waiting" | "failed" | "limited">("form");
  const [step, setStep] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const summaryRef = useRef<HTMLDivElement>(null);
  const waitingHeadingRef = useRef<HTMLHeadingElement>(null);
  const failedRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const saved = readDraft();
    // Restoring the draft from sessionStorage has to wait for the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setDraft(saved);
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  function update(next: Partial<Draft>) {
    setDraft((current) => {
      const merged = { ...current, ...next };
      writeDraft(merged);
      return merged;
    });
  }

  const problemError = errors.find((error) => error.fieldId === "problem")?.message;
  const remaining = MAX_LENGTH - draft.problem.length;
  const counter = t("s1.problem.counter", {
    count: groupThousands(remaining),
    unit: pluralPl(remaining, {
      one: t("s1.problem.unit.one"),
      few: t("s1.problem.unit.few"),
      many: t("s1.problem.unit.many"),
    }),
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = draft.problem.trim();
    const found: FormError[] =
      problem.length < MIN_LENGTH ? [{ fieldId: "problem", message: t("s1.problem.errorShort") }] : [];
    setErrors(found);
    if (found.length > 0) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }

    setPhase("waiting");
    setStep(0);
    setAnnouncement(t("s1.waiting.announceStart"));
    requestAnimationFrame(() => waitingHeadingRef.current?.focus());
    timers.current = [
      window.setTimeout(() => {
        setStep(1);
        setAnnouncement(t("s1.waiting.step2"));
      }, STEP_MS),
      window.setTimeout(() => {
        setStep(2);
        setAnnouncement(t("s1.waiting.step3"));
      }, STEP_MS * 2),
    ];
    const minimumWait = new Promise((resolve) => window.setTimeout(resolve, STEP_MS * 3));

    try {
      const response = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem_text: problem, place_terc: draft.place.terc, role: draft.role || null }),
      });
      if (response.status === 429) {
        timers.current.forEach((timer) => window.clearTimeout(timer));
        setPhase("limited");
        setAnnouncement("");
        requestAnimationFrame(() => failedRef.current?.focus());
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { id, repeated } = (await response.json()) as { id: string; repeated?: boolean };
      // A repeated request opens the route it already got at once (FR-12.14).
      if (!repeated) await minimumWait;
      setStep(3);
      setAnnouncement(t("s1.waiting.done"));
      router.push(`/droga/${id}`);
    } catch {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      setPhase("failed");
      setAnnouncement("");
      requestAnimationFrame(() => failedRef.current?.focus());
    }
  }

  function fillExample(example: (typeof examples)[number]) {
    const gmina = places.find((place) => place.terc === example.placeTerc);
    update({
      problem: t(example.text),
      place: gmina ? { text: placeLabeller(places)(gmina), terc: gmina.terc } : { text: "", terc: null },
      role: example.role,
    });
    setErrors([]);
    document.getElementById("problem")?.focus();
  }

  const live = (
    <p role="status" className="sr-only">
      {announcement}
    </p>
  );

  if (phase === "waiting") {
    const excerpt = draft.problem.trim();
    return (
      <div className="grid max-w-[40rem] gap-7">
        {live}
        <div className="grid gap-2">
          <h1 ref={waitingHeadingRef} tabIndex={-1} className="text-[1.75rem] leading-tight font-bold @3xl:text-[2.2rem]">
            {t("s1.waiting.title")}
          </h1>
          <p>{t("s1.waiting.lead")}</p>
        </div>
        <ol className="grid gap-2">
          {steps.map((label, index) => {
            const state = index < step ? "done" : index === step ? "now" : "todo";
            return (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-3 rounded-lg border-2 px-4 py-3",
                  state === "now" ? "border-primary bg-accent" : "border-border",
                )}
              >
                {state === "done" && <Check aria-hidden className="size-6 shrink-0 text-success" />}
                {state === "now" && <LoaderCircle aria-hidden className="size-6 shrink-0 animate-spin text-primary" />}
                {state === "todo" && <Circle aria-hidden className="size-6 shrink-0 text-muted-foreground" />}
                <span className={cn("flex-1", state === "todo" ? "text-muted-foreground" : "font-bold")}>{t(label)}</span>
                <span className={cn(state === "done" ? "font-bold text-success" : "text-muted-foreground")}>
                  {t(state === "done" ? "s1.waiting.state.done" : state === "now" ? "s1.waiting.state.now" : "s1.waiting.state.todo")}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="grid gap-1">
          <p className="font-bold">{t("s1.waiting.yourText")}</p>
          <p className="text-muted-foreground">{excerpt.length > 160 ? `${excerpt.slice(0, 157).trimEnd()}…` : excerpt}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-14 @5xl:grid-cols-[40rem_minmax(0,1fr)] @5xl:items-start @5xl:gap-x-12">
      {live}
      <div className="grid max-w-[40rem] gap-8">
        <div className="grid gap-3">
          <h1 className="text-[1.75rem] leading-tight font-bold @3xl:text-[2.2rem]">{t("s1.title")}</h1>
          <p className="text-[1.1rem]">{t("s1.lead")}</p>
        </div>

        {phase === "failed" && (
          <div ref={failedRef} tabIndex={-1}>
            <Notice tone="error" title={t("s1.failed.title")} titleAs="h2">
              <p>{t("s1.failed.text")}</p>
            </Notice>
          </div>
        )}
        {phase === "limited" && (
          <div ref={failedRef} tabIndex={-1}>
            <Notice tone="error" title={t("s1.limited.title")} titleAs="h2">
              <p>{t("s1.limited.text")}</p>
            </Notice>
          </div>
        )}

        <ErrorSummary ref={summaryRef} errors={errors} />

        <form noValidate onSubmit={handleSubmit} className="grid gap-7">
          <Field invalid={Boolean(problemError)}>
            <Label htmlFor="problem">{t("s1.problem.label")}</Label>
            <Hint id="problem-podpowiedz">{t("s1.problem.hint")}</Hint>
            <Hint id="problem-przyklad">{t("s1.problem.example")}</Hint>
            {problemError && <FieldError id="problem-blad">{problemError}</FieldError>}
            <TextArea
              id="problem"
              name="problem"
              rows={6}
              maxLength={MAX_LENGTH}
              value={draft.problem}
              onChange={(event) => update({ problem: event.target.value })}
              aria-invalid={problemError ? true : undefined}
              aria-describedby={describedBy("problem-podpowiedz", "problem-przyklad", problemError && "problem-blad", "problem-licznik")}
            />
            <p id="problem-licznik" className="text-muted-foreground">
              {counter}
            </p>
          </Field>

          <PlaceCombobox id="miejsce" name="miejsce" places={places} localities={localities} value={draft.place} onChange={(place) => update({ place })} />

          <RadioList
            idPrefix="rola"
            name="rola"
            legend={t("s1.role.legend")}
            hint={t("s1.role.hint")}
            options={roleCodes.map((code) => ({ value: code, label: roleLabel(code) }))}
            value={draft.role}
            onChange={(role) => update({ role: isRoleCode(role) ? role : "" })}
          />

          <div>
            <Button type="submit">
              {t("s1.submit")}
              <ArrowRight aria-hidden />
            </Button>
          </div>
        </form>

        <section aria-labelledby="przyklady" className="grid gap-3">
          <h2 id="przyklady" className="text-[1.2rem] font-bold">
            {t("s1.examples.title")}
          </h2>
          <div className="flex flex-wrap gap-3">
            {examples.map((example) => (
              <Button key={example.label} variant="secondary" onClick={() => fillExample(example)}>
                {t(example.label)}
              </Button>
            ))}
          </div>
        </section>
      </div>
      {children}
    </div>
  );
}
