import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/info/info-page";
import { Notice } from "@/components/ui/notice";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("map.meta.title") };

/** S4 is not part of this prototype yet. */
export default function MapPage() {
  return (
    <InfoPage title={t("map.title")} lead={t("map.lead")}>
      <Notice title={t("map.notYet.title")}>
        <p>{t("map.notYet.text")}</p>
      </Notice>
      <p>
        <Link href="/">{t("forms.backToStart")}</Link>
      </p>
    </InfoPage>
  );
}
