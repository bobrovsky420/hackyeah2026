"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getInnovation } from "@/lib/catalogue";
import type { IdeaStatus, InnovationOverride, KnowledgeEntry, KnowledgeEntryType, Mentor, ModerationLogEntry, NeedStatus, ThreadStatus } from "@/lib/contracts";
import { t } from "@/lib/i18n";
import { targetGroupCodes } from "@/lib/labels";
import { closeSession, markVisit, openSession, requireAdmin } from "@/server/admin/auth";
import { isRejectReason, REJECT_REASONS } from "@/server/admin/reasons";
import { repository } from "@/server/db";
import { newId, nowIso } from "@/server/ephemeral";
import { hashKey, message, newKey, nextRetention, threadPath } from "@/server/threads";
import { LINK_COOKIE } from "@/server/admin/link-flash";

/*
 * The panel's server actions (module VI). Every one checks the session
 * first (they are reachable by a direct POST), reads only the fields it
 * expects, logs what it did with the reviewer's name (FR-12.8) and goes
 * back to the page it came from with a short confirmation.
 */

export interface LoginState {
  error: string | null;
}

export async function login(_state: LoginState, form: FormData): Promise<LoginState> {
  const reviewer = String(form.get("osoba") ?? "").trim();
  if (!reviewer) return { error: t("admin.login.reviewerError") };
  if (!(await openSession(String(form.get("kod") ?? ""), reviewer))) return { error: t("admin.login.codeError") };
  redirect("/rops");
}

export async function logout(): Promise<void> {
  await closeSession();
  redirect("/rops");
}

/** "Oznacz jako przejrzane": the next visit counts as new only what came after now. */
export async function markSeen(): Promise<void> {
  await requireAdmin();
  await markVisit(nowIso());
  revalidatePath("/rops");
  redirect("/rops?zapisano=1");
}

const text = (form: FormData, name: string, max = 2000) => {
  const value = String(form.get(name) ?? "").trim();
  return value ? value.slice(0, max) : null;
};

/** The page to return to: only a page of the panel. */
function back(form: FormData): string {
  const target = String(form.get("wroc") ?? "/rops");
  return /^\/rops(\/[a-z0-9-]+)*(\?[a-z0-9=&-]*)?$/i.test(target) ? target : "/rops";
}

function done(form: FormData): never {
  const target = back(form);
  revalidatePath(target.split("?")[0]);
  redirect(`${target.split("?")[0]}?zapisano=1`);
}

async function log(entry: Omit<ModerationLogEntry, "ts">) {
  await repository().appendModerationLog({ ts: nowIso(), ...entry });
}

type Kind = "need" | "idea" | "evaluation" | "contact" | "readiness" | "report" | "partnership";
const KINDS: Kind[] = ["need", "idea", "evaluation", "contact", "readiness", "report", "partnership"];

/** Approve or reject one entry of a queue. */
export async function moderate(form: FormData): Promise<void> {
  const { reviewer } = await requireAdmin();
  const kind = String(form.get("rodzaj")) as Kind;
  const id = String(form.get("id") ?? "");
  const approve = form.get("decyzja") === "zatwierdz";
  if (!KINDS.includes(kind) || !id) done(form);
  const reasonCode = form.get("powod");
  const reason = approve ? null : t(REJECT_REASONS[isRejectReason(reasonCode) ? reasonCode : "inne"]);
  const note = text(form, "notatka", 500);
  const moderation = { status: approve ? ("zatwierdzone" as const) : ("odrzucone" as const), reviewer, decided_at: nowIso(), reason_pl: reason };
  const repo = repository();

  switch (kind) {
    case "need":
      await repo.decideNeed(id, moderation);
      break;
    case "idea":
      await repo.moderateIdea(id, moderation);
      break;
    case "evaluation":
      await repo.moderateEvaluation(id, moderation);
      break;
    case "contact":
      // An approved request is relayed by ROPS; a rejected one is closed.
      await repo.decideContact(id, moderation, approve ? "przekazane" : "zamkniete");
      break;
    case "readiness":
      await repo.verifyReadiness(id, { status: approve ? "zweryfikowane" : "odrzucone", reviewer, decided_at: moderation.decided_at });
      break;
    case "report":
      await repo.decideReport(id, moderation);
      break;
    case "partnership":
      await repo.moderatePost(id, moderation);
      revalidatePath("/partnerstwa");
      break;
  }
  await log({
    reviewer,
    target_type: kind,
    target_id: id,
    action: kind === "readiness" && approve ? "zweryfikowane" : moderation.status,
    status: null,
    reason_pl: reason,
    note_pl: note,
  });
  done(form);
}

const NEED_STATUSES: NeedStatus[] = ["nowa", "w-analizie", "dopasowano-pozniej", "temat-naboru", "zamknieta"];

export async function updateNeedStatus(form: FormData): Promise<void> {
  const { reviewer } = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status")) as NeedStatus;
  if (!NEED_STATUSES.includes(status)) done(form);
  const note = text(form, "notatka", 500);
  if (await repository().updateNeed(id, { status, note_pl: note })) {
    await log({ reviewer, target_type: "need", target_id: id, action: "status", status, reason_pl: null, note_pl: note });
  }
  done(form);
}

export async function updateContactStatus(form: FormData): Promise<void> {
  const { reviewer } = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status"));
  if (status !== "nowe" && status !== "przekazane" && status !== "zamkniete") done(form);
  const note = text(form, "notatka", 500);
  if (await repository().updateContact(id, { status, note_pl: note })) {
    await log({ reviewer, target_type: "contact", target_id: id, action: "status", status, reason_pl: null, note_pl: note });
  }
  done(form);
}

const IDEA_STATUSES: IdeaStatus[] = ["nowy", "w-analizie", "przyjety", "zamkniety"];

/** The idea card's status, ROPS's internal note and the reply its author reads on the card's page. */
export async function updateIdea(form: FormData): Promise<void> {
  const { reviewer } = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status")) as IdeaStatus;
  if (!IDEA_STATUSES.includes(status)) done(form);
  const note = text(form, "notatka", 1000);
  const replyText = text(form, "odpowiedz", 2000);
  const repo = repository();
  const before = await repo.getIdea(id);
  if (!before) done(form);
  const replyChanged = (replyText ?? null) !== (before.reply?.text_pl ?? null);
  const reply = replyChanged ? (replyText ? { text_pl: replyText, at: nowIso(), by: reviewer } : null) : undefined;
  await repo.updateIdea(id, { status, note_pl: note, reply });
  await log({ reviewer, target_type: "idea", target_id: id, action: replyChanged ? "odpowiedz" : "status", status, reason_pl: null, note_pl: note });
  revalidatePath(`/pomysl/${id}`);
  done(form);
}

export async function forwardEvaluation(form: FormData): Promise<void> {
  const { reviewer } = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const note = text(form, "notatka", 500);
  const forwarded = await repository().forwardEvaluation(id, { at: nowIso(), note_pl: note });
  if (forwarded) {
    await log({ reviewer, target_type: "evaluation", target_id: id, action: "przekazane", status: null, reason_pl: null, note_pl: note });
    revalidatePath(`/innowacja/${forwarded.innovation_id}`);
  }
  done(form);
}

/** The declined-texts review of FR-12.8: a declined route or a kept text marked as looked at. */
export async function reviewDeclined(form: FormData): Promise<void> {
  const { reviewer } = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const repo = repository();
  const at = nowIso();
  const reviewed = id.startsWith("sl-") ? await repo.markScreeningTextReviewed(id, at) : await repo.markDeclineReviewed(id, at);
  if (reviewed) await log({ reviewer, target_type: "declined", target_id: id, action: "przejrzane", status: null, reason_pl: null, note_pl: null });
  done(form);
}

// ------------------------------------------------------------ knowledge

const KNOWLEDGE_TYPES: KnowledgeEntryType[] = ["guide", "model", "publication", "catalogue", "data", "contact", "project", "video"];
const isHttpUrl = (value: string | null): value is string => value !== null && /^https?:\/\/[^\s]+$/i.test(value);

export interface KnowledgeFormState {
  error: string | null;
}

/** Adds a knowledge item or saves the edit of one; a curated item is edited through an entry with its `base_id`. */
export async function saveKnowledge(_state: KnowledgeFormState, form: FormData): Promise<KnowledgeFormState> {
  const { reviewer } = await requireAdmin();
  const title = text(form, "tytul", 200);
  const url = text(form, "adres", 500);
  const type = String(form.get("typ")) as KnowledgeEntryType;
  if (!title) return { error: t("admin.knowledge.titleError") };
  if (!isHttpUrl(url)) return { error: t("admin.knowledge.urlError") };
  if (!KNOWLEDGE_TYPES.includes(type)) return { error: t("admin.knowledge.typeError") };
  const groups = form.getAll("grupy").map(String).filter((code) => targetGroupCodes.includes(code));
  const baseId = text(form, "bazowy", 100);
  const existingId = text(form, "id", 100);
  const entry: KnowledgeEntry = {
    id: existingId ?? `wz-${randomBytes(4).toString("hex")}`,
    base_id: baseId,
    title_pl: title,
    description_pl: text(form, "opis", 1000) ?? "",
    url,
    type,
    target_groups: groups.length > 0 ? groups : ["any"],
    always_show: form.get("zawsze") === "on",
    hidden: form.get("ukryte") === "on",
    updated_at: nowIso(),
    updated_by: reviewer,
  };
  await repository().saveKnowledgeEntry(entry);
  await log({ reviewer, target_type: "knowledge", target_id: baseId ?? entry.id, action: "edycja", status: entry.hidden ? "ukryte" : "opublikowane", reason_pl: null, note_pl: null });
  revalidatePath("/rops/wiedza");
  redirect("/rops/wiedza?zapisano=1");
}

/** ROPS's word on one innovation: verified or hidden, a corrected summary, and a material to add or remove. */
export async function saveInnovation(_state: KnowledgeFormState, form: FormData): Promise<KnowledgeFormState> {
  const { reviewer } = await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (!getInnovation(id)) return { error: t("admin.innovation.unknown") };
  const statusValue = String(form.get("status") ?? "");
  const status = statusValue === "zweryfikowane" || statusValue === "ukryte" ? statusValue : null;
  const repo = repository();
  const before = await repo.getInnovationOverride(id);
  const remove = new Set(form.getAll("usun").map(String));
  const materials = (before?.extra_materials ?? []).filter((material) => !remove.has(material.url));
  const materialTitle = text(form, "material-tytul", 200);
  const materialUrl = text(form, "material-adres", 500);
  if (materialTitle || materialUrl) {
    if (!materialTitle) return { error: t("admin.knowledge.titleError") };
    if (!isHttpUrl(materialUrl)) return { error: t("admin.knowledge.urlError") };
    materials.push({ title: materialTitle, url: materialUrl, type: form.get("material-typ") === "video" ? "video" : "document" });
  }
  const override: InnovationOverride = {
    innovation_id: id,
    status,
    summary_pl: text(form, "streszczenie", 1500),
    extra_materials: materials,
    note_pl: text(form, "notatka", 1000),
    updated_at: nowIso(),
    updated_by: reviewer,
  };
  await repo.saveInnovationOverride(override);
  await log({ reviewer, target_type: "innovation", target_id: id, action: status === "zweryfikowane" ? "zweryfikowane" : "edycja", status, reason_pl: null, note_pl: override.note_pl });
  revalidatePath(`/innowacja/${id}`);
  revalidatePath(`/rops/innowacje/${id}`);
  redirect(`/rops/innowacje/${id}?zapisano=1`);
}

// ------------------------------------------------ conversations (module V)

const THREAD_STATUSES: ThreadStatus[] = ["nowa", "w-toku", "zamknieta"];

/**
 * A new private link is shown once, in the panel of the reviewer who made
 * it, through a short-lived cookie: the store keeps only its hash.
 */
async function flashLink(threadId: string, path: string, kind: "mentor" | "autor") {
  (await cookies()).set(LINK_COOKIE, JSON.stringify({ threadId, path, kind }), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/rops",
    maxAge: 120,
  });
}

/** ROPS's answer in a conversation, signed with the reviewer's name; the status moves to "w toku". */
export async function replyThread(form: FormData): Promise<void> {
  const { reviewer } = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const reply = text(form, "odpowiedz", 3000);
  const repo = repository();
  const thread = await repo.getThread(id);
  if (!thread || !reply) done(form);
  await repo.appendMessage(id, message("rops", reviewer, reply), nextRetention());
  if (thread.status === "nowa") await repo.updateThread(id, { status: "w-toku" });
  await log({ reviewer, target_type: "thread", target_id: id, action: "odpowiedz", status: null, reason_pl: null, note_pl: null });
  done(form);
}

export async function updateThreadStatus(form: FormData): Promise<void> {
  const { reviewer } = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status")) as ThreadStatus;
  if (!THREAD_STATUSES.includes(status)) done(form);
  const note = text(form, "notatka", 1000);
  if (await repository().updateThread(id, { status, note_pl: note })) {
    await log({ reviewer, target_type: "thread", target_id: id, action: "status", status, reason_pl: null, note_pl: note });
  }
  done(form);
}

/** Invites a mentor into a conversation with a private link of their own; a new invitation revokes the old link. */
export async function assignMentor(form: FormData): Promise<void> {
  const { reviewer } = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const repo = repository();
  const mentor = await repo.getMentor(String(form.get("mentor") ?? ""));
  const thread = await repo.getThread(id);
  if (!thread || !mentor?.active) done(form);
  const key = newKey();
  await repo.updateThread(id, { mentor: { id: mentor.id, name: mentor.name, key_hash: hashKey(key) } });
  await repo.appendMessage(id, message("rops", reviewer, t("admin.threads.mentorJoined", { name: mentor.name })), nextRetention());
  await flashLink(id, threadPath(id, key), "mentor");
  await log({ reviewer, target_type: "thread", target_id: id, action: "mentor", status: mentor.id, reason_pl: null, note_pl: null });
  done(form);
}

/** A new private link for the author who lost theirs; the old one stops working. */
export async function resetAuthorLink(form: FormData): Promise<void> {
  const { reviewer } = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const key = newKey();
  if (await repository().updateThread(id, { access_hash: hashKey(key) })) {
    await flashLink(id, threadPath(id, key), "autor");
    await log({ reviewer, target_type: "thread", target_id: id, action: "link", status: null, reason_pl: null, note_pl: null });
  }
  done(form);
}

export async function saveMentor(form: FormData): Promise<void> {
  const { reviewer } = await requireAdmin();
  const name = text(form, "imie", 200);
  const expertise = text(form, "dziedzina", 500);
  if (!name || !expertise) done(form);
  const repo = repository();
  const existing = await repo.getMentor(String(form.get("id") ?? ""));
  const mentor: Mentor = {
    id: existing?.id ?? newId("mt"),
    name,
    expertise_pl: expertise,
    target_groups: form.getAll("grupy").map(String).filter((code) => targetGroupCodes.includes(code)),
    active: form.get("aktywny") === "on",
    updated_at: nowIso(),
    example: existing?.example,
    demo: existing?.demo,
  };
  await repo.saveMentor(mentor);
  await log({ reviewer, target_type: "mentor", target_id: mentor.id, action: "edycja", status: mentor.active ? "aktywny" : "nieaktywny", reason_pl: null, note_pl: null });
  done(form);
}
