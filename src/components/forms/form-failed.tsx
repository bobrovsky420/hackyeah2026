import type { Ref } from "react";
import { Notice } from "@/components/ui/notice";
import { t } from "@/lib/i18n";

/**
 * Shown above a form when the server did not accept it; the form stays
 * filled. `message` is the server's reason (see failure-message.ts), shown
 * instead of the generic advice to try again.
 */
export function FormFailed({ ref, message }: { ref?: Ref<HTMLDivElement>; message?: string | null }) {
  return (
    <div ref={ref} tabIndex={-1}>
      <Notice tone="error" title={t("forms.failed.title")} titleAs="h2">
        <p>{message || t("forms.failed.text")}</p>
      </Notice>
    </div>
  );
}
