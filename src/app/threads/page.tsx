import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/info/info-page";
import { MyIdeas } from "@/components/idea/my-ideas";
import { MyThreads } from "@/components/talk/my-threads";
import { buttonVariants } from "@/components/ui/button";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("talk.mine.title"), robots: { index: false, follow: false } };

/** Module V: "Moje rozmowy i zgłoszenia", the private links and the idea cards this browser remembers, with what is new. */
export default function MyThreadsPage() {
  return (
    <InfoPage title={t("talk.mine.title")} lead={t("talk.mine.lead")}>
      <section aria-labelledby="moje-rozmowy" className="grid gap-3">
        <h2 id="moje-rozmowy" className="text-[1.3rem] font-bold @3xl:text-[1.45rem]">
          {t("talk.mine.threads")}
        </h2>
        <MyThreads />
      </section>
      <MyIdeas />
      <div>
        <Link href="/zapytaj" className={buttonVariants()}>
          {t("talk.mine.new")}
        </Link>
      </div>
    </InfoPage>
  );
}
