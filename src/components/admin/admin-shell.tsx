import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { t, type MessageKey } from "@/lib/i18n";
import type { AdminSession } from "@/server/admin/auth";
import { demoCount, queueCounts, type QueueKey } from "@/server/admin/data";
import { TitleCount } from "./title-count";

export type AdminSection = "start" | "threads" | "partnerships" | "mentors" | "ideas" | "evaluations" | "needs" | "contacts" | "readiness" | "reports" | "trends" | "knowledge";

/** The queues each section of the menu holds: what is new there since the last visit is counted beside it. */
const SECTION_QUEUES: Partial<Record<AdminSection, QueueKey[]>> = {
  threads: ["threads"],
  partnerships: ["partnerships"],
  ideas: ["ideas"],
  evaluations: ["evaluations"],
  needs: ["needs"],
  contacts: ["contacts"],
  readiness: ["readiness"],
  reports: ["reports", "declined"],
};

const SECTIONS: { key: AdminSection; href: string; label: MessageKey }[] = [
  { key: "start", href: "/rops", label: "admin.nav.start" },
  { key: "threads", href: "/rops/rozmowy", label: "admin.nav.threads" },
  { key: "partnerships", href: "/rops/partnerstwa", label: "admin.nav.partnerships" },
  { key: "mentors", href: "/rops/mentorzy", label: "admin.nav.mentors" },
  { key: "ideas", href: "/rops/pomysly", label: "admin.nav.ideas" },
  { key: "evaluations", href: "/rops/opinie", label: "admin.nav.evaluations" },
  { key: "needs", href: "/rops/potrzeby", label: "admin.nav.needs" },
  { key: "contacts", href: "/rops/kontakty", label: "admin.nav.contacts" },
  { key: "readiness", href: "/rops/gotowosc", label: "admin.nav.readiness" },
  { key: "reports", href: "/rops/zgloszenia", label: "admin.nav.reports" },
  { key: "trends", href: "/rops/trendy", label: "admin.nav.trends" },
  { key: "knowledge", href: "/rops/wiedza", label: "admin.nav.knowledge" },
];

/**
 * The frame of every panel page: who is signed in, the sections with the
 * number of entries waiting that came since the reviewer's last visit
 * (the tab's title carries the total), the page's heading, the notice of
 * the demonstration data while the store holds it, and a saved notice.
 * "Oznacz wszystko jako przejrzane" on the dashboard sets the visit.
 */
export async function AdminShell({
  session,
  current,
  title,
  lead,
  saved,
  children,
}: {
  session: AdminSession;
  current: AdminSection;
  title: string;
  lead?: string;
  saved?: boolean;
  children: ReactNode;
}) {
  const [demo, counts] = await Promise.all([demoCount(), queueCounts(session.lastVisit)]);
  const fresh = (section: AdminSection) =>
    (SECTION_QUEUES[section] ?? []).reduce((sum, key) => sum + (counts.find((item) => item.key === key)?.fresh ?? 0), 0);
  const total = counts.reduce((sum, item) => sum + item.fresh, 0);
  return (
    <div className="grid gap-8">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <p>
          {t("admin.signedIn")} <span className="font-bold">{session.reviewer}</span>
        </p>
        <form action={logout}>
          <Button type="submit" variant="text">
            {t("admin.logout")}
          </Button>
        </form>
      </div>
      <TitleCount count={total} />
      <nav aria-label={t("admin.nav.label")} className="no-print">
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {SECTIONS.map((section) => {
            const count = fresh(section.key);
            return (
              <li key={section.key}>
                <Link
                  href={section.href}
                  aria-current={section.key === current ? "page" : undefined}
                  className="inline-flex min-h-11 items-center gap-2 aria-[current=page]:font-bold aria-[current=page]:no-underline"
                >
                  {t(section.label)}
                  {count > 0 && (
                    <span className="rounded-full bg-primary px-2 text-[0.85rem] leading-6 font-bold text-primary-foreground">
                      <span aria-hidden>{count}</span>
                      <span className="sr-only">, {t("admin.nav.fresh", { count })}</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <header className="grid gap-2">
        <p className="font-bold text-muted-foreground">{t("admin.eyebrow")}</p>
        <h1 id="naglowek-strony" tabIndex={-1} className="text-[1.75rem] leading-tight font-bold @3xl:text-[2.2rem]">
          {title}
        </h1>
        {lead && <p className="max-w-[48rem]">{lead}</p>}
      </header>
      {demo > 0 && (
        <Notice title={t("admin.demo.title")}>
          <p>{t("admin.demo.text", { count: demo })}</p>
        </Notice>
      )}
      {saved && (
        <div role="status">
          <Notice tone="success" title={t("admin.saved")}>
            <p>{t("admin.savedText")}</p>
          </Notice>
        </div>
      )}
      {children}
    </div>
  );
}

/** A panel page reads `?zapisano=1` after an action. */
export function wasSaved(query: Record<string, string | string[] | undefined>): boolean {
  return query.zapisano === "1";
}
