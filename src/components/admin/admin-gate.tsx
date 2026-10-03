import { InfoPage } from "@/components/info/info-page";
import { t } from "@/lib/i18n";
import { adminCode, adminSession, DEV_CODE, type AdminSession } from "@/server/admin/auth";
import { LoginForm } from "./login-form";

/** The session of a panel page, or null: the page then renders the door instead of its content. */
export async function gate(): Promise<AdminSession | null> {
  return adminSession();
}

/** The door of the panel (FR-9.1), on every panel page without a session. */
export function AdminLogin() {
  const code = adminCode();
  return (
    <InfoPage title={t("admin.login.title")} lead={t("admin.login.lead")}>
      <LoginForm locked={code === null} devHint={code === DEV_CODE} />
    </InfoPage>
  );
}
