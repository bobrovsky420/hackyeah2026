import type { ReactNode } from "react";
import { FocusOnMount } from "@/components/route/focus-on-mount";
import { JourneyMark } from "@/components/ui/journey-mark";
import type { Journey } from "@/lib/journeys";

/**
 * The frame of the information pages (S8) and the form pages. `headingId`
 * and `leadId` let a page carry required identifiers, such as those of the
 * gov.pl accessibility statement.
 */
export function InfoPage({
  title,
  lead,
  top,
  afterTitle,
  headingId = "naglowek-strony",
  leadId,
  journey,
  children,
}: {
  title: string;
  lead?: ReactNode;
  top?: ReactNode;
  /** A line right under the heading, such as another way to the same goal. */
  afterTitle?: ReactNode;
  headingId?: string;
  leadId?: string;
  /** The journey of the page (decision U.10): its mark above the heading. */
  journey?: Journey;
  children: ReactNode;
}) {
  return (
    <div className="grid max-w-[44rem] gap-8">
      <FocusOnMount targetId={headingId} />
      <header className="grid gap-3" data-journey={journey}>
        {top}
        <div className="flex items-center gap-3 @3xl:gap-4">
          {journey && <JourneyMark journey={journey} size="lg" className="@3xl:size-14" />}
          <h1 id={headingId} tabIndex={-1} className="text-[1.75rem] leading-tight font-bold @3xl:text-[2.2rem]">
            {title}
          </h1>
        </div>
        {afterTitle}
        {lead && (
          <p id={leadId} className="text-[1.1rem]">
            {lead}
          </p>
        )}
      </header>
      {children}
    </div>
  );
}

export function InfoSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-tytul`} className="grid scroll-mt-6 gap-3">
      <h2 id={`${id}-tytul`} className="text-[1.3rem] font-bold @3xl:text-[1.45rem]">
        {title}
      </h2>
      {children}
    </section>
  );
}
