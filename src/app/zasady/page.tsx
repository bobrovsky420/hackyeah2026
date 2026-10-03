import type { Metadata } from "next";
import { InfoPage, InfoSection } from "@/components/info/info-page";
import { t, type MessageKey } from "@/lib/i18n";
import { ropsDepartment } from "@/lib/mock/contacts";

export const metadata: Metadata = { title: t("rules.meta.title") };

/* The ten principles of 3.6 (E1 to E10), each in two lines. */
const principles: [MessageKey, MessageKey][] = [
  ["rules.e1.name", "rules.e1.text"],
  ["rules.e2.name", "rules.e2.text"],
  ["rules.e3.name", "rules.e3.text"],
  ["rules.e4.name", "rules.e4.text"],
  ["rules.e5.name", "rules.e5.text"],
  ["rules.e6.name", "rules.e6.text"],
  ["rules.e7.name", "rules.e7.text"],
  ["rules.e8.name", "rules.e8.text"],
  ["rules.e9.name", "rules.e9.text"],
  ["rules.e10.name", "rules.e10.text"],
];

/** S12: "Zasady" (FR-11.6), linked from S11 and from "Zgłoś problem z tą treścią". */
export default function RulesPage() {
  return (
    <InfoPage title={t("rules.title")} lead={t("rules.lead")} draft>
      <ol className="grid list-decimal gap-4 pl-6">
        {principles.map(([name, text]) => (
          <li key={name}>
            <span className="font-bold">{t(name)}</span>
            <span className="block">{t(text)}</span>
          </li>
        ))}
      </ol>
      <InfoSection id="zglaszanie" title={t("rules.report.title")}>
        <p>
          {t("rules.report.text")} <a href={`mailto:${ropsDepartment.email}`}>{ropsDepartment.email}</a>.
        </p>
        <p>{t("rules.report.appeal")}</p>
      </InfoSection>
    </InfoPage>
  );
}
