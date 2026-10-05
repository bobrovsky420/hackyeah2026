import type { Metadata } from "next";
import { InfoPage } from "@/components/info/info-page";
import { PartnershipForm } from "@/components/talk/partnership-form";
import { Notice } from "@/components/ui/notice";
import { helplines } from "@/lib/catalogue";
import { t } from "@/lib/i18n";
import { localityOptions, placeOptions } from "@/lib/places";

export const metadata: Metadata = { title: t("talk.post.meta") };

/** Module V: a new post for the partnership board. */
export default function NewPartnershipPage() {
  return (
    <InfoPage journey="help" title={t("talk.post.pageTitle")} lead={t("talk.post.lead")}>
      <Notice title={t("forms.prototype.title")}>
        <p>{t("forms.prototype.text")}</p>
      </Notice>
      <PartnershipForm places={placeOptions()} localities={localityOptions()} helplines={helplines()} />
    </InfoPage>
  );
}
