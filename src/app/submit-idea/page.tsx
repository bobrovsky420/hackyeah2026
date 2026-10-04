import type { Metadata } from "next";
import Link from "next/link";
import { IdeaForm } from "@/components/forms/idea-form";
import { InfoPage } from "@/components/info/info-page";
import { Notice } from "@/components/ui/notice";
import { t } from "@/lib/i18n";
import { helplines } from "@/lib/catalogue";

export const metadata: Metadata = { title: t("idea.meta.title") };

/** Module III, "Kreator pomysłów": the idea card form, with the way to the longer CANVAS application. */
export default function SubmitIdeaPage() {
  return (
    <InfoPage
      title={t("idea.title")}
      afterTitle={
        <p className="text-[1.25rem] font-bold">
          <Link href="/zglos-pomysl/canvas">{t("idea.canvasLink")}</Link>
        </p>
      }
      lead={t("idea.lead")}
    >
      <Notice title={t("forms.prototype.title")}>
        <p>{t("forms.prototype.text")}</p>
      </Notice>
      <IdeaForm helplines={helplines()} />
    </InfoPage>
  );
}
