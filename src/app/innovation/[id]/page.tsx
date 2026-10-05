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
import { repository } from "@/server/db";
import { overlayInnovation } from "@/server/knowledge/overlay";
import type { EvaluationSummary, Innovation, Material } from "@/lib/contracts";
import { MAP_ENABLED } from "@/lib/features";
import { t } from "@/lib/i18n";
import { pluralPl } from "@/lib/text";
import {
  costLabel,
  evidenceLabel,
  implementerLabels,
  sourceBadge,
  targetGroupLabel,
  timeLabel,
} from "@/lib/labels";
import { evaluationSummary } from "@/server/evaluations";
import { getRoute } from "@/server/route-service";

/** The innovation with the panel's word on it (module VI); null when unknown or hidden by ROPS. */
async function shownInnovation(id: string): Promise<{ item: Innovation; verified: boolean } | null> {
  const record = getInnovation(id);
  if (!record) return null;
  const override = await repository().getInnovationOverride(record.id);
  const item = overlayInnovation(record, override);
  return item && { item, verified: override?.status === "zweryfikowane" };
}

export async function generateMetadata({ params }: PageProps<"/innovation/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: (await shownInnovation(id))?.item.title ?? t("notFound.meta.title") };
}

function materialFormat(material: Material): string {
  const extension = material.url.split("?")[0].split(".").pop()?.toUpperCase() ?? "";
  return material.type === "video" ? t("materials.video", { format: extension }) : t("knowledge.file", { format: extension });
}

const sectionTitle = "text-[1.3rem] font-bold @3xl:text-[1.45rem]";

function Header({ item, routeId, verified }: { item: Innovation; routeId: string | undefined; verified: boolean }) {
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
        {verified && <p className="rounded-sm border-2 border-foreground px-2 text-[0.9rem] font-bold">{t("admin.verifiedBadge")}</p>}
      </div>
      <h1 id="naglowek-innowacji" tabIndex={-1} className="text-[1.75rem] leading-tight font-bold @3xl:text-[2.2rem]">
        {item.title}
      </h1>
      {item.organisation && <p className="text-[1.1rem]">{item.organisation}</p>}
    </header>
  );
}

/** Module IV, "Tester innowacji": the numbers of the innovation's evaluations and the way to add one. */
function Evaluations({ item, summary }: { item: Innovation; summary: EvaluationSummary }) {
  const empty = summary.ratings === 0 && summary.testers === 0 && summary.improvements === 0;
  return (
    <section aria-labelledby="opinie" className="grid gap-3">
      <h2 id="opinie" className={sectionTitle}>
        {t("tester.section.title")}
      </h2>
      {empty ? (
        <p>{t("tester.section.empty")}</p>
      ) : (
        <dl className="grid gap-x-6 gap-y-2 @xl:grid-cols-[max-content_minmax(0,1fr)]">
          {summary.average !== null && (
            <>
              <dt className="font-bold">{t("tester.section.average")}</dt>
              <dd>
                {t("tester.section.averageValue", {
                  average: summary.average.toLocaleString("pl-PL", { maximumFractionDigits: 1 }),
                  count: summary.ratings,
                  unit: pluralPl(summary.ratings, {
                    one: t("tester.section.unit.one"),
                    few: t("tester.section.unit.few"),
                    many: t("tester.section.unit.many"),
                  }),
                })}
              </dd>
            </>
          )}
          <dt className="font-bold">{t("tester.section.testers")}</dt>
          <dd>{summary.testers}</dd>
          <dt className="font-bold">{t("tester.section.improvements")}</dt>
          <dd>{summary.improvements}</dd>
        </dl>
      )}
      <p className="text-muted-foreground">{t("tester.section.note")}</p>
      <div className="no-print">
        <Link href={`/innowacja/${item.id}/testuj`} className={buttonVariants({ variant: "secondary" })}>
          {t("tester.section.cta")}
        </Link>
      </div>
    </section>
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
  const shown = await shownInnovation(id);
  if (!shown) notFound();
  const { item, verified } = shown;
  const routeId = typeof query.droga === "string" && (await getRoute(query.droga)) ? query.droga : undefined;
  const summary = await evaluationSummary(item.id);

  return (
    <article aria-labelledby="naglowek-innowacji" className="grid max-w-[48rem] gap-8">
      <FocusOnMount targetId="naglowek-innowacji" />
      <Header item={item} routeId={routeId} verified={verified} />

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

      <section aria-labelledby="dostosuj" className="no-print grid gap-3 rounded-lg border-2 border-primary p-5">
        <h2 id="dostosuj" className={sectionTitle}>
          {t("adapt.cta.title")}
        </h2>
        <p>{t("adapt.cta.text")}</p>
        <div>
          <Link href={`/innowacja/${item.id}/dostosuj`} className={buttonVariants()}>
            {t("adapt.cta.title")}
          </Link>
        </div>
      </section>

      <Evaluations item={item} summary={summary} />

      <div className="no-print flex flex-wrap gap-3">
        <Link
          href={routeId ? `/kontakt?innowacja=${item.id}&droga=${routeId}` : `/kontakt?innowacja=${item.id}`}
          className={buttonVariants()}
        >
          {t("s2.card.contact")}
        </Link>
        <Link href={`/zapytaj?innowacja=${item.id}&temat=mentor`} className={buttonVariants({ variant: "secondary" })}>
          {t("talk.askExpert")}
        </Link>
        {MAP_ENABLED && (
          <Link href={`/mapa?innowacja=${item.id}`} className={buttonVariants({ variant: "secondary" })}>
            {t("s5.whereNeeded")}
          </Link>
        )}
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
