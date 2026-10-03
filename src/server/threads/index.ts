import type { ThreadMessage } from "@/lib/contracts";
import { getGmina } from "@/lib/catalogue";
import { getLlm } from "@/lib/llm";
import { newId, nowIso } from "@/server/ephemeral";
import { screenText } from "@/server/gate";
import type { ScreeningOutcome } from "@/lib/contracts";
import { retentionFrom } from "./access";

export * from "./access";

/*
 * The messages of module V go through the gate (7.12): the first one like
 * a contact request, the later ones as messages of an ongoing
 * conversation, never turned away as off-topic. A crisis is answered with
 * human help, a harmful text is declined, and the personal data of others
 * is removed before storage.
 */

export type Screened = { ok: true; text: string; redactions: number } | { ok: false; outcome: Exclude<ScreeningOutcome, "need"> };

/**
 * How a text of module V is screened: "contact" for the first message of a
 * question or a mentor request, "message" for the later ones, and
 * "partnership" for a post and for an answer to one.
 */
export type MessageKind = "contact" | "message" | "partnership";

export async function screenMessage(text: string, placeTerc: string | null, client: string | null, kind: MessageKind): Promise<Screened> {
  const gate = await screenText({ text, kind, placeName: getGmina(placeTerc)?.name ?? null, client }, { llm: getLlm() });
  if (gate.screening.outcome !== "need") return { ok: false, outcome: gate.screening.outcome };
  return { ok: true, text: gate.redactedText, redactions: gate.redactionCount };
}

export function message(author: ThreadMessage["author"], name: string | null, text: string): ThreadMessage {
  return { id: newId("wd"), at: nowIso(), author, name, text };
}

export const nextRetention = () => retentionFrom(new Date());
