import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SaveNeedForm } from "@/components/forms/save-need-form";
import { InfoPage } from "@/components/info/info-page";
import { Notice } from "@/components/ui/notice";
import { t } from "@/lib/i18n";
import { getMockRoute } from "@/lib/mock/routes";

export const metadata: Metadata = { title: t("s9c.meta.title") };

/** S9c: the needs bank entry, reached from S3. */
export default async function SaveNeedPage({ searchParams }: PageProps<"/zapisz-potrzebe">) {
  const query = await searchParams;
  const route = typeof query.droga === "string" ? getMockRoute(query.droga) : undefined;
  const backHref = route ? `/droga/${route.id}` : null;

  return (
    <InfoPage
      title={t("s9c.title")}
      lead={t("s9c.lead")}
      top={
        backHref && (
          <Link href={backHref} className="no-print inline-flex min-h-11 items-center gap-2 justify-self-start font-bold">
            <ArrowLeft aria-hidden className="size-5" />
            {t("forms.backToRoute")}
          </Link>
        )
      }
    >
      <Notice title={t("forms.prototype.title")}>
        <p>{t("forms.prototype.text")}</p>
      </Notice>
      <SaveNeedForm defaultText={route?.needSummary ?? ""} backHref={backHref} />
    </InfoPage>
  );
}
