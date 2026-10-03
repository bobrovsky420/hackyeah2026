import type { MessageKey } from "@/lib/i18n";

/** The fixed reasons of a rejection in the panel (FR-12.8), each with its label. */
export const REJECT_REASONS = {
  "dane-osobowe": "admin.reason.dane-osobowe",
  "nie-na-temat": "admin.reason.nie-na-temat",
  "naruszenie-zasad": "admin.reason.naruszenie-zasad",
  duplikat: "admin.reason.duplikat",
  inne: "admin.reason.inne",
} as const satisfies Record<string, MessageKey>;

export type RejectReason = keyof typeof REJECT_REASONS;

export const rejectReasonCodes = Object.keys(REJECT_REASONS) as RejectReason[];

export function isRejectReason(value: unknown): value is RejectReason {
  return typeof value === "string" && value in REJECT_REASONS;
}
