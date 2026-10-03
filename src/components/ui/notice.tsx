import { Check, CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  info: { box: "border-primary bg-accent", icon: Info, accent: "text-primary" },
  success: { box: "border-success bg-success-tint", icon: Check, accent: "text-success" },
  warning: { box: "border-warning-border bg-warning-tint", icon: TriangleAlert, accent: "text-foreground" },
  error: { box: "border-destructive bg-destructive-tint", icon: CircleAlert, accent: "text-destructive" },
};

/** A state box: a word in the title and an icon repeat what the colour says. */
export function Notice({
  tone = "info",
  title,
  titleAs: TitleTag = "p",
  className,
  children,
}: {
  tone?: keyof typeof tones;
  title?: string;
  titleAs?: "p" | "h2" | "h3";
  className?: string;
  children?: ReactNode;
}) {
  const { box, icon: Icon, accent } = tones[tone];
  return (
    <div className={cn("flex gap-3 rounded-lg border-2 p-4", box, className)}>
      <Icon aria-hidden className={cn("mt-1 size-5 shrink-0", accent)} />
      <div className="grid min-w-0 gap-1.5">
        {title && <TitleTag className={cn("text-base font-bold", tone !== "info" && accent)}>{title}</TitleTag>}
        {children}
      </div>
    </div>
  );
}
