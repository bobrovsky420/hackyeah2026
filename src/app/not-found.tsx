import Link from "next/link";
import { InfoPage } from "@/components/info/info-page";
import { t } from "@/lib/i18n";

export default function NotFound() {
  return (
    <InfoPage title={t("notFound.title")} lead={t("notFound.lead")}>
      <p>
        <Link href="/">{t("forms.backToStart")}</Link>
      </p>
    </InfoPage>
  );
}
