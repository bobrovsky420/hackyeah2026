import type { Metadata } from "next";
import { InfoPage, InfoSection } from "@/components/info/info-page";
import { t } from "@/lib/i18n";
import { ropsDepartment } from "@/lib/mock/contacts";

export const metadata: Metadata = { title: t("a11y.meta.title") };

/** S8: "Deklaracja dostępności" in the gov.pl structure (FR-11.4), with an honest status. */
export default function AccessibilityStatementPage() {
  return (
    <InfoPage title={t("a11y.title")} lead={t("a11y.lead")} draft>
      <InfoSection id="status" title={t("a11y.status.title")}>
        <p>{t("a11y.status.p1")}</p>
      </InfoSection>
      <InfoSection id="ulatwienia" title={t("a11y.features.title")}>
        <ul className="grid list-disc gap-2 pl-6">
          <li>{t("a11y.features.size")}</li>
          <li>{t("a11y.features.contrast")}</li>
          <li>{t("a11y.features.keyboard")}</li>
          <li>{t("a11y.features.device")}</li>
        </ul>
      </InfoSection>
      <InfoSection id="kontakt" title={t("a11y.contact.title")}>
        <p>
          {t("a11y.contact.p1")} <a href={`mailto:${ropsDepartment.email}`}>{ropsDepartment.email}</a>.
        </p>
        <p>{t("a11y.contact.p2")}</p>
      </InfoSection>
      <InfoSection id="data" title={t("a11y.date.title")}>
        <p>{t("a11y.date.p1")}</p>
      </InfoSection>
    </InfoPage>
  );
}
