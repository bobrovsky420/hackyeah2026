import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { LlmCall, LlmResult, LlmUsage } from "./types";

/*
 * The replay recording (9.3, 12.4): every successful live result is written
 * to <dir>/<sha256>.json, keyed by the task, the prompt version and the
 * exact prompt text. When the whole live chain fails, or LLM_PROVIDER is
 * replay (the evaluation harness, the offline demo), a recorded result for
 * the same key is served with `cached: true`. A file holds the parsed
 * result, the usage, the provider and the model; never a key and never the
 * prompt text.
 */

export interface ReplayRecord {
  task: string;
  promptVersion: string;
  provider: string;
  model: string;
  usage: LlmUsage;
  latencyMs: number;
  recordedAt: string;
  parsed: unknown;
}

/** sha256 over task, prompt version, system, cached blocks and user, each length-delimited by JSON. */
export function replayKey(call: Pick<LlmCall<unknown>, "task" | "promptVersion" | "system" | "cachedBlocks" | "user">): string {
  const material = JSON.stringify([call.task, call.promptVersion, call.system, call.cachedBlocks ?? [], call.user]);
  return createHash("sha256").update(material, "utf8").digest("hex");
}

export interface ReplayStore {
  /** The recorded result if one exists and still passes the call's schema. */
  read<T>(call: LlmCall<T>): Promise<{ record: ReplayRecord; parsed: T } | null>;
  /** Best effort: a write failure is logged by the caller, never fatal. */
  write<T>(call: LlmCall<T>, result: LlmResult<T>): Promise<void>;
}

export function createReplayStore(dir: string): ReplayStore {
  const fileFor = (call: LlmCall<unknown>) => path.join(dir, `${replayKey(call)}.json`);
  return {
    async read<T>(call: LlmCall<T>) {
      let record: ReplayRecord;
      try {
        record = JSON.parse(await fs.readFile(fileFor(call as LlmCall<unknown>), "utf8")) as ReplayRecord;
      } catch {
        return null;
      }
      const checked = call.schema.safeParse(record.parsed);
      return checked.success ? { record, parsed: checked.data } : null;
    },
    async write<T>(call: LlmCall<T>, result: LlmResult<T>) {
      const record: ReplayRecord = {
        task: call.task,
        promptVersion: call.promptVersion,
        provider: result.provider,
        model: result.model,
        usage: result.usage,
        latencyMs: result.latencyMs,
        recordedAt: new Date().toISOString(),
        parsed: result.parsed,
      };
      await fs.mkdir(dir, { recursive: true });
      const file = fileFor(call as LlmCall<unknown>);
      const temporary = `${file}.${process.pid}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(record, null, 1), "utf8");
      await fs.rename(temporary, file);
    },
  };
}
