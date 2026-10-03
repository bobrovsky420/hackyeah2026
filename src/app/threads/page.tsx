import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/info/info-page";
import { MyThreads } from "@/components/talk/my-threads";
import { buttonVariants } from "@/components/ui/button";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("talk.mine.title"), robots: { index: false, follow: false } };

/** Module V: "Moje rozmowy", the private links this browser remembers. */
export default function MyThreadsPage() {
  return (
    <InfoPage title={t("talk.mine.title")} lead={t("talk.mine.lead")}>
      <MyThreads />
      <div>
        <Link href="/zapytaj" className={buttonVariants()}>
          {t("talk.mine.new")}
        </Link>
      </div>
    </InfoPage>
  );
}
