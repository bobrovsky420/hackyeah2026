import type { Metadata } from "next";
import { IdeaForm } from "@/components/forms/idea-form";
import { InfoPage } from "@/components/info/info-page";
import { Notice } from "@/components/ui/notice";
import { t } from "@/lib/i18n";
import { helplines } from "@/lib/catalogue";

export const metadata: Metadata = { title: t("idea.meta.title") };

/** Module III, "Kreator pomysłów": the idea card form. */
export default function SubmitIdeaPage() {
  return (
    <InfoPage title={t("idea.title")} lead={t("idea.lead")}>
      <Notice title={t("forms.prototype.title")}>
        <p>{t("forms.prototype.text")}</p>
      </Notice>
      <IdeaForm helplines={helplines()} />
    </InfoPage>
  );
}
