import type { ReportReason } from "@/lib/contracts";
import type { MessageKey } from "@/lib/i18n";

/* The content report of FR-12.9 (8.11): its fixed reasons, shared by the form and the handler. */

export const reportReasons = {
  nieprawdziwe: "report.reason.nieprawdziwe",
  obrazliwe: "report.reason.obrazliwe",
  dane_osobowe: "report.reason.daneOsobowe",
  inne: "report.reason.inne",
} as const satisfies Record<ReportReason, MessageKey>;

export function isOneOf<T extends string>(options: Record<T, unknown>, value: string): value is T {
  return Object.hasOwn(options, value);
}
