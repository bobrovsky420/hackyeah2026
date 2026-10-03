import { DEFAULT_EMBEDDING_MODEL } from "@/lib/data/load";
import { envValue } from "@/lib/env";
import type { Embed } from "@/server/contracts";

/*
 * The client of the embedding service (scripts/embedding-service.py, FR-3.7):
 * POST /embed {texts, kind} returns unit-length vectors. Before the first
 * request, and again after HEALTH_TTL_MS, GET /health must name the model
 * the vectors of data/ were built with; a service that serves another model
 * is refused, because a query of one model against passages of another
 * ranks nonsense. Short timeouts: the retriever falls back to the lexical
 * scorer rather than hold up a route (7.3). Texts are never logged.
 */

export const DEFAULT_EMBEDDING_URL = "http://127.0.0.1:8765";
const EMBED_TIMEOUT_MS = 4_000;
const HEALTH_TIMEOUT_MS = 1_500;
const HEALTH_TTL_MS = 60_000;

export type EmbedErrorKind = "unreachable" | "timeout" | "model_mismatch" | "bad_response";

export class EmbedError extends Error {
  constructor(
    readonly kind: EmbedErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "EmbedError";
  }
}

/** An Embed that also says which model it insists on; the retriever compares it with the vectors file. */
export type EmbedClient = Embed & { readonly model: string };

export interface EmbedClientOptions {
  /** Default: EMBEDDING_URL, else http://127.0.0.1:8765. */
  url?: string;
  /** Default: EMBEDDING_MODEL, else OPI-PIB/PolDense-400M (the loader checks the vectors against the same value). */
  model?: string;
  timeoutMs?: number;
  /** For tests. */
  fetch?: typeof fetch;
}

async function request(fetcher: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const name = (error as Error).name;
    if (name === "TimeoutError" || name === "AbortError") throw new EmbedError("timeout", `no answer within ${timeoutMs} ms`);
    throw new EmbedError("unreachable", `the embedding service is not reachable (${name})`);
  }
  if (!response.ok) throw new EmbedError("bad_response", `HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new EmbedError("bad_response", "the answer is not JSON");
  }
}

export function createEmbedClient(options: EmbedClientOptions = {}): EmbedClient {
  const base = (options.url ?? envValue("EMBEDDING_URL") ?? DEFAULT_EMBEDDING_URL).replace(/\/+$/, "");
  const model = options.model ?? envValue("EMBEDDING_MODEL") ?? DEFAULT_EMBEDDING_MODEL;
  const timeoutMs = options.timeoutMs ?? EMBED_TIMEOUT_MS;
  const fetcher = options.fetch ?? fetch;
  let checkedAt = 0;

  async function checkHealth(): Promise<void> {
    if (Date.now() - checkedAt < HEALTH_TTL_MS) return;
    const health = (await request(fetcher, `${base}/health`, { method: "GET" }, Math.min(HEALTH_TIMEOUT_MS, timeoutMs))) as {
      model?: unknown;
    };
    if (health.model !== model) {
      throw new EmbedError("model_mismatch", `the service serves ${String(health.model)}, the vectors need ${model}`);
    }
    checkedAt = Date.now();
  }

  const embed = async (texts: string[], kind: "query" | "passage"): Promise<number[][]> => {
    await checkHealth();
    const body = (await request(
      fetcher,
      `${base}/embed`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texts, kind }) },
      timeoutMs,
    )) as { model?: unknown; vectors?: unknown };
    if (body.model !== model) {
      checkedAt = 0;
      throw new EmbedError("model_mismatch", `the service answered with ${String(body.model)}, the vectors need ${model}`);
    }
    const vectors = body.vectors;
    if (!Array.isArray(vectors) || vectors.length !== texts.length || !vectors.every((v) => Array.isArray(v) && v.length > 0)) {
      throw new EmbedError("bad_response", "the answer has no vector per text");
    }
    return vectors as number[][];
  };
  return Object.assign(embed, { model });
}
