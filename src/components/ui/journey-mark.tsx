import { HeartHandshake, Lightbulb, MapPin, MessageCircleQuestionMark, type LucideIcon } from "lucide-react";
import type { Journey } from "@/lib/journeys";
import { cn } from "@/lib/utils";

export const JOURNEY_ICONS: Record<Journey, LucideIcon> = {
  need: MapPin,
  idea: Lightbulb,
  help: HeartHandshake,
  ask: MessageCircleQuestionMark,
};

/**
 * A round mark in the colours of a journey or of the element around it:
 * the journey's icon, or the one given. Decoration beside words that say
 * the same, so hidden from screen readers.
 */
export function JourneyMark({ journey, icon, size = "md", className }: { journey?: Journey; icon?: LucideIcon; size?: "sm" | "md" | "lg"; className?: string }) {
  const Icon = icon ?? (journey ? JOURNEY_ICONS[journey] : MapPin);
  return (
    <span
      aria-hidden
      data-journey={journey}
      className={cn(
        "grid shrink-0 place-content-center rounded-full bg-journey-tint text-journey-ink",
        size === "sm" && "size-8",
        size === "md" && "size-10",
        size === "lg" && "size-12",
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-[1.1rem]" : size === "md" ? "size-5" : "size-6"} />
    </span>
  );
}
