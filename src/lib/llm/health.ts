import { z } from "zod";
import type { LlmProvider } from "./provider";
import { LlmError, type LlmCall } from "./types";

/*
 * Whether the language models answer (12.4, 12.8, decision A.14). Every live
 * call of the chain notes how its provider fared; a probe, one tiny call at
 * most every PROBE_TTL_MS, checks the first configured provider when its
 * notes are missing or old. /api/health reports the result, and the panel
 * warns ROPS while the first provider fails: the gate then runs on its fixed
 * rules, and the assistant, the plan and the routes fall back to Claude,
 * the recording or their templates. A refused or malformed answer still
 * shows a provider that answers, so only a timeout or an unavailable host
 * counts as a failure. Nothing here carries user text or a key.
 */

export const PROBE_TTL_MS = 5 * 60_000;
const PROBE_TIMEOUT_MS = 10_000;

export interface ProviderHealth {
  lastOkAt: string | null;
  failure: { since: string; at: string; kind: string; status: number | null } | null;
}

export type LlmHealthStatus = "ok" | "degraded" | "unknown" | "unconfigured" | "replay";

export interface LlmHealth {
  status: LlmHealthStatus;
  /** The first configured provider, the one the health is about. */
  provider: string | null;
  model: string | null;
  /** While degraded: since when, why, and the HTTP status when there was one. */
  since: string | null;
  kind: string | null;
  httpStatus: number | null;
  /** The latest note, from a call or the probe. */
  checkedAt: string | null;
}

/*
 * On globalThis, like the store (src/server/db/index.ts): pages, route
 * handlers and server actions load their own copy of this module, and the
 * health must be one.
 */
const holder = globalThis as typeof globalThis & { __llmHealth?: { notes: Map<string, ProviderHealth>; probing: Promise<void> | null } };
const state = (holder.__llmHealth ??= { notes: new Map(), probing: null });
const notes = state.notes;

function iso(now: number): string {
  return new Date(now).toISOString();
}

function log(provider: LlmProvider, health: "ok" | "degraded", failure?: ProviderHealth["failure"]): void {
  console.info(JSON.stringify({ event: "llm_health", provider: provider.id, model: provider.model, health, kind: failure?.kind ?? null, status: failure?.status ?? null }));
}

/** A call or the probe got an answer. */
export function noteAnswer(provider: LlmProvider, now = Date.now()): void {
  const entry = notes.get(provider.id);
  if (entry?.failure) log(provider, "ok");
  notes.set(provider.id, { lastOkAt: iso(now), failure: null });
}

/** A call or the probe failed; a refusal or a malformed answer is an answer. */
export function noteFailure(provider: LlmProvider, error: LlmError, now = Date.now()): void {
  if (error.kind === "refusal" || error.kind === "invalid_output") {
    noteAnswer(provider, now);
    return;
  }
  const entry = notes.get(provider.id) ?? { lastOkAt: null, failure: null };
  const failure = { since: entry.failure?.since ?? iso(now), at: iso(now), kind: error.kind, status: error.status };
  if (!entry.failure) log(provider, "degraded", failure);
  notes.set(provider.id, { lastOkAt: entry.lastOkAt, failure });
}

function lastNoteAt(entry: ProviderHealth | undefined): number | null {
  const times = [entry?.lastOkAt, entry?.failure?.at].filter((value): value is string => Boolean(value)).map((value) => Date.parse(value));
  return times.length > 0 ? Math.max(...times) : null;
}

/** The health of the first configured provider from the notes. */
export function healthOf(providers: LlmProvider[], replayOnly: boolean): LlmHealth {
  const empty = { since: null, kind: null, httpStatus: null, checkedAt: null };
  if (replayOnly) return { status: "replay", provider: null, model: null, ...empty };
  const head = providers.find((provider) => provider.configured);
  if (!head) return { status: "unconfigured", provider: null, model: null, ...empty };
  const entry = notes.get(head.id);
  const at = lastNoteAt(entry);
  const checkedAt = at === null ? null : iso(at);
  if (entry?.failure) {
    return { status: "degraded", provider: head.id, model: head.model, since: entry.failure.since, kind: entry.failure.kind, httpStatus: entry.failure.status, checkedAt };
  }
  return { status: entry?.lastOkAt ? "ok" : "unknown", provider: head.id, model: head.model, ...empty, checkedAt };
}

const PROBE_CALL: LlmCall<{ ok: boolean }> = {
  task: "probe",
  system: 'Odpowiedz wyłącznie obiektem JSON {"ok": true}.',
  promptVersion: "probe-v1",
  user: "Czy działasz?",
  schema: z.object({ ok: z.boolean() }),
  effort: "low",
  maxTokens: 16,
  temperature: 0,
};

/**
 * One tiny call to the first configured provider when its latest note is
 * older than PROBE_TTL_MS; one probe at a time. Resolves when it is done.
 */
export function probe(providers: LlmProvider[], replayOnly: boolean, now = Date.now()): Promise<void> {
  if (replayOnly) return Promise.resolve();
  const head = providers.find((provider) => provider.configured);
  if (!head) return Promise.resolve();
  const at = lastNoteAt(notes.get(head.id));
  if (at !== null && now - at < PROBE_TTL_MS) return Promise.resolve();
  if (!state.probing) {
    state.probing = head
      .call(PROBE_CALL, { timeoutMs: PROBE_TIMEOUT_MS, maxRetries: 0 })
      .then(
        () => noteAnswer(head),
        (error: unknown) => noteFailure(head, error instanceof LlmError ? error : new LlmError("unavailable", "probe", `${head.id}: probe`, head.name)),
      )
      .finally(() => {
        state.probing = null;
      });
  }
  return state.probing;
}

/** For tests. */
export function resetLlmHealth(): void {
  notes.clear();
  state.probing = null;
}
