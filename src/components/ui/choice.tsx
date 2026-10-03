import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FieldError, Hint } from "./field";

/*
 * Native radios and checkboxes inside large tiles (D4: radio lists instead of
 * chips). The chosen tile gets a thicker border and bold text as well as the
 * dot, so the choice never depends on colour alone.
 */
const tileClass =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border-2 border-input bg-background px-4 py-2 leading-snug has-checked:border-primary has-checked:bg-accent has-checked:font-bold has-checked:shadow-[inset_0_0_0_2px_var(--primary)] has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring";

const markClass = "size-5 shrink-0 accent-foreground focus-visible:outline-none";

export interface ChoiceOption {
  value: string;
  label: string;
}

interface GroupProps {
  idPrefix: string;
  name: string;
  legend: string;
  hint?: string;
  error?: string;
  options: ChoiceOption[];
}

function GroupFrame({ idPrefix, legend, hint, error, children }: Omit<GroupProps, "name" | "options"> & { children: ReactNode }) {
  const hintId = hint ? `${idPrefix}-podpowiedz` : undefined;
  const errorId = error ? `${idPrefix}-blad` : undefined;
  return (
    <fieldset
      className={cn("grid gap-2", error && "border-l-4 border-destructive pl-4")}
      aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
    >
      <legend className="mb-2 text-[1.05rem] leading-snug font-bold">{legend}</legend>
      {hint && <Hint id={hintId}>{hint}</Hint>}
      {error && <FieldError id={errorId}>{error}</FieldError>}
      <div className="grid gap-2">{children}</div>
    </fieldset>
  );
}

export function RadioList({
  value,
  onChange,
  ...props
}: GroupProps & { value: string; onChange: (value: string) => void }) {
  return (
    <GroupFrame {...props}>
      {props.options.map((option, index) => (
        <label key={option.value} className={tileClass}>
          <input
            id={`${props.idPrefix}-${index}`}
            type="radio"
            name={props.name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className={markClass}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </GroupFrame>
  );
}

export function CheckboxList({
  values,
  onChange,
  ...props
}: GroupProps & { values: string[]; onChange: (values: string[]) => void }) {
  return (
    <GroupFrame {...props}>
      {props.options.map((option, index) => (
        <label key={option.value} className={tileClass}>
          <input
            id={`${props.idPrefix}-${index}`}
            type="checkbox"
            name={props.name}
            value={option.value}
            checked={values.includes(option.value)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...values, option.value]
                  : values.filter((item) => item !== option.value),
              )
            }
            className={markClass}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </GroupFrame>
  );
}

/** A single checkbox, such as a consent; the label may be several sentences. */
export function Checkbox({
  id,
  checked,
  onChange,
  error,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  children: ReactNode;
}) {
  const errorId = error ? `${id}-blad` : undefined;
  return (
    <div className={cn("grid gap-2", error && "border-l-4 border-destructive pl-4")}>
      {error && <FieldError id={errorId}>{error}</FieldError>}
      <label className={cn(tileClass, "items-start py-3")}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={cn(markClass, "mt-0.5")}
        />
        <span>{children}</span>
      </label>
    </div>
  );
}
