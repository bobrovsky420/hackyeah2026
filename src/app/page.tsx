import type { Metadata } from "next";
import { IntakeForm } from "@/components/intake/intake-form";
import { t, type MessageKey } from "@/lib/i18n";

export const metadata: Metadata = { title: t("s1.meta.title") };

const howSteps: MessageKey[] = ["s1.how.step1", "s1.how.step2", "s1.how.step3"];

/** S1: get the need in (specification, section 10). */
export default function StartPage() {
  return (
    <IntakeForm>
      <section aria-labelledby="jak-to-dziala" className="grid gap-5">
        <h2 id="jak-to-dziala" className="text-[1.4rem] font-bold @3xl:text-[1.6rem]">
          {t("s1.how.title")}
        </h2>
        <ol className="grid gap-5 @3xl:grid-cols-3">
          {howSteps.map((step, index) => (
            <li key={step} className="flex items-start gap-3">
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-content-center rounded-full border-2 border-primary font-bold text-primary"
              >
                {index + 1}
              </span>
              <span className="pt-1">{t(step)}</span>
            </li>
          ))}
        </ol>
      </section>
      <p className="max-w-[40rem] text-muted-foreground">
        {t("s1.sources.before")} <a href="https://innowacjespoleczne.pl/">{t("source.name.national")}</a>{" "}
        {t("common.and")}{" "}
        <a href="https://rops.krakow.pl/innowacje-spoleczne/biblioteka-innowacji-spolecznych">{t("source.name.rops")}</a>.
      </p>
    </IntakeForm>
  );
}
