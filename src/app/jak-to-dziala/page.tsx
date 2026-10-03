import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage, InfoSection } from "@/components/info/info-page";
import { t, type MessageKey } from "@/lib/i18n";

export const metadata: Metadata = { title: t("how.meta.title") };

const steps: MessageKey[] = ["s1.how.step1", "s1.how.step2", "s1.how.step3"];

/** S8: "Jak to działa" (FR-11.1). */
export default function HowItWorksPage() {
  return (
    <InfoPage title={t("how.title")} lead={t("how.lead")}>
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
    </InfoPage>
  );
}
