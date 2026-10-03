import type { LlmTimeouts } from "@/lib/env";
import { countFailure, countSuccess, logLlmCall, type LlmLogLine } from "./observability";
import { ZERO_USAGE, type LlmProvider } from "./provider";
import type { ReplayStore } from "./replay";
import { LlmError, type Llm, type LlmCall, type LlmResult } from "./types";

/*
 * The provider chain behind one Llm function (9.3, 12.4). Live providers
 * are tried in order; one without a key is skipped, one that excludes the
 * task is skipped (Llama never serves the gate). The first valid answer is
 * recorded for replay and returned. When every live provider failed, a
 * recorded answer for the same prompt is served with `cached: true`;
 * otherwise the call throws one LlmError:
 * - refusal: a provider refused and none answered (FR-12.12);
 * - not_configured: no live provider could take the task;
 * - otherwise the kind of the last live failure (timeout, unavailable,
 *   invalid_output); in replay mode a missing recording is unavailable.
 */

export interface LlmChainOptions {
  /** In chain order; empty in replay mode. */
  providers: LlmProvider[];
  /** Null: no recording and no replay (tests of the live path). */
  replay: ReplayStore | null;
  timeouts: LlmTimeouts;
  /** "replay" only changes the error kind of a miss. */
  mode?: "live" | "replay";
  log?: (line: LlmLogLine) => void;
  now?: () => number;
}

export function createLlm(options: LlmChainOptions): Llm {
  const { providers, replay, timeouts, mode = "live", log = logLlmCall, now = () => performance.now() } = options;

  return async function llm<T>(call: LlmCall<T>): Promise<LlmResult<T>> {
    const started = now();
    const elapsed = () => Math.round(now() - started);
    const timeoutMs = call.task === "screen" ? timeouts.screenMs : timeouts.defaultMs;
    const failed: string[] = [];
    let lastError: LlmError | null = null;
    let lastProvider: LlmProvider | null = null;
    let refused = false;
    let attempted = 0;

    for (const provider of providers) {
      if (!provider.configured || provider.excludedTasks?.includes(call.task)) continue;
      attempted += 1;
      lastProvider = provider;
      try {
        const answer = await provider.call(call, { timeoutMs, maxRetries: timeouts.maxRetries });
        const result: LlmResult<T> = {
          parsed: answer.parsed,
          usage: answer.usage,
          latencyMs: elapsed(),
          provider: provider.name,
          model: answer.model,
          promptVersion: call.promptVersion,
          cached: false,
        };
        countSuccess(result);
        log({ event: "llm_call", task: call.task, provider: result.provider, model: result.model, promptVersion: call.promptVersion, ...result.usage, latencyMs: result.latencyMs, cached: false, outcome: "ok", failed });
        if (replay) {
          await replay.write(call, result).catch((error: unknown) => {
            console.warn(JSON.stringify({ event: "llm_replay_write_failed", task: call.task, error: error instanceof Error ? error.name : "Error" }));
          });
        }
        return result;
      } catch (error) {
        const failure =
          error instanceof LlmError
            ? error
            : new LlmError("unavailable", call.task, `${provider.id}: ${error instanceof Error ? error.name : "error"}`, provider.name);
        failed.push(`${provider.id}:${failure.kind}`);
        countFailure(provider.name, provider.model);
        lastError = failure;
        if (failure.kind === "refusal") {
          refused = true;
          if (provider.refusalIsFinal) break;
        }
      }
    }

    const hit = replay ? await replay.read(call) : null;
    if (hit) {
      const result: LlmResult<T> = {
        parsed: hit.parsed,
        usage: ZERO_USAGE,
        latencyMs: elapsed(),
        provider: "replay",
        model: hit.record.model,
        promptVersion: call.promptVersion,
        cached: true,
      };
      countSuccess(result);
      log({ event: "llm_call", task: call.task, provider: "replay", model: result.model, promptVersion: call.promptVersion, ...ZERO_USAGE, latencyMs: result.latencyMs, cached: true, outcome: "replay", failed });
      return result;
    }

    const kind = refused
      ? "refusal"
      : attempted === 0
        ? mode === "replay"
          ? "unavailable"
          : "not_configured"
        : (lastError?.kind ?? "unavailable");
    const message =
      attempted === 0
        ? mode === "replay"
          ? `no replay recording for ${call.task} (${call.promptVersion})`
          : `no language model is configured for ${call.task}`
        : `every provider failed for ${call.task} (${failed.join(", ")}) and there is no replay recording`;
    log({ event: "llm_call", task: call.task, provider: lastProvider?.name ?? null, model: lastProvider?.model ?? null, promptVersion: call.promptVersion, ...ZERO_USAGE, latencyMs: elapsed(), cached: false, outcome: kind, failed });
    throw new LlmError(kind, call.task, message, lastProvider?.name ?? null);
  };
}
