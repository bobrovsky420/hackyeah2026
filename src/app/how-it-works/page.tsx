import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { InfoPage, InfoSection } from "@/components/info/info-page";
import { t, type MessageKey } from "@/lib/i18n";
import { ropsDepartment } from "@/lib/catalogue";

export const metadata: Metadata = { title: t("how.meta.title") };

/** What a person can do in the hub, one line each, with the page that starts it; testing starts on any innovation's page. */
const features: { href?: string; title: MessageKey; text: MessageKey }[] = [
  { href: "/", title: "how.do.describe.title", text: "how.do.describe.text" },
  { href: "/zglos-pomysl", title: "how.do.idea.title", text: "how.do.idea.text" },
  { title: "how.do.test.title", text: "how.do.test.text" },
  { href: "/zapytaj", title: "how.do.ask.title", text: "how.do.ask.text" },
  { href: "/partnerstwa", title: "how.do.partners.title", text: "how.do.partners.text" },
  { href: "/chce-pomoc", title: "how.do.help.title", text: "how.do.help.text" },
];

/*
 * The register card of FR-11.7, one screen, in the order of the Zurich
 * register of algorithmic systems (14.7.3).
 */
function cardEntries(): [MessageKey, ReactNode][] {
  return [
    ["how.card.purpose.term", t("how.card.purpose.text")],
    [
      "how.card.operator.term",
      <>
        {t("how.card.operator.text")} <a href={`mailto:${ropsDepartment().email}`}>{ropsDepartment().email}</a>.
      </>,
    ],
    ["how.card.basis.term", t("how.card.basis.text")],
    ["how.card.decides.term", t("how.card.decides.text")],
    [
      "how.card.logic.term",
      <ol key="logic" className="grid list-decimal gap-1 pl-6">
        <li>{t("how.card.logic.s1")}</li>
        <li>{t("how.card.logic.s2")}</li>
        <li>{t("how.card.logic.s3")}</li>
      </ol>,
    ],
    ["how.card.review.term", t("how.card.review.text")],
    ["how.card.limits.term", t("how.card.limits.text")],
  ];
}

/** S8: "Jak to działa" (FR-11.1): what a person can do, who answers, how the program works, with the "Karta systemu" (FR-11.7). */
export default function HowItWorksPage() {
  return (
    <InfoPage title={t("how.title")} lead={t("how.lead")}>
      <InfoSection id="co-mozesz" title={t("how.do.title")}>
        <ul className="grid gap-3">
          {features.map((item) => (
            <li key={item.title}>
              <span className="font-bold">{item.href ? <Link href={item.href}>{t(item.title)}</Link> : t(item.title)}.</span> {t(item.text)}
              {item.title === "how.do.ask.title" && (
                <>
                  {" "}
                  <Link href="/rozmowy">{t("how.do.ask.mine")}</Link>.
                </>
              )}
            </li>
          ))}
        </ul>
      </InfoSection>
      <InfoSection id="kto-odpowiada" title={t("how.people.title")}>
        <p>{t("how.people.p1")}</p>
        <p>{t("how.people.p2")}</p>
      </InfoSection>
      <InfoSection id="skad" title={t("how.sources.title")}>
        <p>{t("how.sources.p1")}</p>
        <p>{t("how.sources.p2")}</p>
      </InfoSection>
      <InfoSection id="program" title={t("how.machine.title")}>
        <p>{t("how.machine.p0")}</p>
        <p>{t("how.machine.p1")}</p>
        <p>{t("how.machine.p2")}</p>
        <p>{t("how.machine.p3")}</p>
        <p>
          {t("how.machine.p4")} <Link href="/zrodla">{t("shell.footer.sources")}</Link>.
        </p>
      </InfoSection>
      <InfoSection id="czego-nie-robimy" title={t("how.limits.title")}>
        <p>{t("how.limits.p1")}</p>
        <p>{t("how.limits.p2")}</p>
      </InfoSection>
      <InfoSection id="karta-systemu" title={t("how.card.title")}>
        <dl className="grid gap-x-6 gap-y-3 @2xl:grid-cols-[14rem_minmax(0,1fr)]">
          {cardEntries().map(([term, value]) => (
            <div key={term} className="contents">
              <dt className="font-bold">{t(term)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </InfoSection>
    </InfoPage>
  );
}
