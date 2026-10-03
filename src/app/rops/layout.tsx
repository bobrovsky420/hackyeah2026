import type { Metadata } from "next";
import { ConsoleNav } from "@/components/console/console-nav";
import { LoginForm } from "@/components/console/login-form";
import { FocusOnMount } from "@/components/route/focus-on-mount";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { t } from "@/lib/i18n";
import { consoleLocked, isAuthenticated } from "@/server/console/auth";
import { logout } from "./actions";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** S7: the ROPS console behind the access code; locked on a server without one. */
export default async function ConsoleLayout({ children }: LayoutProps<"/rops">) {
  if (!(await isAuthenticated())) {
    return (
      <div className="grid max-w-[40rem] gap-6">
        <FocusOnMount targetId="naglowek-logowania" />
        <header className="grid gap-2">
          <h1 id="naglowek-logowania" tabIndex={-1} className="text-[1.75rem] leading-tight font-bold @3xl:text-[2.2rem]">
            {t("console.login.title")}
          </h1>
          <p className="text-[1.1rem]">{t("console.login.lead")}</p>
        </header>
        {consoleLocked() ? (
          <Notice tone="warning" title={t("console.locked.title")} titleAs="h2">
            <p>{t("console.locked.text")}</p>
          </Notice>
        ) : (
          <LoginForm />
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <FocusOnMount targetId="naglowek-strony" />
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="font-bold text-muted-foreground">{t("console.eyebrow")}</p>
        <form action={logout}>
          <Button type="submit" variant="secondary">
            {t("console.logout")}
          </Button>
        </form>
      </div>
      <ConsoleNav />
      <Notice tone="warning" title={t("forms.prototype.title")}>
        <p>{t("console.prototype")}</p>
      </Notice>
      {children}
    </div>
  );
}
