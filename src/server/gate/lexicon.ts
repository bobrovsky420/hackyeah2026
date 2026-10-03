import fs from "node:fs";
import path from "node:path";
import type { SensitiveTopic } from "@/lib/contracts/route";
import { parseYamlSubset, type YamlValue } from "@/lib/data/yaml";
import { fold } from "@/lib/text";

/*
 * The Polish crisis lexicon of FR-12.1, kept by the lawyer in
 * data/safety/lexicon-pl.yaml (its header explains the entry syntax). A
 * `crisis` hit forces `redirected` (FR-12.3); a `community` hit only adds
 * its sensitive topic, so the route carries the crisis banner. Matching
 * runs on the folded text (lower case, no diacritics), stem by stem.
 */

export const TOPICS: readonly SensitiveTopic[] = ["suicide", "self_harm", "violence", "child_abuse", "sexual_violence", "addiction"];

export interface LexiconHit {
  /** Null for the crisis entries under `other`. */
  topic: SensitiveTopic | null;
  /** The entry as written in the file, for rules_fired. */
  entry: string;
}

interface Rule extends LexiconHit {
  pattern: RegExp;
}

export interface Lexicon {
  owner: string;
  date: string;
  crisis: Rule[];
  community: Rule[];
}

export class LexiconError extends Error {
  constructor(message: string) {
    super(`data/safety/lexicon-pl.yaml: ${message}`);
    this.name = "LexiconError";
  }
}

const WORD = "[\\p{L}\\p{N}]";
const SEPARATOR = "[\\s,]+";
// "~": up to two other words between the neighbours.
const GAP = `(?:${SEPARATOR}${WORD}+){0,2}${SEPARATOR}`;

/** One entry as a pattern over folded text; see the syntax in the file's header. */
export function compileEntry(entry: string): RegExp {
  const tokens = entry.trim().split(/\s+/);
  if (tokens.length === 0 || tokens[0] === "~" || tokens.at(-1) === "~") throw new LexiconError(`malformed entry "${entry}"`);
  let source = `(?<!${WORD})`;
  tokens.forEach((token, index) => {
    if (token === "~") return;
    if (index > 0) source += tokens[index - 1] === "~" ? GAP : SEPARATOR;
    const whole = token.endsWith("$");
    const stem = fold(whole ? token.slice(0, -1) : token);
    if (!stem || /[^\p{L}\p{N}]/u.test(stem)) throw new LexiconError(`malformed word "${token}" in "${entry}"`);
    source += stem + (whole ? `(?!${WORD})` : `${WORD}*`);
  });
  return new RegExp(source, "u");
}

function rulesOf(group: YamlValue, name: "crisis" | "community"): Rule[] {
  if (!group || typeof group !== "object" || Array.isArray(group)) throw new LexiconError(`"${name}" must map topics to lists`);
  const rules: Rule[] = [];
  for (const [key, entries] of Object.entries(group)) {
    const topic = TOPICS.find((item) => item === key) ?? null;
    if (!topic && !(name === "crisis" && key === "other")) throw new LexiconError(`unknown topic "${key}" under "${name}"`);
    if (!Array.isArray(entries)) throw new LexiconError(`"${name}.${key}" must be a list`);
    for (const entry of entries) {
      if (typeof entry !== "string") throw new LexiconError(`"${name}.${key}" holds a non-text entry`);
      rules.push({ topic, entry, pattern: compileEntry(entry) });
    }
  }
  return rules;
}

/** Checks the parsed file and compiles its entries; throws LexiconError. */
export function compileLexicon(value: YamlValue): Lexicon {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LexiconError("not a mapping");
  const { owner, date } = value;
  if (typeof owner !== "string" || !owner) throw new LexiconError('no "owner" (FR-12.1: the file has an owner and a date)');
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new LexiconError('no "date" as YYYY-MM-DD');
  return { owner, date, crisis: rulesOf(value.crisis, "crisis"), community: rulesOf(value.community, "community") };
}

let cached: Lexicon | undefined;

/** The lexicon from data/safety/lexicon-pl.yaml, read once per process. */
export function loadLexicon(): Lexicon {
  if (cached) return cached;
  const file = path.join(process.cwd(), "data", "safety", "lexicon-pl.yaml");
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new LexiconError(`missing (looked for ${file})`);
  }
  cached = compileLexicon(parseYamlSubset(text, "data/safety/lexicon-pl.yaml"));
  return cached;
}

/** The crisis and the community entries found in the text. */
export function matchLexicon(text: string, lexicon: Lexicon = loadLexicon()): { crisis: LexiconHit[]; community: LexiconHit[] } {
  const folded = fold(text);
  const hits = (rules: Rule[]) => rules.filter((rule) => rule.pattern.test(folded)).map(({ topic, entry }) => ({ topic, entry }));
  return { crisis: hits(lexicon.crisis), community: hits(lexicon.community) };
}
