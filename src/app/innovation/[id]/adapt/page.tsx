import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InfoPage } from "@/components/info/info-page";
import { AdaptForm } from "@/components/middleman/adapt-form";
import { Notice } from "@/components/ui/notice";
import { getInnovation, helplines } from "@/lib/catalogue";
import { t } from "@/lib/i18n";
import { targetGroupLabel } from "@/lib/labels";
import { localityOptions, placeOptions } from "@/lib/places";

export const metadata: Metadata = { title: t("adapt.meta.title") };

/** Module VII, the Middleman: "Dostosuj do mojej instytucji" for one innovation. */
export default async function AdaptPage({ params }: PageProps<"/innovation/[id]/adapt">) {
  const { id } = await params;
  const item = getInnovation(id);
  if (!item) notFound();
  return (
    <InfoPage
      title={t("adapt.title", { title: item.title })}
      lead={t("adapt.lead")}
      top={
        <Link href={`/innowacja/${item.id}`} className="no-print inline-flex min-h-11 items-center gap-2 justify-self-start font-bold">
          <ArrowLeft aria-hidden className="size-5" />
          {t("adapt.back")}
        </Link>
      }
    >
      <Notice title={t("forms.prototype.title")}>
        <p>{t("forms.prototype.text")}</p>
      </Notice>
      <AdaptForm
        innovationId={item.id}
        groups={item.targetGroups.map((code) => ({ code, label: targetGroupLabel(code) }))}
        places={placeOptions()}
        localities={localityOptions()}
        helplines={helplines()}
      />
    </InfoPage>
  );
}
