import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage, InfoSection } from "@/components/info/info-page";
import { MAP_ENABLED } from "@/lib/features";
import { t } from "@/lib/i18n";
import { ropsDepartment } from "@/lib/catalogue";

export const metadata: Metadata = { title: t("a11y.meta.title") };

/*
 * Dates in the format the gov.pl template requires (rrrr-mm-dd). Publication
 * and update are the prototype's own; set them again on the first public
 * deployment.
 */
const PUBLISHED = "2026-10-03";
const UPDATED = "2026-10-03";
const PREPARED = "2026-10-03";

/**
 * S8: "Deklaracja dostępności" (FR-11.4) in the structure of the gov.pl
 * template, with its a11y-* identifiers, and an honest status.
 */
export default function AccessibilityStatementPage() {
  return (
    <InfoPage
      title={t("a11y.title")}
      headingId="a11y-deklaracja"
      leadId="a11y-wstep"
      lead={
        <>
          <span id="a11y-podmiot">{t("a11y.intro.entity")}</span> {t("a11y.intro.commits")}{" "}
          <Link id="a11y-url" href="/">
            {t("a11y.intro.site")}
          </Link>
          .
        </>
      }
    >
      <ul className="grid list-disc gap-1 pl-6">
        <li>
          {t("a11y.dates.published")} <span id="a11y-data-publikacja">{PUBLISHED}</span>
        </li>
        <li>
          {t("a11y.dates.updated")} <span id="a11y-data-aktualizacja">{UPDATED}</span>
        </li>
      </ul>

      <InfoSection id="stan" title={t("a11y.status.title")}>
        <p id="a11y-status">{t("a11y.status.text")}</p>
        <ul className="grid list-disc gap-2 pl-6">
          {MAP_ENABLED && <li>{t("a11y.status.issue.map")}</li>}
          <li>{t("a11y.status.issue.files")}</li>
          <li>{t("a11y.status.issue.audit")}</li>
        </ul>
      </InfoSection>

      <InfoSection id="przygotowanie" title={t("a11y.prepared.title")}>
        <ul className="grid list-disc gap-2 pl-6">
          <li>
            {t("a11y.prepared.date")} <span id="a11y-data-sporzadzenie">{PREPARED}</span>
          </li>
          <li>{t("a11y.prepared.method")}</li>
        </ul>
      </InfoSection>

      <InfoSection id="ulatwienia" title={t("a11y.features.title")}>
        <ul className="grid list-disc gap-2 pl-6">
          <li>{t("a11y.features.size")}</li>
          <li>{t("a11y.features.contrast")}</li>
          <li>{t("a11y.features.keyboard")}</li>
          <li>{t("a11y.features.device")}</li>
        </ul>
      </InfoSection>

      <InfoSection id="a11y-kontakt" title={t("a11y.contact.title")}>
        <ul className="grid list-disc gap-2 pl-6">
          <li>
            {t("a11y.contact.person")} <span id="a11y-osoba">{ropsDepartment().name}</span>
          </li>
          <li>
            {t("a11y.contact.email")}{" "}
            <a id="a11y-email" href={`mailto:${ropsDepartment().email}`}>
              {ropsDepartment().email}
            </a>
          </li>
          <li>
            {t("a11y.contact.phone")} <span id="a11y-telefon">{ropsDepartment().phone}</span>
          </li>
        </ul>
        <p>{t("a11y.contact.rights")}</p>
        <p>{t("a11y.contact.request")}</p>
      </InfoSection>

      <InfoSection id="a11y-procedura" title={t("a11y.procedure.title")}>
        <p>{t("a11y.procedure.p1")}</p>
        <p>{t("a11y.procedure.p2")}</p>
        <p>{t("a11y.procedure.p3")}</p>
        <p>
          {t("a11y.procedure.p4")} <a href="https://bip.brpo.gov.pl/">{t("a11y.procedure.rpo")}</a>.
        </p>
      </InfoSection>

      <InfoSection id="a11y-architektura" title={t("a11y.architecture.title")}>
        <p>{t("a11y.architecture.text")}</p>
      </InfoSection>

      <InfoSection id="a11y-aplikacje" title={t("a11y.apps.title")}>
        <p>{t("a11y.apps.text")}</p>
      </InfoSection>
    </InfoPage>
  );
}
