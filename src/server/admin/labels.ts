import type { IdeaStatus, NeedStatus } from "@/lib/contracts";
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
