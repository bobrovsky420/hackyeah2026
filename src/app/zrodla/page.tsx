import type { Metadata } from "next";
import { InfoPage, InfoSection } from "@/components/info/info-page";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("sources.meta.title") };

/** S8: "Źródła i licencje" (FR-11.3): catalogues, data, models and software. */
export default function SourcesPage() {
  return (
    <InfoPage title={t("sources.title")} lead={t("sources.lead")}>
      <InfoSection id="innowacje" title={t("sources.catalogues.title")}>
        <p>
          <a href="https://innowacjespoleczne.pl/">{t("source.name.national")}</a>. {t("sources.catalogues.national")}
        </p>
        <p>
          <a href="https://rops.krakow.pl/innowacje-spoleczne/biblioteka-innowacji-spolecznych">{t("source.name.rops")}</a>.{" "}
          {t("sources.catalogues.rops")}
        </p>
      </InfoSection>
      <InfoSection id="dane" title={t("sources.data.title")}>
        <p>{t("sources.data.p1")}</p>
      </InfoSection>
      <InfoSection id="modele" title={t("sources.models.title")}>
        <p>{t("sources.models.p1")}</p>
        <p>{t("sources.models.p2")}</p>
      </InfoSection>
      <InfoSection id="oprogramowanie" title={t("sources.software.title")}>
        <p>{t("sources.software.p1")}</p>
        <p>{t("sources.software.p2")}</p>
      </InfoSection>
    </InfoPage>
  );
}
