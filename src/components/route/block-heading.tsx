import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { JourneyMark } from "@/components/ui/journey-mark";

/**
 * The heading of a route's section (decision U.10): its icon in a round
 * mark and a rule under it, both in the colours of the journey around it.
 */
export function BlockHeading({ id, icon, title, lead }: { id: string; icon: LucideIcon; title: string; lead?: ReactNode }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-3 border-b-[3px] border-journey-rule pb-2">
        <JourneyMark icon={icon} />
        <h2 id={id} className="text-[1.4rem] font-bold @3xl:text-[1.6rem]">
          {title}
        </h2>
      </div>
      {lead}
    </div>
  );
}
