import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { ropsDepartment } from "@/lib/catalogue";
import type { Route } from "@/lib/contracts/route";
import { FocusOnMount } from "./focus-on-mount";

const headingClass = "text-[1.75rem] leading-tight font-bold @3xl:text-[2.2rem]";

/**
 * S11: a harmful request is declined with respect; the text is not shown
 * back. The mild declined of FR-12.12 (the model refused after the gate
 * passed the text) carries its own sentence as the mode reason, which
 * replaces the principle: nothing in the text was judged harmful.
 */
export function DeclinedView({ route }: { route: Route }) {
  return (
    <div className="grid max-w-[40rem] gap-5 text-[1.1rem]">
      <FocusOnMount targetId="naglowek-drogi" />
      <h1 id="naglowek-drogi" tabIndex={-1} className={headingClass}>
        {t("s11.title")}
      </h1>
      {route.mode_reason_pl ? (
        <p>{route.mode_reason_pl}</p>
      ) : (
        <>
          <p>{t("s11.text1")}</p>
          <p>{t("s11.text2")}</p>
        </>
      )}
      <p>
        {t("s11.code")} <span className="font-mono font-bold">{route.reference_code}</span>
      </p>
      <p>
        {t("s11.appeal.before")} <a href={`mailto:${ropsDepartment().email}`}>{ropsDepartment().email}</a>{" "}
        {t("s11.appeal.after")}
      </p>
      <p>
        <Link href="/zasady">{t("s11.rules")}</Link>
      </p>
    </div>
  );
}

/** S11, off-topic variant: a plain explanation of what the tool is for. */
export function OffTopicView() {
  return (
    <div className="grid max-w-[40rem] gap-5 text-[1.1rem]">
      <FocusOnMount targetId="naglowek-drogi" />
      <h1 id="naglowek-drogi" tabIndex={-1} className={headingClass}>
        {t("s11.offTopic.title")}
      </h1>
      <p>{t("s11.offTopic.text1")}</p>
      <p>{t("s11.offTopic.text2")}</p>
      <div>
        <Link href="/" className={buttonVariants()}>
          {t("s11.offTopic.back")}
        </Link>
      </div>
    </div>
  );
}
