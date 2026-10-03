import type { ReactNode } from "react";
import { FocusOnMount } from "@/components/route/focus-on-mount";
import { Notice } from "@/components/ui/notice";
import { t } from "@/lib/i18n";

/**
 * The frame of the information pages (S8) and the form pages. `headingId`
 * and `leadId` let a page carry required identifiers, such as those of the
 * gov.pl accessibility statement.
 */
export function InfoPage({
  title,
  lead,
  draft,
  top,
  headingId = "naglowek-strony",
  leadId,
  children,
}: {
  title: string;
  lead?: ReactNode;
  draft?: boolean;
  top?: ReactNode;
  headingId?: string;
  leadId?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid max-w-[44rem] gap-8">
      <FocusOnMount targetId={headingId} />
      <header className="grid gap-3">
        {top}
        <h1 id={headingId} tabIndex={-1} className="text-[1.75rem] leading-tight font-bold @3xl:text-[2.2rem]">
          {title}
        </h1>
        {lead && (
          <p id={leadId} className="text-[1.1rem]">
            {lead}
          </p>
        )}
      </header>
      {draft && (
        <Notice tone="warning" title={t("info.draft.title")}>
          <p>{t("info.draft.text")}</p>
        </Notice>
      )}
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
