"use client";

import { CircleAlert } from "lucide-react";
import type { Ref } from "react";
import { t } from "@/lib/i18n";

export interface FormError {
  fieldId: string;
  message: string;
}

/** Lists the errors at the top of a form; each links to its field (GOV.UK pattern). */
export function ErrorSummary({ errors, ref }: { errors: FormError[]; ref?: Ref<HTMLDivElement> }) {
  if (errors.length === 0) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      aria-labelledby="bledy-tytul"
      className="grid gap-2 rounded-md border-[3px] border-destructive bg-background p-5"
    >
      <h2 id="bledy-tytul" className="flex items-center gap-2 text-xl font-bold text-destructive">
        <CircleAlert aria-hidden className="size-6 shrink-0" />
        {t("forms.errorSummary.title")}
      </h2>
      <ul className="grid gap-1">
        {errors.map((error) => (
          <li key={error.fieldId}>
            <a
              href={`#${error.fieldId}`}
              className="font-bold text-destructive"
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(error.fieldId)?.focus();
              }}
            >
              {error.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
