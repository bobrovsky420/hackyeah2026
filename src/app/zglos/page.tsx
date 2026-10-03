import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InfoPage } from "@/components/info/info-page";
import { ReportForm } from "@/components/report/report-form";
import type { ContentReport } from "@/lib/contracts/records";
import { t } from "@/lib/i18n";
import { getInnovation } from "@/lib/catalogue";
import { getRoute } from "@/lib/server/routes";
import { repository } from "@/server/db";

export const metadata: Metadata = { title: t("report.meta.title") };

interface Resolved {
  target: ContentReport["target"];
  what: string;
  backHref: string;
  backLabel: string;
}

async function resolve(query: Record<string, string | string[] | undefined>): Promise<Resolved | null> {
  const value = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : null);
  const routeId = value("droga");
  const innovationId = value("innowacja");
  const needId = value("fiszka");

  const route = routeId ? await getRoute(routeId) : undefined;
  if (route) {
    return {
      target: { type: "route", id: route.id },
      what: route.need_summary_pl ? t("report.what.routeFor", { need: route.need_summary_pl }) : t("report.what.route"),
      backHref: `/droga/${route.id}`,
      backLabel: t("forms.backToRoute"),
    };
  }
  const item = innovationId ? getInnovation(innovationId) : undefined;
  if (item) {
    return {
      target: { type: "innovation", id: item.id },
      what: t("report.what.innovation", { title: item.title }),
      backHref: `/innowacja/${item.id}`,
      backLabel: t("forms.backToInnovation"),
    };
  }
  const need = needId ? await repository().getNeed(needId) : undefined;
  if (need) {
    return {
      target: { type: "brief", id: need.id },
      what: t("report.what.brief"),
      backHref: `/potrzeba/${need.id}/fiszka`,
      backLabel: t("report.backToBrief"),
    };
  }
  return null;
}

/** "Zgłoś problem z tą treścią" (FR-12.9) as a page; the report goes to the moderation queue of S7. */
export default async function ReportPage({ searchParams }: PageProps<"/zglos">) {
  const resolved = await resolve(await searchParams);
  if (!resolved) notFound();

  return (
    <InfoPage
      title={t("report.title")}
      lead={t("report.lead")}
      top={
        <Link href={resolved.backHref} className="no-print inline-flex min-h-11 items-center gap-2 justify-self-start font-bold">
          <ArrowLeft aria-hidden className="size-5" />
          {resolved.backLabel}
        </Link>
      }
    >
      <p>
        <span className="font-bold">{t("report.what.label")}</span> {resolved.what}
      </p>
      <ReportForm target={resolved.target} backHref={resolved.backHref} backLabel={resolved.backLabel} />
      <p>
        {t("report.rules")} <Link href="/zasady#zglaszanie">{t("rules.title")}</Link>.
      </p>
    </InfoPage>
  );
}
