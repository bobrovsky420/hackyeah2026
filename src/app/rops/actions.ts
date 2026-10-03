"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  contactStatuses,
  isOneOf,
  needStatuses,
  rejectReasons,
  verificationStatuses,
} from "@/lib/console";
import type { ModerationLogEntry } from "@/lib/contracts/records";
import { t, type MessageKey } from "@/lib/i18n";
import { isAuthenticated, REVIEWER_NAME, TOKEN_COOKIE, tokenMatches } from "@/lib/server/auth";
import { nowIso, store } from "@/lib/server/store";

export interface LoginState {
  error: string | null;
}

/** What a console form shows after it is sent: an error at the field, or a status message. */
export interface ConsoleFormState {
  error: string | null;
  done: string | null;
}

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Only console pages are valid return addresses after the login. */
function consolePath(value: string): string {
  return /^\/rops(\/[a-z-]+)?$/.test(value) ? value : "/rops";
}

export async function login(_state: LoginState, form: FormData): Promise<LoginState> {
  const token = field(form, "token");
  if (!tokenMatches(token)) return { error: t("console.login.error") };
  const secure = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(TOKEN_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", secure });
  redirect(consolePath(field(form, "next")));
}

export async function logout() {
  (await cookies()).delete(TOKEN_COOKIE);
  redirect("/rops");
}

async function requireConsole() {
  if (!(await isAuthenticated())) redirect("/rops");
}

function log(entry: Omit<ModerationLogEntry, "ts" | "reviewer">) {
  store.log.unshift({ ts: nowIso(), reviewer: REVIEWER_NAME, ...entry });
}

const approvedKeys = {
  need: "console.done.need",
  contact: "console.done.contact",
  readiness: "console.done.readiness",
  declined: "console.done.declined",
  report: "console.done.report",
} as const satisfies Record<ModerationLogEntry["target_type"], MessageKey>;

/** The entry was decided or removed meanwhile: refresh the queue and say so. */
function gone(): ConsoleFormState {
  revalidatePath("/rops", "layout");
  return { error: null, done: t("console.done.gone") };
}

/**
 * The moderation queues of FR-12.8: approve, or reject with one of the fixed
 * reasons and a note, or mark as verified or reviewed. A rejection without a
 * reason is refused, so the log never records a reason nobody chose.
 */
export async function moderate(_state: ConsoleFormState, form: FormData): Promise<ConsoleFormState> {
  await requireConsole();
  const kind = field(form, "kind");
  const id = field(form, "id");
  if (!isOneOf(approvedKeys, kind)) return gone();
  const approved = ["zatwierdz", "zweryfikuj", "przejrzane"].includes(field(form, "decision"));
  let reason: string | null = null;
  if (!approved) {
    const code = field(form, "reason");
    if (!isOneOf(rejectReasons, code)) return { error: t("console.decision.reasonMissing"), done: null };
    reason = t(rejectReasons[code]);
  }
  const note = field(form, "note") || null;
  const decision = approved ? "zatwierdzone" : "odrzucone";
  const decidedAt = nowIso();

  if (kind === "need") {
    const need = store.needs.find((item) => item.id === id);
    if (!need || need.moderation.status !== "do-weryfikacji") return gone();
    need.moderation = { status: decision, reviewer: REVIEWER_NAME, decided_at: decidedAt, reason_pl: reason };
    log({ target_type: "need", target_id: id, action: decision, status: null, reason_pl: reason, note_pl: note });
  } else if (kind === "contact") {
    const contact = store.contacts.find((item) => item.id === id);
    if (!contact || contact.moderation.status !== "do-weryfikacji") return gone();
    contact.moderation = { status: decision, reviewer: REVIEWER_NAME, decided_at: decidedAt, reason_pl: reason };
    contact.status = approved ? "przekazane" : "zamkniete";
    log({ target_type: "contact", target_id: id, action: decision, status: null, reason_pl: reason, note_pl: note });
  } else if (kind === "readiness") {
    const entry = store.readiness.find((item) => item.id === id);
    if (!entry || entry.verification.status !== "niezweryfikowane") return gone();
    const action = approved ? "zweryfikowane" : "odrzucone";
    entry.verification = { status: action, reviewer: REVIEWER_NAME, decided_at: decidedAt };
    log({ target_type: "readiness", target_id: id, action, status: null, reason_pl: reason, note_pl: note });
  } else if (kind === "report") {
    const report = store.reports.find((item) => item.id === id);
    if (!report || report.moderation.status !== "do-weryfikacji") return gone();
    report.moderation = { status: decision, reviewer: REVIEWER_NAME, decided_at: decidedAt, reason_pl: reason };
    log({ target_type: "report", target_id: id, action: decision, status: null, reason_pl: reason, note_pl: note });
  } else {
    if (!store.routes.has(id) || store.reviewedDeclines.has(id)) return gone();
    store.reviewedDeclines.add(id);
    log({ target_type: "declined", target_id: id, action: "przejrzane", status: null, reason_pl: null, note_pl: note });
  }
  revalidatePath("/rops", "layout");
  return { error: null, done: approved ? t(approvedKeys[kind]) : t("console.done.rejected", { reason: reason ?? "" }) };
}

/** The status select and the note field of every console table (S7). */
export async function updateRecord(_state: ConsoleFormState, form: FormData): Promise<ConsoleFormState> {
  await requireConsole();
  const kind = field(form, "kind");
  const id = field(form, "id");
  const status = field(form, "status");
  const note = field(form, "note") || null;
  const failed = { error: t("console.saveFailed"), done: null };

  if (kind === "need") {
    const need = store.needs.find((item) => item.id === id);
    if (!need || !isOneOf(needStatuses, status)) return failed;
    need.status = status;
    need.note_pl = note;
    log({ target_type: "need", target_id: id, action: "status", status, reason_pl: null, note_pl: note });
  } else if (kind === "contact") {
    const contact = store.contacts.find((item) => item.id === id);
    if (!contact || !isOneOf(contactStatuses, status)) return failed;
    contact.status = status;
    contact.note_pl = note;
    log({ target_type: "contact", target_id: id, action: "status", status, reason_pl: null, note_pl: note });
  } else if (kind === "readiness") {
    const entry = store.readiness.find((item) => item.id === id);
    if (!entry || !isOneOf(verificationStatuses, status)) return failed;
    entry.note_pl = note;
    if (entry.verification.status !== status) {
      entry.verification = { status, reviewer: REVIEWER_NAME, decided_at: nowIso() };
    }
    log({ target_type: "readiness", target_id: id, action: "status", status, reason_pl: null, note_pl: note });
  } else {
    return failed;
  }
  revalidatePath("/rops", "layout");
  return { error: null, done: t("console.saved") };
}
