import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * The one mark of text a model wrote (decision U.11): a sparkles icon and an
 * accent edge, on the route's summary, the innovation's "W skrócie", the
 * incubator brief, the similar solutions of a card, the assistant's results
 * and the Middleman's plan. A part made from the data without a model keeps
 * a plain line, so the mark means the model.
 */

/** A box of generated text with its title. */
export function GeneratedNote({ title, className, children }: { title?: string; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("flex gap-3 border-l-4 border-primary bg-muted p-4", className)}>
      <Sparkles aria-hidden className="mt-1 size-5 shrink-0 text-primary" />
      <div className="grid min-w-0 gap-1.5">
        {title && <p className="text-base font-bold">{title}</p>}
        {children}
      </div>
    </div>
  );
}

/** The line that says a model wrote what is above it; without `model`, a plain line. */
export function GeneratedLine({ model = true, children }: { model?: boolean; children: ReactNode }) {
  if (!model) return <p className="text-muted-foreground">{children}</p>;
  return (
    <p className="flex gap-2 text-muted-foreground">
      <Sparkles aria-hidden className="mt-1 size-4 shrink-0 text-primary" />
      <span>{children}</span>
    </p>
  );
}
