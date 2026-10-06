import type { Metadata } from "next";
import { ReadinessForm } from "@/components/forms/readiness-form";
import { InfoPage } from "@/components/info/info-page";
import { Notice } from "@/components/ui/notice";
import { t } from "@/lib/i18n";
import { localityOptions, placeOptions } from "@/lib/places";

export const metadata: Metadata = { title: t("s9b.meta.title") };

/** S9b: "Chcę pomóc", the readiness registry. */
export default function ReadinessPage() {
  return (
    <InfoPage journey="help" title={t("s9b.title")} lead={t("s9b.lead")}>
      <Notice title={t("forms.prototype.title")}>
        <p>{t("forms.prototype.text")}</p>
      </Notice>
      <ReadinessForm places={placeOptions()} localities={localityOptions()} />
    </InfoPage>
  );
}
