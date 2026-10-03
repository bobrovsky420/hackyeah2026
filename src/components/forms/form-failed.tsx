import type { Ref } from "react";
import { Notice } from "@/components/ui/notice";
import { t } from "@/lib/i18n";

/** Shown above a form when the server did not accept it; the form stays filled. */
export function FormFailed({ ref }: { ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} tabIndex={-1}>
      <Notice tone="error" title={t("forms.failed.title")} titleAs="h2">
        <p>{t("forms.failed.text")}</p>
      </Notice>
    </div>
  );
}
