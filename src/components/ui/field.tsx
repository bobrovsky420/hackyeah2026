import { CircleAlert } from "lucide-react";
import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/* Text fields: 2 px border at 5.9:1; focus turns the frame into a thick blue one. */
export const controlClass =
  "block w-full min-h-11 rounded-md border-2 border-input bg-background px-3 py-2 text-base leading-normal text-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring aria-invalid:border-destructive";

export function Field({ invalid, className, children }: { invalid?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={cn("grid gap-2", invalid && "border-l-4 border-destructive pl-4", className)}>{children}</div>
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[1.05rem] leading-snug font-bold", className)} {...props} />;
}

export function Hint({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="text-muted-foreground">
      {children}
    </p>
  );
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-2 font-bold text-destructive">
      <CircleAlert aria-hidden className="mt-1 size-5 shrink-0" />
      <span>
        <span className="sr-only">{t("forms.error.prefix")} </span>
        {children}
      </span>
    </p>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClass, "min-h-36 resize-y", className)} {...props} />;
}

/** Joins the ids of hints and errors for aria-describedby, skipping the absent ones. */
export function describedBy(...ids: (string | false | null | undefined)[]): string | undefined {
  const present = ids.filter(Boolean);
  return present.length > 0 ? present.join(" ") : undefined;
}
