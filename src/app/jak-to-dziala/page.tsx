import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { InfoPage, InfoSection } from "@/components/info/info-page";
import { t, type MessageKey } from "@/lib/i18n";
import { ropsDepartment } from "@/lib/mock/contacts";

export const metadata: Metadata = { title: t("how.meta.title") };

const steps: MessageKey[] = ["s1.how.step1", "s1.how.step2", "s1.how.step3"];

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
        {t("how.card.operator.text")} <a href={`mailto:${ropsDepartment.email}`}>{ropsDepartment.email}</a>.
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
    ["how.card.data.term", t("how.card.data.text")],
    ["how.card.review.term", t("how.card.review.text")],
    ["how.card.limits.term", t("how.card.limits.text")],
    ["how.card.evaluation.term", t("how.card.evaluation.text")],
  ];
}

/** S8: "Jak to działa" (FR-11.1) with the "Karta systemu" (FR-11.7). */
export default function HowItWorksPage() {
  return (
    <InfoPage title={t("how.title")} lead={t("how.lead")} draft>
      <InfoSection id="kroki" title={t("s1.how.title")}>
        <ol className="grid list-decimal gap-2 pl-6">
          {steps.map((step) => (
            <li key={step}>{t(step)}</li>
          ))}
        </ol>
      </InfoSection>
      <InfoSection id="skad" title={t("how.sources.title")}>
        <p>{t("how.sources.p1")}</p>
        <p>{t("how.sources.p2")}</p>
      </InfoSection>
      <InfoSection id="program" title={t("how.machine.title")}>
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
