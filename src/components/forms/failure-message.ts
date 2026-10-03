import { t } from "@/lib/i18n";

/**
 * What a public form shows when the server did not accept it (S9): the
 * Polish `message` of a 429 (the limits of FR-12.14) or a 503 (the kill
 * switch PUBLIC_WRITES=false), the matching text when the gate stopped the
 * text (`{error: "screened", outcome}`), and null for anything else, which
 * keeps the generic notice.
 */
export function failureMessage(status: number, body: unknown): string | null {
  const answer = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  if ((status === 429 || status === 503) && typeof answer.message === "string" && answer.message.trim()) {
    return answer.message.trim();
  }
  if (answer.error === "screened") {
    if (answer.outcome === "declined") return t("forms.screened.declined");
    if (answer.outcome === "off_topic") return t("forms.screened.offTopic");
  }
  return null;
}
