import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { t, type MessageKey } from "@/lib/i18n";
import type { MockRoute, Person } from "@/lib/mock/types";
import { FocusOnMount } from "./focus-on-mount";
import { PathCard } from "./path-card";
import { RouteActions } from "./route-actions";
import { SolutionCard } from "./solution-card";

const channelLabels: Record<Person["channels"][number]["kind"], MessageKey> = {
  email: "people.channel.email",
  phone: "people.channel.phone",
  hours: "people.channel.hours",
  website: "people.channel.website",
};

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

function PeopleList({ route, placeWhere }: { route: MockRoute; placeWhere: string }) {
  return (
    <div className="grid gap-5">
      {route.people.map((person) => (
        <div key={person.name} className="grid gap-1.5 border-b border-border pb-5 last:border-b-0 last:pb-0">
          <h3 className="text-[1.15rem] font-bold">{person.name}</h3>
          <p>{person.role}</p>
          {person.channels.length > 0 && (
            <dl className="grid gap-x-3 @xl:grid-cols-[max-content_minmax(0,1fr)]">
              {person.channels.map((channel) => (
                <div key={channel.kind} className="contents">
                  <dt className="text-muted-foreground">{t(channelLabels[channel.kind])}</dt>
                  <dd>{channel.href ? <a href={channel.href}>{channel.value}</a> : channel.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {person.contactInnovationId && (
            <div className="no-print pt-1">
              <Link
                href={`/kontakt?innowacja=${person.contactInnovationId}&droga=${route.id}`}
                className={buttonVariants({ variant: "secondary" })}
              >
                {t("s2.card.contact")}
              </Link>
            </div>
          )}
        </div>
      ))}
      {route.readinessCount !== undefined && (
        <p>
          {route.readinessCount === 0
            ? t("people.readiness.none", { where: placeWhere })
            : t("people.readiness.count", { count: route.readinessCount, where: placeWhere })}{" "}
          <Link href="/chce-pomoc">{t("people.readiness.cta")}</Link>
        </p>
      )}
    </div>
  );
}

/** S2 (mode route) and S3 (modes partial and none) of section 10. */
export function RouteView({
  route,
  placeText,
  placeWhere,
  roleText,
  markdown,
}: {
  route: MockRoute;
  placeText: string;
  placeWhere: string;
  roleText: string | null;
  markdown: string;
}) {
  const isRoute = route.mode === "route";
  const title = isRoute ? route.needSummary : t(route.mode === "partial" ? "s3.title.partial" : "s3.title.none");

  return (
    <div className="grid gap-10 @4xl:grid-cols-[minmax(0,1fr)_18rem] @4xl:items-start @4xl:gap-12">
      <FocusOnMount targetId="naglowek-drogi" />
      <div className="grid min-w-0 gap-8">
        <header className="grid gap-3">
          <Link href="/" className="no-print inline-flex min-h-11 items-center gap-2 justify-self-start font-bold">
            <ArrowLeft aria-hidden className="size-5" />
            {t("route.changeText")}
          </Link>
          <p className="font-bold text-muted-foreground">{t("route.eyebrow")}</p>
          <h1 id="naglowek-drogi" tabIndex={-1} className="text-[1.75rem] leading-tight font-bold @3xl:text-[2.2rem]">
            {title}
          </h1>
          {!isRoute && route.needSummary && (
            <p className="text-[1.1rem]">
              <span className="font-bold">{t("route.need")}</span> {route.needSummary}
            </p>
          )}
          {!isRoute && route.modeReason && <p>{route.modeReason}</p>}
          <dl className="flex flex-wrap gap-x-6 gap-y-1">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">{t("route.meta.place")}</dt>
              <dd className="font-bold">{placeText}</dd>
            </div>
            {roleText && (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">{t("route.meta.role")}</dt>
                <dd className="font-bold">{roleText}</dd>
              </div>
            )}
          </dl>
        </header>

        <Notice title={t(isRoute ? "route.generated.title" : "route.generated.titlePartial")}>
          {route.summary && <p>{route.summary}</p>}
          <p className="text-[0.95rem] text-muted-foreground">{t("route.generated.label")}</p>
        </Notice>

        {route.solutions.length > 0 && (
          <Block
            id="rozwiazania"
            title={t(isRoute ? "s2.block.solutions.title" : "s3.block.nearest.title")}
            lead={t(isRoute ? "s2.block.solutions.lead" : "s3.block.nearest.lead")}
          >
            <div className="grid gap-4">
              {route.solutions.map((solution) => (
                <SolutionCard key={solution.innovationId} solution={solution} routeId={route.id} partial={!isRoute} />
              ))}
            </div>
          </Block>
        )}

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

        {isRoute && (
          <Block id="wiedza" title={t("s2.block.knowledge.title")} lead={t("s2.block.knowledge.lead")}>
            <ul className="grid list-disc gap-2 pl-6">
              {route.knowledge.map((item) => (
                <li key={item.url}>
                  {item.about}: <a href={item.url}>{item.title}</a>, {t("knowledge.file", { format: item.format })}
                </li>
              ))}
            </ul>
          </Block>
        )}

        <Block id="ludzie" title={t("s2.block.people.title")} lead={t("s2.block.people.lead")}>
          <PeopleList route={route} placeWhere={placeWhere} />
        </Block>

        <Block
          id="sciezka"
          title={t("s2.block.paths.title")}
          lead={t(isRoute ? "s2.block.paths.lead" : "s3.block.paths.lead")}
        >
          <div className="grid gap-4">
            {route.paths.map((path) => (
              <PathCard key={path.id} path={path} />
            ))}
          </div>
        </Block>

        <p className="no-print border-t border-border pt-6">
          <Link href="/zasady#zglaszanie">{t("route.report")}</Link>
        </p>
      </div>

      <aside aria-label={t("route.aside.label")} className="grid gap-5">
        <section aria-labelledby="nastepne-kroki" className="grid gap-3 rounded-lg border border-border bg-muted p-4">
          <h2 id="nastepne-kroki" className="text-[1.2rem] font-bold">
            {t("s2.next.title")}
          </h2>
          <ol className="grid list-decimal gap-2 pl-6">
            {route.nextSteps.map((step) => (
              <li key={step.text}>
                {step.href.startsWith("/") ? <Link href={step.href}>{step.text}</Link> : <a href={step.href}>{step.text}</a>}
              </li>
            ))}
          </ol>
        </section>
        {route.unknowns.length > 0 && (
          <section aria-labelledby="czego-nie-wiemy" className="grid gap-3 rounded-lg border border-border bg-muted p-4">
            <h2 id="czego-nie-wiemy" className="text-[1.2rem] font-bold">
              {t("s2.unknowns.title")}
            </h2>
            <ul className="grid list-disc gap-2 pl-6">
              {route.unknowns.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}
        <RouteActions routeId={route.id} markdown={markdown} />
      </aside>
    </div>
  );
}
