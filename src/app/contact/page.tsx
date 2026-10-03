import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/forms/contact-form";
import { InfoPage } from "@/components/info/info-page";
import { Notice } from "@/components/ui/notice";
import type { ContactRequest } from "@/lib/contracts/records";
import { t } from "@/lib/i18n";
import { getGmina, getInnovation } from "@/lib/catalogue";
import { getRoute } from "@/lib/server/routes";

export const metadata: Metadata = { title: t("s9a.meta.title") };

/**
 * S9a as a page, not a dialog: it stays in view under a screen magnifier.
 * From the map it is prefilled for a gmina: "Zaproponuj gminie" (J4) goes
 * to that gmina's OPS or CUS, "Połącz z gminą, która już to wdrożyła" (J5)
 * to the gmina that runs the innovation. ROPS relays both.
 */
export default async function ContactPage({ searchParams }: PageProps<"/contact">) {
  const query = await searchParams;
  const item = typeof query.innowacja === "string" ? getInnovation(query.innowacja) : undefined;
  const route = typeof query.droga === "string" ? await getRoute(query.droga) : undefined;
  const gmina = typeof query.gmina === "string" ? getGmina(query.gmina) : undefined;
  const purpose = query.cel === "propozycja" || query.cel === "polaczenie" ? query.cel : null;
  const need = route?.need_summary_pl;

  let defaultMessage = t("s9a.message.defaultGeneral");
  let lead = item ? t("s9a.lead.innovation", { title: item.title }) : t("s9a.lead.general");
  let target: ContactRequest["target"] = item
    ? { type: "innovation", id: item.id }
    : { type: "advisor", id: route?.people.advisor.category ?? "inne" };

  if (gmina && item && purpose === "propozycja") {
    defaultMessage = t("s9a.message.propose", { name: gmina.name, title: item.title });
    lead = t("s9a.lead.propose", { name: gmina.name });
    target = { type: "gmina", id: gmina.terc };
  } else if (gmina && item && purpose === "polaczenie") {
    defaultMessage = t("s9a.message.connect", { name: gmina.name, title: item.title });
    lead = t("s9a.lead.connect", { name: gmina.name, title: item.title });
    target = { type: "gmina", id: gmina.terc };
  } else if (item && need) {
    defaultMessage = t("s9a.message.defaultInnovationNeed", { title: item.title, need });
  } else if (item) {
    defaultMessage = t("s9a.message.defaultInnovation", { title: item.title });
  } else if (need) {
    defaultMessage = t("s9a.message.defaultNeed", { need });
  }

  const fromMap = Boolean(gmina && item && purpose);
  const backHref = fromMap
    ? `/mapa?innowacja=${item?.id}`
    : route
      ? `/droga/${route.id}`
      : item
        ? `/innowacja/${item.id}`
        : "/";
  const backLabel = t(fromMap ? "forms.backToMap" : route ? "forms.backToRoute" : item ? "forms.backToInnovation" : "forms.backToStart");

  return (
    <InfoPage
      title={t("s9a.title")}
      lead={lead}
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
      <ContactForm
        defaultMessage={defaultMessage}
        target={target}
        routeId={route?.id ?? null}
        backHref={backHref}
        backLabel={backLabel}
      />
    </InfoPage>
  );
}
