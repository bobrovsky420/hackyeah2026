import { Check } from "lucide-react";
import type { ReactNode } from "react";
import type { SourceName } from "@/lib/contracts";
import { t } from "@/lib/i18n";
import { sourceBadge } from "@/lib/labels";
import { cn } from "@/lib/utils";

/*
 * The small marks of an innovation (decision U.11): where it comes from, whether
 * ROPS checked it, whom it serves, and how well it fits. Words in each;
 * the colour only weights them.
 */

const badge = "inline-flex items-center gap-1 rounded-sm px-2 text-[0.9rem] leading-relaxed font-bold";

/** The source: a ROPS one filled in the accent, so a regional solution stands out; the national base outlined. */
export function SourceBadge({ source }: { source: SourceName }) {
  const regional = source !== "baza-krajowa";
  return (
    <p className={cn(badge, "border", regional ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground")}>
      {sourceBadge(source)}
    </p>
  );
}

/** "Sprawdzone przez ROPS", with a tick. */
export function VerifiedBadge() {
  return (
    <p className={cn(badge, "border-2 border-success bg-success-tint text-success")}>
      <Check aria-hidden className="size-4" />
      {t("admin.verifiedBadge")}
    </p>
  );
}

/** A target group or another trait, on the accent's tint. */
export function Chip({ children }: { children: ReactNode }) {
  return <p className={cn(badge, "bg-accent text-primary")}>{children}</p>;
}

/**
 * The fit score as words, a bar and the number. The bar takes the colours
 * of the journey around it and is hidden from screen readers, which read
 * the number.
 */
export function FitMeter({ score, label, text }: { score: number; label?: string; text: string }) {
  const width = Math.max(0, Math.min(100, score));
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-bold">
      {label}
      <span aria-hidden className="h-2.5 w-28 overflow-hidden rounded-full bg-journey-tint ring-1 ring-journey-rule ring-inset">
        <span className="block h-full rounded-full bg-journey-ink" style={{ width: `${width}%` }} />
      </span>
      <span className={cn("tabular-nums", label ? "font-normal text-muted-foreground" : "font-normal")}>{text}</span>
    </p>
  );
}
