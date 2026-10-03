import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parseYaml, YamlError } from "@/lib/data/yaml";

/*
 * The test problems of specification 13.1: one YAML file per problem in
 * tests/problems/, written by an AI assistant (decision P.15). The
 * format is the one of 13.1 and of the checklist in section 5 of
 * docs/test-problem-candidates.md. Four optional fields extend it for the
 * sets outside the ten, which 13.1 describes but gives no fields for:
 *
 * - `expected.outcome`: the gate outcome (13.1 names the field for the
 *   robustness, sensitive and fairness sets); default `need`;
 * - `expected.crisis_banner` and `expected.redactions` (S01-S04, R11);
 * - `repeat`: how often the text is submitted from one client (R12); the
 *   expected outcome then holds for every submission after the first;
 * - `sensitive`: the text never appears in a report; default true for the
 *   R and S sets, false otherwise;
 * - `pair` and `pair_with` for the fairness pairs (FR-12.11), see fairness.ts.
 */

export const DEFAULT_PROBLEMS_DIR = "tests/problems";

export const ROLES = ["pracownik-instytucji", "organizacja-spoleczna", "mieszkaniec", "urzad-gminy"] as const;
export const EXPECTED_MODES = ["route", "partial", "none", "clarification"] as const;
export const OUTCOMES = ["need", "redirected", "declined", "off_topic"] as const;
export const PEOPLE_ROLES = ["advisor", "implementer_nearby", "innovator", "readiness"] as const;
export const PAIR_KINDS = ["role", "place", "target_group"] as const;

export type ExpectedMode = (typeof EXPECTED_MODES)[number];
export type Outcome = (typeof OUTCOMES)[number];
export type PeopleRole = (typeof PEOPLE_ROLES)[number];
export type PairKind = (typeof PAIR_KINDS)[number];

/** P: the ten; R: robustness; S: sensitive but legitimate; F: fairness (13.1). */
export type ProblemSet = "P" | "R" | "S" | "F";

const idList = z.array(z.string().min(1, { error: "an empty id" }));

const expectedSchema = z
  .object({
    mode: z.enum(EXPECTED_MODES, { error: `one of ${EXPECTED_MODES.join(", ")}` }).optional(),
    outcome: z.enum(OUTCOMES, { error: `one of ${OUTCOMES.join(", ")}` }).optional(),
    crisis_banner: z.boolean({ error: "true or false" }).optional(),
    redactions: z.number({ error: "a whole number" }).int({ error: "a whole number" }).min(0).optional(),
    any_of_innovations: idList.optional(),
    none_of_innovations: idList.optional(),
    target_groups: idList.optional(),
    paths_any_of: idList.optional(),
    people_roles: z.array(z.enum(PEOPLE_ROLES, { error: `one of ${PEOPLE_ROLES.join(", ")}` })).optional(),
    summary_must_mention_pl: z.array(z.string().min(1, { error: "an empty word stem" })).optional(),
  })
  .strict();

const problemSchema = z
  .object({
    id: z.string({ error: "a string such as P01" }).regex(/^[PRSF]\d{2}[a-z]?$/, { error: "P, R, S or F, two digits and an optional letter, e.g. P01 or F03b" }),
    title: z.string({ error: "a string" }).min(1, { error: "empty" }),
    author: z.string({ error: "a string, e.g. lawyer" }).min(1, { error: "empty" }),
    written_on: z.string({ error: "a date YYYY-MM-DD" }).regex(/^\d{4}-\d{2}-\d{2}$/, { error: "a date YYYY-MM-DD" }),
    role: z.enum(ROLES, { error: `one of ${ROLES.join(", ")}, or null` }).nullable(),
    place_terc: z
      .string({ error: 'a quoted seven-digit TERC such as "1207062", or null' })
      .regex(/^\d{7}$/, { error: 'a quoted seven-digit TERC such as "1207062"' })
      .nullable(),
    problem_text_pl: z.string({ error: "a string" }).min(1, { error: "empty" }),
    expected: expectedSchema,
    notes: z.string({ error: "a string" }).nullable().optional(),
    repeat: z.number({ error: "a whole number" }).int({ error: "a whole number" }).min(1).max(50).optional(),
    sensitive: z.boolean({ error: "true or false" }).optional(),
    pair: z.enum(PAIR_KINDS, { error: `one of ${PAIR_KINDS.join(", ")}` }).optional(),
    pair_with: z.string({ error: "the id of the other file of the pair" }).optional(),
    /** The reader's answer to the question of FR-2.3; not in 13.1, default none. */
    target_groups_given: idList.optional(),
  })
  .strict();

type ProblemFile = z.infer<typeof problemSchema>;

export interface Problem {
  id: string;
  set: ProblemSet;
  file: string;
  sha256: string;
  title: string;
  author: string;
  writtenOn: string;
  role: ProblemFile["role"];
  placeTerc: string | null;
  text: string;
  notes: string | null;
  repeat: number;
  sensitive: boolean;
  pair: PairKind | null;
  pairWith: string | null;
  targetGroupsGiven: string[];
  expected: {
    mode: ExpectedMode | null;
    outcome: Outcome;
    crisisBanner: boolean | null;
    redactions: number | null;
    anyOf: string[];
    noneOf: string[];
    targetGroups: string[];
    pathsAnyOf: string[];
    peopleRoles: PeopleRole[];
    summaryMustMention: string[];
  };
}

export interface ValidationIssue {
  file: string;
  /** Dotted, e.g. "expected.any_of_innovations.1"; "" for the whole file. */
  field: string;
  message: string;
}

/** Known codes and ids for the checks against the data; any member left out skips its check. */
export interface ProblemReferences {
  innovationIds?: ReadonlySet<string>;
  targetGroups?: ReadonlySet<string>;
  pathIds?: ReadonlySet<string>;
  tercs?: ReadonlySet<string>;
}

export interface LoadedProblems {
  dir: string;
  problems: Problem[];
  issues: ValidationIssue[];
  /** Every file read, valid or not, with its hash (13.1: the report prints them). */
  hashes: { file: string; sha256: string }[];
}

// ------------------------------------------------------------------ parsing

function setOf(id: string): ProblemSet {
  return id[0] as ProblemSet;
}

/** Whether the file wrote a value (null included) at this path; Zod does not keep the input on an issue. */
function present(root: unknown, pathParts: PropertyKey[]): boolean {
  let node = root;
  for (const part of pathParts) {
    if (node === null || typeof node !== "object" || !Object.hasOwn(node, part)) return false;
    node = (node as Record<PropertyKey, unknown>)[part];
  }
  return true;
}

function fieldOf(pathParts: PropertyKey[]): string {
  return pathParts.map(String).join(".");
}

/** One file's text to a problem, or the issues that stop it. `file` names it in every issue. */
export function parseProblem(
  source: string,
  file: string,
  references: ProblemReferences = {},
): { problem: Problem | null; issues: ValidationIssue[] } {
  const sha256 = createHash("sha256").update(source, "utf8").digest("hex");
  let raw: unknown;
  try {
    raw = parseYaml(source, file);
  } catch (error) {
    const message = error instanceof YamlError ? error.message : `not readable: ${(error as Error).message}`;
    return { problem: null, issues: [{ file, field: "", message }] };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { problem: null, issues: [{ file, field: "", message: "the file is not a mapping of the fields of 13.1" }] };
  }
  const checked = problemSchema.safeParse(raw);
  if (!checked.success) {
    const issues = checked.error.issues.map((issue) => ({
      file,
      field: fieldOf(issue.path),
      message:
        issue.code === "unrecognized_keys"
          ? `unknown field${issue.keys.length > 1 ? "s" : ""} ${issue.keys.join(", ")}`
          : issue.code === "invalid_type" && !present(raw, issue.path)
            ? "missing"
            : issue.message,
    }));
    return { problem: null, issues };
  }

  const data = checked.data;
  const issues: ValidationIssue[] = [];
  const issue = (field: string, message: string) => issues.push({ file, field, message });
  const set = setOf(data.id);
  const expected = data.expected;

  const stem = path.basename(file).replace(/\.ya?ml$/i, "");
  if (stem !== data.id) issue("id", `the id ${data.id} differs from the file name ${stem}`);
  if (set === "P") {
    if (!expected.mode) issue("expected.mode", "missing (13.1: every one of the ten has a mode)");
    for (const key of ["any_of_innovations", "none_of_innovations", "target_groups", "paths_any_of", "people_roles", "summary_must_mention_pl"] as const) {
      if (expected[key] === undefined) issue(`expected.${key}`, "missing (write [] when there is none)");
    }
    if (data.notes === undefined) issue("notes", "missing (13.1: why these expectations)");
  } else if (set !== "S" && !expected.outcome) {
    issue("expected.outcome", "missing (13.1: the sets outside the ten carry expected.outcome)");
  }
  if (expected.mode === "clarification" && data.place_terc !== null) {
    issue("place_terc", "the clarification case has no place (null)");
  }
  if (expected.mode && expected.outcome && expected.outcome !== "need") {
    issue("expected.mode", `a mode only applies to the outcome need, not ${expected.outcome}`);
  }
  if (data.pair_with && !/^[PRSF]\d{2}[a-z]?$/.test(data.pair_with)) issue("pair_with", "not a problem id");

  const refs: [string, string[] | undefined, ReadonlySet<string> | undefined, string][] = [
    ["expected.any_of_innovations", expected.any_of_innovations, references.innovationIds, "no record with this id in data/built/innovations/"],
    ["expected.none_of_innovations", expected.none_of_innovations, references.innovationIds, "no record with this id in data/built/innovations/"],
    ["expected.target_groups", expected.target_groups, references.targetGroups, "not a target-group code of data/curated/taxonomies.json"],
    ["target_groups_given", data.target_groups_given, references.targetGroups, "not a target-group code of data/curated/taxonomies.json"],
    ["expected.paths_any_of", expected.paths_any_of, references.pathIds, "no path with this id in data/built/paths/"],
  ];
  for (const [field, values, known, message] of refs) {
    if (!values || !known) continue;
    values.forEach((value, index) => {
      if (!known.has(value)) issue(`${field}.${index}`, `${value}: ${message}`);
    });
  }
  if (data.place_terc && references.tercs && !references.tercs.has(data.place_terc)) {
    issue("place_terc", `${data.place_terc}: no gmina with this TERC in data/built/places/pl-register.json`);
  }
  if (issues.length > 0) return { problem: null, issues };

  const outcome = expected.outcome ?? "need";
  return {
    problem: {
      id: data.id,
      set,
      file,
      sha256,
      title: data.title,
      author: data.author,
      writtenOn: data.written_on,
      role: data.role,
      placeTerc: data.place_terc,
      // As a reader would type it: one paragraph, no final line break (the replay keys hold the exact text).
      text: data.problem_text_pl.trim(),
      notes: data.notes ?? null,
      repeat: data.repeat ?? 1,
      sensitive: data.sensitive ?? (set === "R" || set === "S"),
      pair: data.pair ?? null,
      pairWith: data.pair_with ?? null,
      targetGroupsGiven: data.target_groups_given ?? [],
      expected: {
        mode: expected.mode ?? null,
        outcome,
        // 13.1: the sensitive set is routed with the crisis banner.
        crisisBanner: expected.crisis_banner ?? (set === "S" ? true : null),
        redactions: expected.redactions ?? null,
        anyOf: expected.any_of_innovations ?? [],
        noneOf: expected.none_of_innovations ?? [],
        targetGroups: expected.target_groups ?? [],
        pathsAnyOf: expected.paths_any_of ?? [],
        peopleRoles: expected.people_roles ?? [],
        summaryMustMention: expected.summary_must_mention_pl ?? [],
      },
    },
    issues: [],
  };
}

/** Every *.yaml and *.yml file of `dir`, sorted by name; issues per file and field, duplicates across files included. */
export function loadProblems(dir: string, references: ProblemReferences = {}): LoadedProblems {
  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => /\.ya?ml$/i.test(name)).sort();
  } catch {
    return { dir, problems: [], issues: [{ file: dir, field: "", message: "the folder does not exist or cannot be read" }], hashes: [] };
  }
  const problems: Problem[] = [];
  const issues: ValidationIssue[] = [];
  const hashes: LoadedProblems["hashes"] = [];
  for (const name of names) {
    const file = path.join(dir, name).split(path.sep).join("/");
    const source = readFileSync(path.join(dir, name), "utf8");
    hashes.push({ file, sha256: createHash("sha256").update(source, "utf8").digest("hex") });
    const parsed = parseProblem(source, file, references);
    issues.push(...parsed.issues);
    if (parsed.problem) problems.push(parsed.problem);
  }
  const seen = new Map<string, string>();
  for (const problem of problems) {
    const first = seen.get(problem.id);
    if (first) issues.push({ file: problem.file, field: "id", message: `the id ${problem.id} is also used by ${first}` });
    else seen.set(problem.id, problem.file);
  }
  const ids = new Set(problems.map((problem) => problem.id));
  for (const problem of problems) {
    if (problem.pairWith && !ids.has(problem.pairWith)) {
      issues.push({ file: problem.file, field: "pair_with", message: `no valid problem file with the id ${problem.pairWith}` });
    }
  }
  return { dir, problems, issues, hashes };
}
