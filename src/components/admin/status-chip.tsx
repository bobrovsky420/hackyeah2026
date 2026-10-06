import { Archive, Check, Hourglass, Inbox, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * The state of an entry in the panel (decision U.11): new, in progress, done,
 * closed or late, each a tint, an icon and its words. The status colours
 * stay for states and never mark a journey.
 */
export type StatusTone = "new" | "progress" | "done" | "closed" | "late";

const TONES: Record<StatusTone, { box: string; icon: LucideIcon }> = {
  new: { box: "bg-accent text-primary", icon: Inbox },
  progress: { box: "bg-warning-tint text-foreground", icon: Hourglass },
  done: { box: "bg-success-tint text-success", icon: Check },
  closed: { box: "bg-muted text-muted-foreground", icon: Archive },
  late: { box: "bg-destructive-tint text-destructive", icon: TriangleAlert },
};

/** The tone of a status code of the panel's entries. */
export function statusTone(code: string): StatusTone {
  if (["nowy", "nowa", "nowe"].includes(code)) return "new";
  if (["w-analizie", "w-toku", "przekazane"].includes(code)) return "progress";
  if (["przyjety", "dopasowano-pozniej", "temat-naboru"].includes(code)) return "done";
  return "closed";
}

export function StatusChip({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const { box, icon: Icon } = TONES[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.95rem] leading-snug font-bold", box)}>
      <Icon aria-hidden className="size-4 shrink-0" />
      {children}
    </span>
  );
}
