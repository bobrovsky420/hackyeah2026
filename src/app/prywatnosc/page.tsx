import type { Metadata } from "next";
import { InfoPage, InfoSection } from "@/components/info/info-page";
import { t } from "@/lib/i18n";
import { ropsDepartment } from "@/lib/catalogue";

export const metadata: Metadata = { title: t("privacy.meta.title") };

/** S8: "Prywatność" (FR-11.2), describing what the prototype does. */
export default function PrivacyPage() {
  return (
    <InfoPage title={t("privacy.title")} lead={t("privacy.lead")} draft>
      <InfoSection id="serwer" title={t("privacy.server.title")}>
        <p>{t("privacy.server.p1")}</p>
      </InfoSection>
      <InfoSection id="przegladarka" title={t("privacy.browser.title")}>
        <p>{t("privacy.browser.p1")}</p>
        <p>{t("privacy.browser.p2")}</p>
      </InfoSection>
      <InfoSection id="cookie" title={t("privacy.cookies.title")}>
        <p>{t("privacy.cookies.p1")}</p>
      </InfoSection>
      <InfoSection id="kontakt" title={t("privacy.contact.title")}>
        <p>
          {t("privacy.contact.p1")} <a href={`mailto:${ropsDepartment().email}`}>{ropsDepartment().email}</a>.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
