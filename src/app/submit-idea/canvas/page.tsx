import type { Metadata } from "next";
import Link from "next/link";
import { CanvasWizard } from "@/components/forms/canvas-wizard";
import { InfoPage } from "@/components/info/info-page";
import { Notice } from "@/components/ui/notice";
import { helplines } from "@/lib/catalogue";
import { STEP_COUNT } from "@/lib/canvas";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("canvas.meta.title") };

/** Module III, the CANVAS application: the idea card asked block by block along the INNO AGH Social Innovation Canvas. */
export default function CanvasPage() {
  return (
    <InfoPage
      title={t("canvas.title")}
      afterTitle={
        <p>
          <Link href="/zglos-pomysl">{t("canvas.short")}</Link>
        </p>
      }
      lead={t("canvas.lead", { count: STEP_COUNT })}
    >
      <Notice title={t("forms.prototype.title")}>
        <p>{t("forms.prototype.text")}</p>
      </Notice>
      <CanvasWizard helplines={helplines()} />
      <p className="text-muted-foreground">{t("canvas.source")}</p>
    </InfoPage>
  );
}
