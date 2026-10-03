import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EvaluationForm } from "@/components/forms/evaluation-form";
import { InfoPage } from "@/components/info/info-page";
import { Notice } from "@/components/ui/notice";
import { getInnovation, helplines } from "@/lib/catalogue";
import { t } from "@/lib/i18n";
import { localityOptions, placeOptions } from "@/lib/places";

export async function generateMetadata({ params }: PageProps<"/innovation/[id]/test">): Promise<Metadata> {
  const { id } = await params;
  const item = getInnovation(id);
  return { title: item ? t("tester.meta.title", { title: item.title }) : t("notFound.meta.title") };
}

/** Module IV, "Tester innowacji": rate, comment on, improve and sign up to test one innovation. */
export default async function InnovationTestPage({ params }: PageProps<"/innovation/[id]/test">) {
  const { id } = await params;
  const item = getInnovation(id);
  if (!item) notFound();

  return (
    <InfoPage
      title={t("tester.title")}
      lead={t("tester.lead", { title: item.title })}
      top={
        <Link href={`/innowacja/${item.id}`} className="no-print inline-flex min-h-11 items-center gap-2 justify-self-start font-bold">
          <ArrowLeft aria-hidden className="size-5" />
          {t("tester.back")}
        </Link>
      }
    >
      <Notice title={t("forms.prototype.title")}>
        <p>{t("forms.prototype.text")}</p>
      </Notice>
      <EvaluationForm
        innovationId={item.id}
        innovationTitle={item.title}
        places={placeOptions()}
        localities={localityOptions()}
        helplines={helplines()}
      />
    </InfoPage>
  );
}
