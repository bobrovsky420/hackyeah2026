import "server-only";
import fs from "node:fs";
import path from "node:path";

/*
 * The versioned system prompts of 9.4: prompts/<task>.md opens with a
 * front matter block (`---`, `version: <task>-v<n>`, other keys, `---`);
 * the version is stamped into every result and into the replay key. Read
 * once per process; a prompt change needs a restart, like a data change.
 */

export interface Prompt {
  version: string;
  /** The Markdown after the front matter, trimmed. */
  body: string;
  /** Every key of the front matter, version included. */
  meta: Record<string, string>;
}

export class PromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptError";
  }
}

/** Splits the front matter off; keys are `key: value` lines, values unquoted. */
export function parsePrompt(task: string, text: string, file = `prompts/${task}.md`): Prompt {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) throw new PromptError(`${file}: no front matter (a block between two "---" lines at the top)`);
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon <= 0 || /^\s/.test(line)) continue;
    meta[line.slice(0, colon).trim()] = line
      .slice(colon + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2");
  }
  const version = meta.version;
  if (!version) throw new PromptError(`${file}: the front matter has no "version" key`);
  if (!new RegExp(`^${task.replace(/[^\w-]/g, "")}-v\\d+$`).test(version)) {
    throw new PromptError(`${file}: version "${version}" does not have the form ${task}-v<n>`);
  }
  const body = text.slice(match[0].length).trim();
  if (!body) throw new PromptError(`${file}: the prompt body is empty`);
  return { version, body, meta };
}

const cache = new Map<string, Prompt>();

/** prompts/<task>.md (or <dir>/<task>.md), parsed and cached per process; throws PromptError. */
export function loadPrompt(task: string, options: { dir?: string } = {}): Prompt {
  // Statically scoped to prompts/, so the Next.js build traces that folder and not the whole project.
  const dir = options.dir ? path.resolve(options.dir) : path.join(process.cwd(), "prompts");
  const file = options.dir ? path.join(dir, `${task}.md`) : path.join(process.cwd(), "prompts", `${task}.md`);
  const cached = cache.get(file);
  if (cached) return cached;
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new PromptError(`prompts/${task}.md is missing (looked in ${dir})`);
  }
  const prompt = parsePrompt(task, text, `prompts/${task}.md`);
  cache.set(file, prompt);
  return prompt;
}

/** For tests. */
export function clearPromptCache(): void {
  cache.clear();
}
