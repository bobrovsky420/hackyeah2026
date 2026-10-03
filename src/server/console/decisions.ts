import "server-only";
import { contactStatuses, isOneOf, needStatuses, rejectReasons, verificationStatuses } from "@/lib/console";
import type { ContactRequest, ContentReport, ModerationLogEntry, Need, Readiness } from "@/lib/contracts/records";
import { t, type MessageKey } from "@/lib/i18n";
import type { Repository } from "@/server/db";
import { markDeclinedReviewed, type DeclinedReviewItem } from "./review";

/*
 * The console's two kinds of change, shared by the server actions of
 * src/app/rops/actions.ts and the JSON API of /api/rops/*: the moderation
 * decisions of FR-12.8 and the status and note of every console table
 * (FR-9.2). Both log each change with the reviewer's name. The callers
 * check the access code first.
 */

export type DecisionKind = ModerationLogEntry["target_type"];
export type DecidedItem = Need | ContactRequest | Readiness | ContentReport | DeclinedReviewItem;

export interface ConsoleContext {
  repo: Repository;
  reviewer: string;
  now: () => string;
}

export interface DecisionInput {
  kind: DecisionKind;
  id: string;
  /** Approve, verify or mark as reviewed; false rejects. A declined text is only ever reviewed. */
  approve: boolean;
  /** A code of the fixed list `rejectReasons`; required to reject. */
  reason: string | null;
  note: string | null;
}

export type DecisionResult =
  | { ok: true; item: DecidedItem; message: string }
  | { ok: false; error: "reason_missing" | "gone"; message: string };

const approvedKeys = {
  need: "console.done.need",
  contact: "console.done.contact",
  readiness: "console.done.readiness",
  declined: "console.done.declined",
  report: "console.done.report",
} as const satisfies Record<DecisionKind, MessageKey>;

export const decisionKinds = Object.keys(approvedKeys) as DecisionKind[];

function log(ctx: ConsoleContext, entry: Omit<ModerationLogEntry, "ts" | "reviewer">): Promise<void> {
  return ctx.repo.appendModerationLog({ ts: ctx.now(), reviewer: ctx.reviewer, ...entry });
}

const gone = (): DecisionResult => ({ ok: false, error: "gone", message: t("console.done.gone") });

/**
 * The moderation queues of FR-12.8: approve, or reject with one of the fixed
 * reasons and a note, or mark as verified or reviewed. A rejection without a
 * reason is refused, so the log never records a reason nobody chose. Each
 * decision changes only an entry that still waits for one; otherwise
 * someone was faster, and the answer is "gone".
 */
export async function decide(input: DecisionInput, ctx: ConsoleContext): Promise<DecisionResult> {
  const { kind, id, note } = input;
  const approved = input.approve || kind === "declined";
  let reason: string | null = null;
  if (!approved) {
    const code = input.reason ?? "";
    if (!isOneOf(rejectReasons, code)) return { ok: false, error: "reason_missing", message: t("console.decision.reasonMissing") };
    reason = t(rejectReasons[code]);
  }
  const decision = approved ? "zatwierdzone" : "odrzucone";
  const decidedAt = ctx.now();
  const { repo, reviewer } = ctx;
  const moderation = { status: decision, reviewer, decided_at: decidedAt, reason_pl: reason } as const;
  let item: DecidedItem | undefined;

  if (kind === "need") {
    item = await repo.decideNeed(id, moderation);
    if (item) await log(ctx, { target_type: kind, target_id: id, action: decision, status: null, reason_pl: reason, note_pl: note });
  } else if (kind === "contact") {
    item = await repo.decideContact(id, moderation, approved ? "przekazane" : "zamkniete");
    if (item) await log(ctx, { target_type: kind, target_id: id, action: decision, status: null, reason_pl: reason, note_pl: note });
  } else if (kind === "readiness") {
    const action = approved ? "zweryfikowane" : "odrzucone";
    item = await repo.verifyReadiness(id, { status: action, reviewer, decided_at: decidedAt });
    if (item) await log(ctx, { target_type: kind, target_id: id, action, status: null, reason_pl: reason, note_pl: note });
  } else if (kind === "report") {
    item = await repo.decideReport(id, moderation);
    if (item) await log(ctx, { target_type: kind, target_id: id, action: decision, status: null, reason_pl: reason, note_pl: note });
  } else {
    item = await markDeclinedReviewed(repo, id, decidedAt);
    if (item) await log(ctx, { target_type: kind, target_id: id, action: "przejrzane", status: null, reason_pl: null, note_pl: note });
  }
  if (!item) return gone();
  return { ok: true, item, message: approved ? t(approvedKeys[kind]) : t("console.done.rejected", { reason: reason ?? "" }) };
}

/** The actions of PATCH /api/rops/moderation/{type}/{id} (9.2), and the types each one fits. */
const apiActions = {
  approve: ["need", "contact", "report"],
  verify: ["readiness"],
  reject: ["need", "contact", "readiness", "report"],
  review: ["declined"],
} as const satisfies Record<string, readonly DecisionKind[]>;

/** The queue names of GET /api/rops/moderation work as types too. */
const typeAliases: Record<string, DecisionKind> = { needs: "need", contacts: "contact", reports: "report" };

/**
 * The API's `{type}` and `action` as a decision: approve for need, contact
 * and report; verify for readiness; reject for all four; review for a
 * declined text.
 */
export function apiDecision(
  type: string,
  action: unknown,
): { ok: true; kind: DecisionKind; approve: boolean } | { ok: false; error: "unknown_type" | "action_not_allowed" } {
  const kind = typeAliases[type] ?? decisionKinds.find((item) => item === type);
  if (!kind) return { ok: false, error: "unknown_type" };
  if (typeof action !== "string" || !Object.hasOwn(apiActions, action)) return { ok: false, error: "action_not_allowed" };
  const fits: readonly DecisionKind[] = apiActions[action as keyof typeof apiActions];
  if (!fits.includes(kind)) return { ok: false, error: "action_not_allowed" };
  return { ok: true, kind, approve: action !== "reject" };
}

export type RecordKind = "need" | "contact" | "readiness";

export type RecordResult =
  | { ok: true; item: Need | ContactRequest | Readiness }
  | { ok: false; error: "invalid_status" | "not_found" };

/** The status select and the note field of every console table (S7, FR-9.2). */
export async function changeRecord(
  input: { kind: RecordKind; id: string; status: string; note: string | null },
  ctx: ConsoleContext,
): Promise<RecordResult> {
  const { kind, id, status, note } = input;
  const { repo } = ctx;
  let item: Need | ContactRequest | Readiness | undefined;

  if (kind === "need") {
    if (!isOneOf(needStatuses, status)) return { ok: false, error: "invalid_status" };
    item = await repo.updateNeed(id, { status, note_pl: note });
  } else if (kind === "contact") {
    if (!isOneOf(contactStatuses, status)) return { ok: false, error: "invalid_status" };
    item = await repo.updateContact(id, { status, note_pl: note });
  } else {
    if (!isOneOf(verificationStatuses, status)) return { ok: false, error: "invalid_status" };
    const entry = await repo.getReadiness(id);
    if (!entry) return { ok: false, error: "not_found" };
    const verification =
      entry.verification.status === status ? entry.verification : { status, reviewer: ctx.reviewer, decided_at: ctx.now() };
    item = await repo.updateReadiness(id, { verification, note_pl: note });
  }
  if (!item) return { ok: false, error: "not_found" };
  await log(ctx, { target_type: kind, target_id: id, action: "status", status, reason_pl: null, note_pl: note });
  return { ok: true, item };
}
