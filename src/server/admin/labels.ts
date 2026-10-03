import type { IdeaStatus, NeedStatus, Route } from "@/lib/contracts";
import { t, type MessageKey } from "@/lib/i18n";

/* The panel's status codes (module VI) as interface strings; the idea's status is also read by its author. */

const ideaStatusKeys = {
  nowy: "idea.status.nowy",
  "w-analizie": "idea.status.w-analizie",
  przyjety: "idea.status.przyjety",
  zamkniety: "idea.status.zamkniety",
} as const satisfies Record<IdeaStatus, MessageKey>;

export const ideaStatusCodes = Object.keys(ideaStatusKeys) as IdeaStatus[];

export function ideaStatusLabel(code: IdeaStatus): string {
  return t(ideaStatusKeys[code]);
}

const routeModeKeys = {
  route: "admin.trends.mode.route",
  partial: "admin.trends.mode.partial",
  none: "admin.trends.mode.none",
  redirected: "admin.trends.mode.redirected",
  declined: "admin.trends.mode.declined",
  off_topic: "admin.trends.mode.off_topic",
} as const satisfies Record<Route["mode"], MessageKey>;

/** The result of a route (8.4 `mode`); an unknown code is shown as it is. */
export function routeModeLabel(code: string): string {
  return code in routeModeKeys ? t(routeModeKeys[code as Route["mode"]]) : code;
}

const needStatusKeys = {
  nowa: "admin.needStatus.nowa",
  "w-analizie": "admin.needStatus.w-analizie",
  "dopasowano-pozniej": "admin.needStatus.dopasowano-pozniej",
  "temat-naboru": "admin.needStatus.temat-naboru",
  zamknieta: "admin.needStatus.zamknieta",
} as const satisfies Record<NeedStatus, MessageKey>;

export const needStatusCodes = Object.keys(needStatusKeys) as NeedStatus[];

export function needStatusLabel(code: NeedStatus): string {
  return t(needStatusKeys[code]);
}

const contactStatusKeys = {
  nowe: "admin.contactStatus.nowe",
  przekazane: "admin.contactStatus.przekazane",
  zamkniete: "admin.contactStatus.zamkniete",
} as const;

export const contactStatusCodes = Object.keys(contactStatusKeys) as (keyof typeof contactStatusKeys)[];

export function contactStatusLabel(code: keyof typeof contactStatusKeys): string {
  return t(contactStatusKeys[code]);
}
