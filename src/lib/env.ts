import fs from "node:fs";
import path from "node:path";

/*
 * The server's configuration (specification 12.9). Values come from
 * process.env; outside production a missing variable is also looked up in
 * .env.dev at the repository root, which Next.js does not load by itself
 * and which holds the team's tokens (git-ignored). A value already set in
 * the environment always wins. Secrets are returned, never logged.
 */

/** KEY=VALUE lines; `#` comments, `export ` prefixes, quotes and CRLF are handled. */
export function parseEnvFile(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    const key = line.slice(0, equals).replace(/^export\s+/, "").trim();
    let value = line.slice(equals + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) values[key] = value;
  }
  return values;
}

/** The lookup rule on its own, for tests: the environment first, then the file; empty counts as missing. */
export function resolveEnv(name: string, env: Record<string, string | undefined>, file: Record<string, string>): string | undefined {
  const value = env[name];
  if (value !== undefined && value !== "") return value;
  const fromFile = file[name];
  return fromFile !== undefined && fromFile !== "" ? fromFile : undefined;
}

let devFile: Record<string, string> | undefined;

function devFileValues(): Record<string, string> {
  if (process.env.NODE_ENV === "production") return {};
  if (!devFile) {
    try {
      devFile = parseEnvFile(fs.readFileSync(path.join(process.cwd(), ".env.dev"), "utf8"));
    } catch {
      devFile = {};
    }
  }
  return devFile;
}

/** One variable, or undefined when it is set nowhere. */
export function envValue(name: string): string | undefined {
  return resolveEnv(name, process.env, devFileValues());
}

function envNumber(name: string, fallback: number): number {
  const value = Number(envValue(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// ------------------------------------------------ language models (9.3)

export type LlmProviderName = "openai-compatible" | "anthropic" | "replay";

/** Hugging Face router defaults, verified live on 28 September 2026 (model-evaluation.md). */
export const HF_ROUTER_URL = "https://router.huggingface.co/v1";
export const DEFAULT_BIELIK_MODEL = "speakleash/Bielik-11B-v3.0-Instruct:publicai";
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

/**
 * The head of the provider chain. LLM_PROVIDER: openai-compatible (default),
 * anthropic or replay; REPLAY_ONLY=true (the demo laptop, 12.9) means replay.
 */
export function llmProvider(): LlmProviderName {
  if (envValue("REPLAY_ONLY")?.toLowerCase() === "true") return "replay";
  const value = envValue("LLM_PROVIDER");
  return value === "anthropic" || value === "replay" ? value : "openai-compatible";
}

export interface OpenAiCompatConfig {
  baseUrl: string;
  model: string;
  /** Null when no key is set: the provider is skipped. */
  apiKey: string | null;
}

/** The primary provider: Bielik on the router. The key falls back to HF_TOKEN. */
export function openAiCompatConfig(): OpenAiCompatConfig {
  return {
    baseUrl: envValue("OPENAI_COMPAT_BASE_URL") ?? HF_ROUTER_URL,
    model: envValue("OPENAI_COMPAT_MODEL") ?? DEFAULT_BIELIK_MODEL,
    apiKey: envValue("OPENAI_COMPAT_API_KEY") ?? envValue("HF_TOKEN") ?? null,
  };
}

export interface AnthropicConfig {
  apiKey: string | null;
  model: string;
}

export function anthropicConfig(): AnthropicConfig {
  return {
    apiKey: envValue("ANTHROPIC_API_KEY") ?? null,
    model: envValue("ANTHROPIC_MODEL") ?? DEFAULT_ANTHROPIC_MODEL,
  };
}

export interface LlmTimeouts {
  /** The gate (5 s in 9.3). */
  screenMs: number;
  /** Every other task (40 s in 9.3). */
  defaultMs: number;
  /** SDK retries per provider (the default 2 in 9.3). */
  maxRetries: number;
}

export function llmTimeouts(): LlmTimeouts {
  const retries = Number(envValue("LLM_MAX_RETRIES"));
  return {
    screenMs: envNumber("LLM_SCREEN_TIMEOUT_MS", 5_000),
    defaultMs: envNumber("LLM_TIMEOUT_MS", 40_000),
    maxRetries: Number.isInteger(retries) && retries >= 0 ? retries : 2,
  };
}

/** Where live results are recorded and replayed from (git-ignored). */
export function llmReplayDir(): string {
  return path.resolve(process.cwd(), envValue("LLM_REPLAY_DIR") ?? ".local/llm-replay");
}

/**
 * The file the store is saved to (git-ignored, docs/storage.md), or null
 * for `STORE_FILE=memory`: the entries stay in the server's memory, as a
 * throwaway server or the Playwright server wants.
 */
export function storeFile(): string | null {
  const value = envValue("STORE_FILE") ?? ".local/store/records.json";
  return value === "memory" ? null : path.resolve(process.cwd(), value);
}
