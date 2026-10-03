"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isOneOf } from "@/lib/console";
import { t } from "@/lib/i18n";
import { isAuthenticated, REVIEWER_NAME, TOKEN_COOKIE, tokenMatches } from "@/server/console/auth";
import { nowIso } from "@/server/ephemeral";
import { changeRecord, decide, decisionKinds, type ConsoleContext, type RecordKind } from "@/server/console/decisions";
import { repository } from "@/server/db";
import { clusterOpenNeeds } from "@/server/needs";

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

function context(): ConsoleContext {
  return { repo: repository(), reviewer: REVIEWER_NAME, now: nowIso };
}

/** The entry was decided or removed meanwhile: refresh the queue and say so. */
function gone(): ConsoleFormState {
  revalidatePath("/rops", "layout");
  return { error: null, done: t("console.done.gone") };
}

/**
 * The moderation queues of FR-12.8, through the rules of
 * src/server/console/decisions.ts, which the JSON API shares.
 */
export async function moderate(_state: ConsoleFormState, form: FormData): Promise<ConsoleFormState> {
  await requireConsole();
  const kind = field(form, "kind");
  if (!decisionKinds.some((item) => item === kind)) return gone();
  const result = await decide(
    {
      kind: kind as (typeof decisionKinds)[number],
      id: field(form, "id"),
      approve: ["zatwierdz", "zweryfikuj", "przejrzane"].includes(field(form, "decision")),
      reason: field(form, "reason") || null,
      note: field(form, "note") || null,
    },
    context(),
  );
  if (!result.ok) return result.error === "gone" ? gone() : { error: result.message, done: null };
  revalidatePath("/rops", "layout");
  return { error: null, done: result.message };
}

const recordKinds = { need: true, contact: true, readiness: true } satisfies Record<RecordKind, true>;

/** The status select and the note field of every console table (S7). */
export async function updateRecord(_state: ConsoleFormState, form: FormData): Promise<ConsoleFormState> {
  await requireConsole();
  const kind = field(form, "kind");
  const failed = { error: t("console.saveFailed"), done: null };
  if (!isOneOf(recordKinds, kind)) return failed;
  const result = await changeRecord(
    { kind, id: field(form, "id"), status: field(form, "status"), note: field(form, "note") || null },
    context(),
  );
  if (!result.ok) return failed;
  revalidatePath("/rops", "layout");
  return { error: null, done: t("console.saved") };
}

/**
 * "Pogrupuj potrzeby" (FR-5.4): the model groups the open needs, the server
 * stores each need's cluster and the clusters' names. A failed call keeps
 * the clusters of the last run.
 */
export async function clusterNeedsAction(): Promise<ConsoleFormState> {
  await requireConsole();
  const run = await clusterOpenNeeds();
  if (run.failed) return { error: t("console.clusters.failed"), done: null };
  revalidatePath("/rops", "layout");
  if (run.considered < 2) return { error: null, done: t("console.clusters.few") };
  return { error: null, done: t("console.clusters.done", { needs: run.considered, clusters: run.clusters.length }) };
}
