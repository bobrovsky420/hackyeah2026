import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Attribution } from "@/components/innovation/attribution";
import { ReportLink } from "@/components/report/report-link";
import { FocusOnMount } from "@/components/route/focus-on-mount";
import { buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { getInnovation } from "@/lib/catalogue";
import type { Innovation, Material } from "@/lib/contracts";
import { t } from "@/lib/i18n";
import {
  costLabel,
  evidenceLabel,
  implementerLabels,
  sourceBadge,
  targetGroupLabel,
  timeLabel,
} from "@/lib/labels";
import { getRoute } from "@/server/route-service";

export async function generateMetadata({ params }: PageProps<"/innovation/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: getInnovation(id)?.title ?? t("notFound.meta.title") };
}

function materialFormat(material: Material): string {
  const extension = material.url.split("?")[0].split(".").pop()?.toUpperCase() ?? "";
  return material.type === "video" ? t("materials.video", { format: extension }) : t("knowledge.file", { format: extension });
}

const sectionTitle = "text-[1.3rem] font-bold @3xl:text-[1.45rem]";

function Header({ item, routeId }: { item: Innovation; routeId: string | undefined }) {
  return (
    <header className="grid gap-3">
      {routeId && (
        <Link href={`/droga/${routeId}`} className="no-print inline-flex min-h-11 items-center gap-2 justify-self-start font-bold">
          <ArrowLeft aria-hidden className="size-5" />
          {t("s5.back")}
        </Link>
      )}
      <div className="flex flex-wrap gap-2">
        {item.targetGroups.slice(0, 2).map((code) => (
          <p key={code} className="rounded-sm border border-input px-2 text-[0.9rem] font-bold text-muted-foreground">
            {targetGroupLabel(code)}
          </p>
        ))}
        <p className="rounded-sm border border-input px-2 text-[0.9rem] font-bold text-muted-foreground">
          {sourceBadge(item.source)}
        </p>
      </div>
      <h1 id="naglowek-innowacji" tabIndex={-1} className="text-[1.75rem] leading-tight font-bold @3xl:text-[2.2rem]">
        {item.title}
      </h1>
      {item.organisation && <p className="text-[1.1rem]">{item.organisation}</p>}
    </header>
  );
}

/**
 * S5: the innovation as a page, reached from a route or the map (rule R1:
 * no browse page). The MIIS items are shown like every ROPS item (decision
 * D.4).
 */
export default async function InnovationPage({ params, searchParams }: PageProps<"/innovation/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const item = getInnovation(id);
  if (!item) notFound();
  const routeId = typeof query.droga === "string" && (await getRoute(query.droga)) ? query.droga : undefined;

  return (
    <article aria-labelledby="naglowek-innowacji" className="grid max-w-[48rem] gap-8">
      <FocusOnMount targetId="naglowek-innowacji" />
      <Header item={item} routeId={routeId} />

      <Notice title={t("s5.generated.title")}>
        <p>{item.summary}</p>
        <p className="text-[0.95rem] text-muted-foreground">{t("s5.generated.label")}</p>
      </Notice>

      <section aria-labelledby="fakty" className="grid gap-3">
        <h2 id="fakty" className={sectionTitle}>
          {t("s5.facts.title")}
        </h2>
        <dl className="grid gap-x-6 gap-y-2 @xl:grid-cols-[max-content_minmax(0,1fr)]">
          <dt className="font-bold">{t("facts.forWhom")}</dt>
          <dd>{item.targetGroups.map(targetGroupLabel).join(", ")}</dd>
          <dt className="font-bold">{t("facts.implementer")}</dt>
          <dd>{implementerLabels(item.implementerTypes)}</dd>
          <dt className="font-bold">{t("facts.cost")}</dt>
          <dd>{costLabel(item.costBand)}</dd>
          <dt className="font-bold">{t("facts.time")}</dt>
          <dd>{timeLabel(item.timeToImplement)}</dd>
          <dt className="font-bold">{t("facts.evidence")}</dt>
          <dd>{evidenceLabel(item.evidenceLevel)}</dd>
          <dt className="font-bold">{t("facts.where")}</dt>
          <dd>{item.originPlace ?? t("facts.whereUnknown")}</dd>
          {item.incubator.name && (
            <>
              <dt className="font-bold">{t("facts.origin")}</dt>
              <dd>
                {item.incubator.years
                  ? t("facts.originValue", { name: item.incubator.name, years: item.incubator.years })
                  : item.incubator.name}
              </dd>
            </>
          )}
        </dl>
      </section>

      <section aria-labelledby="problem" className="grid gap-3">
        <h2 id="problem" className={sectionTitle}>
          {t("s5.problem.title")}
        </h2>
        <p>{item.problem}</p>
      </section>

      <section aria-labelledby="potrzebne" className="grid gap-3">
        <h2 id="potrzebne" className={sectionTitle}>
          {t("s5.requires.title")}
        </h2>
        <ul className="grid list-disc gap-1 pl-6">
          {item.requires.map((requirement) => (
            <li key={requirement}>{requirement}</li>
          ))}
        </ul>
      </section>

      {item.materials.length > 0 && (
        <section aria-labelledby="materialy" className="grid gap-3">
          <h2 id="materialy" className={sectionTitle}>
            {t("s5.materials.title")}
          </h2>
          <ul className="grid list-disc gap-2 pl-6">
            {item.materials.map((material) => (
              <li key={material.url}>
                <a href={material.url}>{material.title.replaceAll("_", " ")}</a>, {materialFormat(material)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="ludzie" className="grid gap-3">
        <h2 id="ludzie" className={sectionTitle}>
          {t("s5.people.title")}
        </h2>
        <p>{item.organisation ?? t("s5.people.unknown")}</p>
        {item.website && (
          <p>
            <a href={item.website}>{t("s5.people.website")}</a>
          </p>
        )}
      </section>

      <div className="no-print flex flex-wrap gap-3">
        <Link
          href={routeId ? `/kontakt?innowacja=${item.id}&droga=${routeId}` : `/kontakt?innowacja=${item.id}`}
          className={buttonVariants()}
        >
          {t("s2.card.contact")}
        </Link>
        <Link href={`/mapa?innowacja=${item.id}`} className={buttonVariants({ variant: "secondary" })}>
          {t("s5.whereNeeded")}
        </Link>
        {item.sourceUrl && (
          <a href={item.sourceUrl} className={buttonVariants({ variant: "secondary" })}>
            {t("s5.fullSource")}
          </a>
        )}
      </div>

      <Attribution item={item} />
      <ReportLink target={{ innowacja: item.id }} />
    </article>
  );
}
