import type {
  ContactStatus,
  ModerationLogEntry,
  ModerationStatus,
  NeedStatus,
  ReportReason,
  VerificationStatus,
} from "@/lib/contracts/records";
import { t, type MessageKey } from "@/lib/i18n";

/* Shared lists of the ROPS console (S7): statuses and the fixed reasons of FR-12.8. */

export const rejectReasons = {
  "dane-osobowe": "console.reason.daneOsobowe",
  obrazliwe: "console.reason.obrazliwe",
  spam: "console.reason.spam",
  "poza-zakresem": "console.reason.pozaZakresem",
  inne: "console.reason.inne",
} as const satisfies Record<string, MessageKey>;

export type RejectReason = keyof typeof rejectReasons;

export const needStatuses = {
  nowa: "console.status.need.nowa",
  "w-analizie": "console.status.need.wAnalizie",
  "dopasowano-pozniej": "console.status.need.dopasowanoPozniej",
  "temat-naboru": "console.status.need.tematNaboru",
  zamknieta: "console.status.need.zamknieta",
} as const satisfies Record<NeedStatus, MessageKey>;

export const contactStatuses = {
  nowe: "console.status.contact.nowe",
  przekazane: "console.status.contact.przekazane",
  zamkniete: "console.status.contact.zamkniete",
} as const satisfies Record<ContactStatus, MessageKey>;

export const verificationStatuses = {
  niezweryfikowane: "console.status.verification.niezweryfikowane",
  zweryfikowane: "console.status.verification.zweryfikowane",
  odrzucone: "console.status.verification.odrzucone",
} as const satisfies Record<VerificationStatus, MessageKey>;

export const moderationStatuses = {
  "do-weryfikacji": "console.status.moderation.doWeryfikacji",
  zatwierdzone: "console.status.moderation.zatwierdzone",
  odrzucone: "console.status.moderation.odrzucone",
} as const satisfies Record<ModerationStatus, MessageKey>;

export function isOneOf<T extends string>(options: Record<T, unknown>, value: string): value is T {
  return Object.hasOwn(options, value);
}

type TargetType = ModerationLogEntry["target_type"];

const targetKeys = {
  need: "console.log.target.need",
  contact: "console.log.target.contact",
  readiness: "console.log.target.readiness",
  declined: "console.log.target.declined",
  report: "console.log.target.report",
} as const satisfies Record<TargetType, MessageKey>;

/** The content report reasons of FR-12.9 (8.11). */
export const reportReasons = {
  nieprawdziwe: "report.reason.nieprawdziwe",
  obrazliwe: "report.reason.obrazliwe",
  dane_osobowe: "report.reason.daneOsobowe",
  inne: "report.reason.inne",
} as const satisfies Record<ReportReason, MessageKey>;

const statusLists: Record<Exclude<TargetType, "declined" | "report">, Record<string, MessageKey>> = {
  need: needStatuses,
  contact: contactStatuses,
  readiness: verificationStatuses,
};

const actionKeys = {
  zatwierdzone: "console.log.action.zatwierdzone",
  odrzucone: "console.log.action.odrzucone",
  zweryfikowane: "console.log.action.zweryfikowane",
  przejrzane: "console.log.action.przejrzane",
} as const satisfies Record<Exclude<ModerationLogEntry["action"], "status">, MessageKey>;

export function targetLabel(type: TargetType): string {
  return t(targetKeys[type]);
}

/** "Zatwierdzono", or "Status: Przekazana" for a change of status. */
export function logActionLabel(entry: ModerationLogEntry): string {
  if (entry.action !== "status") return t(actionKeys[entry.action]);
  const list = entry.target_type === "declined" || entry.target_type === "report" ? {} : statusLists[entry.target_type];
  const key = entry.status && isOneOf(list, entry.status) ? list[entry.status] : undefined;
  return t("console.log.action.status", { status: key ? t(key) : (entry.status ?? "") });
}
