import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ReportLink } from "@/components/report/report-link";
import { buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { Channel, Route, SensitiveTopic } from "@/lib/contracts";
import { t, type MessageKey } from "@/lib/i18n";
import { knowledgeTypeLabel, roleLabel, targetGroupLabel, telHref } from "@/lib/labels";
import { allPaths, getInnovation } from "@/lib/catalogue";
import { placeText, placeWhere } from "@/lib/places";
import { pluralPl } from "@/lib/text";
import { cn } from "@/lib/utils";
import { ClarificationForm } from "./clarification-form";
import { CrisisBanner } from "./crisis-banner";
import { FocusOnMount } from "./focus-on-mount";
import { PathChooser } from "./path-chooser";
import { QuickExit } from "./quick-exit";
import { RecomputeButton } from "./recompute-button";
import { RouteActions } from "./route-actions";
import type { SimilarCases } from "@/server/match/similar-cases";
import { SimilarCasesBlock } from "./similar-cases";
import { SolutionCard } from "./solution-card";

/** Topics whose routes get the quick exit of FR-12.5. */
const exitTopics: SensitiveTopic[] = ["violence", "child_abuse", "sexual_violence"];

/** Characters above which the page heading (a full need summary) is set in a smaller size. */
const longTitle = 80;

const channelLabels: Record<Channel["type"], MessageKey> = {
  www: "people.channel.website",
  email: "people.channel.email",
  phone: "people.channel.phone",
};

function channelHref(channel: Channel): string {
  if (channel.type === "email") return `mailto:${channel.value}`;
  if (channel.type === "phone") return telHref(channel.value);
  return channel.value;
}

function Block({ id, title, lead, children }: { id: string; title: string; lead: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-4 border-t border-border pt-8">
      <div className="grid gap-1">
        <h2 id={id} className="text-[1.4rem] font-bold @3xl:text-[1.6rem]">
          {title}
        </h2>
        <p className="text-muted-foreground">{lead}</p>
      </div>
      {children}
    </section>
  );
}

function Channels({ channels }: { channels: Channel[] }) {
  if (channels.length === 0) return null;
  return (
    <dl className="grid gap-x-3 @xl:grid-cols-[max-content_minmax(0,1fr)]">
      {channels.map((channel) => (
        <div key={channel.value} className="contents">
          <dt className="text-muted-foreground">{t(channelLabels[channel.type])}</dt>
          <dd>
            <a href={channelHref(channel)}>{channel.type === "www" ? new URL(channel.value).hostname : channel.value}</a>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** "Ludzie" (FR-4.4): innovators, implementers nearby, the ROPS advisor and readiness. */
function People({ route }: { route: Route }) {
  const { innovators, implementers_nearby: nearby, advisor, readiness } = route.people;
  const rowClass = "grid gap-1.5 border-b border-border pb-5 last:border-b-0 last:pb-0";
  const where = placeWhere(route.input.place_terc);
  return (
    <div className="grid gap-5">
      {innovators.map((person) => (
        <div key={person.organisation} className={rowClass}>
          <h3 className="text-[1.15rem] font-bold">{person.organisation}</h3>
          <p>{t("people.innovator", { title: getInnovation(person.innovation_id)?.title ?? "" })}</p>
          <Channels channels={person.channels} />
          <div className="no-print pt-1">
            <Link
              href={`/kontakt?innowacja=${person.innovation_id}&droga=${route.id}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              {t("s2.card.contact")}
            </Link>
          </div>
        </div>
      ))}
      {nearby.map((implementer) => (
        <div key={`${implementer.organisation}-${implementer.innovation_id}`} className={rowClass}>
          <h3 className="text-[1.15rem] font-bold">{implementer.organisation}</h3>
          <p>
            {t("people.nearby", {
              title: getInnovation(implementer.innovation_id)?.title ?? "",
              place: implementer.place_name,
              km: implementer.distance_km,
            })}
          </p>
        </div>
      ))}
      <div className={rowClass}>
        <h3 className="text-[1.15rem] font-bold">{advisor.name ?? advisor.role}</h3>
        <p>{t("people.advisor", { category: targetGroupLabel(advisor.category) })}</p>
        <Channels
          channels={[
            { type: "email", value: advisor.email },
            { type: "phone", value: advisor.phone },
          ]}
        />
      </div>
      <p>
        {readiness.count === 0
          ? t("people.readiness.none", { where })
          : t("people.readiness.count", { count: readiness.count, where })}{" "}
        <Link href="/chce-pomoc">{t("people.readiness.cta")}</Link>
      </p>
    </div>
  );
}

/** S2 (mode route) and S3 (modes partial and none) of section 10. */
export function RouteView({ route, markdown, similar }: { route: Route; markdown: string; similar?: SimilarCases }) {
  const isRoute = route.mode === "route";
  const title = isRoute ? (route.need_summary_pl ?? t("s2.title.fallback")) : t(route.mode === "partial" ? "s3.title.partial" : "s3.title.none");
  const { sensitive_topics: topics, redactions } = route.screening;
  const hasPlace = route.input.place_terc !== null;

  return (
    <div className="grid gap-10 @4xl:grid-cols-[minmax(0,1fr)_18rem] @4xl:items-start @4xl:gap-12">
      <FocusOnMount targetId="naglowek-drogi" />
      <div className="grid min-w-0 gap-8">
        {topics.some((topic) => exitTopics.includes(topic)) && <QuickExit />}
        <header className="grid gap-3">
          <Link href="/" className="no-print inline-flex min-h-11 items-center gap-2 justify-self-start font-bold">
            <ArrowLeft aria-hidden className="size-5" />
            {t("route.changeText")}
          </Link>
          <p className="font-bold text-muted-foreground">{t("route.eyebrow")}</p>
          <h1
            id="naglowek-drogi"
            tabIndex={-1}
            className={cn(
              "font-bold",
              title.length > longTitle
                ? "max-w-[50rem] text-[1.3rem] leading-snug @3xl:text-[1.55rem]"
                : "text-[1.75rem] leading-tight @3xl:text-[2.2rem]",
            )}
          >
            {title}
          </h1>
          {!isRoute && route.need_summary_pl && (
            <p className="text-[1.1rem]">
              <span className="font-bold">{t("route.need")}</span> {route.need_summary_pl}
            </p>
          )}
          {!isRoute && route.mode_reason_pl && <p>{route.mode_reason_pl}</p>}
          <dl className="flex flex-wrap gap-x-6 gap-y-1">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">{t("route.meta.place")}</dt>
              <dd className="font-bold">{placeText(route.input.place_terc)}</dd>
            </div>
            {route.input.role && (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">{t("route.meta.role")}</dt>
                <dd className="font-bold">{roleLabel(route.input.role)}</dd>
              </div>
            )}
          </dl>
        </header>

        {route.screening.crisis_banner && <CrisisBanner topics={topics} />}

        {/* E.4: a person writing about their own matter gets the route, and where individual matters go. */}
        {route.screening.category === "individual_case" && (
          <Notice title={t("route.individual.title")}>
            <p>
              {t("route.individual.text")}{" "}
              {route.input.place_name ? t("route.individual.ops.place", { place: route.input.place_name }) : t("route.individual.ops.generic")}
            </p>
            <p className="no-print">
              <Link href="/zapytaj">{t("route.individual.ask")}</Link>
            </p>
          </Notice>
        )}

        {redactions > 0 && (
          <Notice title={t("route.redacted.title")}>
            <p>
              {t("route.redacted.text", {
                count: redactions,
                unit: pluralPl(redactions, {
                  one: t("route.redacted.unit.one"),
                  few: t("route.redacted.unit.few"),
                  many: t("route.redacted.unit.many"),
                }),
              })}
            </p>
          </Notice>
        )}

        {!isRoute && route.clarification_needed && route.input.problem_text && <ClarificationForm routeId={route.id} />}

        <Notice title={t(isRoute ? "route.generated.title" : "route.generated.titlePartial")}>
          {route.summary_pl && <p>{route.summary_pl}</p>}
          <p className="text-[0.95rem] text-muted-foreground">{route.label_pl}</p>
        </Notice>

        {route.solutions.length > 0 && (
          <Block
            id="rozwiazania"
            title={t(isRoute ? "s2.block.solutions.title" : "s3.block.nearest.title")}
            lead={t(isRoute ? "s2.block.solutions.lead" : "s3.block.nearest.lead")}
          >
            <div className="grid gap-4">
              {route.solutions.map((solution) => (
                <SolutionCard
                  key={solution.innovation_id}
                  solution={solution}
                  routeId={route.id}
                  partial={!isRoute}
                  hasPlace={hasPlace}
                />
              ))}
            </div>
          </Block>
        )}

        {similar && <SimilarCasesBlock cases={similar} routeId={route.id} />}

        {!isRoute && (
          <section aria-labelledby="bank-potrzeb" className="grid gap-3 rounded-lg border-2 border-primary bg-accent p-5">
            <h2 id="bank-potrzeb" className="text-[1.3rem] font-bold">
              {t("s3.bank.title")}
            </h2>
            <p>{t("s3.bank.text")}</p>
            <div className="no-print">
              <Link href={`/zapisz-potrzebe?droga=${route.id}`} className={buttonVariants()}>
                {t("s3.bank.cta")}
              </Link>
            </div>
          </section>
        )}

        {isRoute && route.knowledge.length > 0 && (
          <Block id="wiedza" title={t("s2.block.knowledge.title")} lead={t("s2.block.knowledge.lead")}>
            <ul className="grid list-disc gap-2 pl-6">
              {route.knowledge.map((item) => (
                <li key={item.url}>
                  {(item.for_innovation_id && getInnovation(item.for_innovation_id)?.title) || t("knowledge.general")}:{" "}
                  <a href={item.url}>{item.title}</a>, {knowledgeTypeLabel(item.type)}
                </li>
              ))}
            </ul>
          </Block>
        )}

        <Block id="ludzie" title={t("s2.block.people.title")} lead={t("s2.block.people.lead")}>
          <People route={route} />
        </Block>

        <Block
          id="sciezka"
          title={t("s2.block.paths.title")}
          lead={t(isRoute ? "s2.block.paths.lead" : "s3.block.paths.lead")}
        >
          <PathChooser route={route.path} paths={allPaths()} />
        </Block>

        <ReportLink target={{ droga: route.id }} />
      </div>

      <aside aria-label={t("route.aside.label")} className="grid gap-5">
        <section aria-labelledby="nastepne-kroki" className="grid gap-3 rounded-lg border border-border bg-muted p-4">
          <h2 id="nastepne-kroki" className="text-[1.2rem] font-bold">
            {t("s2.next.title")}
          </h2>
          <ol className="grid list-decimal gap-2 pl-6">
            {route.next_steps.map((step) => (
              <li key={step.text_pl}>
                {step.link.startsWith("/") ? <Link href={step.link}>{step.text_pl}</Link> : <a href={step.link}>{step.text_pl}</a>}
              </li>
            ))}
          </ol>
        </section>
        {route.unknowns_pl.length > 0 && (
          <section aria-labelledby="czego-nie-wiemy" className="grid gap-3 rounded-lg border border-border bg-muted p-4">
            <h2 id="czego-nie-wiemy" className="text-[1.2rem] font-bold">
              {t("s2.unknowns.title")}
            </h2>
            <ul className="grid list-disc gap-2 pl-6">
              {route.unknowns_pl.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}
        <RouteActions routeId={route.id} markdown={markdown} />
        {route.input.problem_text && <RecomputeButton routeId={route.id} />}
      </aside>
    </div>
  );
}
