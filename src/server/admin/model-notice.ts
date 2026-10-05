import { formatDateTime } from "@/lib/dates";
import { t } from "@/lib/i18n";
import type { LlmHealth } from "@/lib/llm";

/**
 * The panel's warning about the language model (decision A.14): while the
 * first configured provider fails, since when and why, in words; with no
 * model configured on a live server, that. Nothing while it answers, before
 * its first note, or on the recording alone (the demo laptop, the tests).
 */
export function modelNotice(health: LlmHealth): { title: string; text: string } | null {
  if (health.status === "unconfigured") return { title: t("admin.llm.unconfigured.title"), text: t("admin.llm.unconfigured.text") };
  if (health.status !== "degraded") return null;
  const status = health.httpStatus;
  const reason =
    status === 401 || status === 403
      ? t("admin.llm.reason.key", { status })
      : status === 429
        ? t("admin.llm.reason.limit")
        : status
          ? t("admin.llm.reason.status", { status })
          : health.kind === "timeout"
            ? t("admin.llm.reason.timeout")
            : t("admin.llm.reason.unavailable");
  return {
    title: t("admin.llm.degraded.title"),
    text: t("admin.llm.degraded.text", { since: health.since ? formatDateTime(health.since) : "", model: health.model ?? health.provider ?? "", reason }),
  };
}
