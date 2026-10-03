import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/forms/contact-form";
import { InfoPage } from "@/components/info/info-page";
import { Notice } from "@/components/ui/notice";
import { t } from "@/lib/i18n";
import { getInnovation } from "@/lib/mock/data";
import { getMockRoute } from "@/lib/mock/routes";

export const metadata: Metadata = { title: t("s9a.meta.title") };

/** S9a as a page, not a dialog: it stays in view under a screen magnifier. */
export default async function ContactPage({ searchParams }: PageProps<"/kontakt">) {
  const query = await searchParams;
  const item = typeof query.innowacja === "string" ? getInnovation(query.innowacja) : undefined;
  const route = typeof query.droga === "string" ? getMockRoute(query.droga) : undefined;
  const need = route?.needSummary;

  let defaultMessage = t("s9a.message.defaultGeneral");
  if (item && need) defaultMessage = t("s9a.message.defaultInnovationNeed", { title: item.title, need });
  else if (item) defaultMessage = t("s9a.message.defaultInnovation", { title: item.title });
  else if (need) defaultMessage = t("s9a.message.defaultNeed", { need });

  const backHref = route ? `/droga/${route.id}` : item ? `/innowacja/${item.id}` : "/";
  const backLabel = t(route ? "forms.backToRoute" : item ? "forms.backToInnovation" : "forms.backToStart");

  return (
    <InfoPage
      title={t("s9a.title")}
      lead={item ? t("s9a.lead.innovation", { title: item.title }) : t("s9a.lead.general")}
      top={
        <Link href={backHref} className="no-print inline-flex min-h-11 items-center gap-2 justify-self-start font-bold">
          <ArrowLeft aria-hidden className="size-5" />
          {backLabel}
        </Link>
      }
    >
      <Notice title={t("forms.prototype.title")}>
        <p>{t("forms.prototype.text")}</p>
      </Notice>
      <ContactForm defaultMessage={defaultMessage} backHref={backHref} backLabel={backLabel} />
    </InfoPage>
  );
}
