import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadProblems, parseProblem, type ProblemReferences } from "@/server/eval/problems";

/*
 * The loader of the test-problem files (13.1, the checklist of
 * docs/test-problem-candidates.md section 5): a valid file of each set and
 * each kind of invalid file, reported per file and field. No data/ needed:
 * the references are small sets.
 */

const FIXTURES = path.join(__dirname, "fixtures");
const read = (name: string) => readFileSync(path.join(FIXTURES, name), "utf8");

const REFS: ProblemReferences = {
  innovationIds: new Set(["inn-rops-senior-cuder", "inn-rops-organizator-kompleksowej-opieki"]),
  targetGroups: new Set(["seniorzy", "cudzoziemcy"]),
  pathIds: new Set(["asy-priorytet-v", "usluga-wrazliwa-b", "cus-program-uslug"]),
  tercs: new Set(["1207062", "1262011"]),
};

function fieldsOf(result: ReturnType<typeof parseProblem>): string[] {
  return result.issues.map((issue) => issue.field);
}

describe("parseProblem", () => {
  it("reads the example of 13.1", () => {
    const { problem, issues } = parseProblem(read("valid/P01.yaml"), "tests/problems/P01.yaml", REFS);
    expect(issues).toEqual([]);
    expect(problem).toMatchObject({
      id: "P01",
      set: "P",
      role: "pracownik-instytucji",
      placeTerc: "1207062",
      text: "Coraz więcej samotnych seniorów w naszej gminie. Nie ma domu dziennego pobytu ani klubu seniora.\nGmina ma świetlicę wiejską wolną trzy dni w tygodniu.",
      notes: "Why these expectations, which source fields justify them.",
      sensitive: false,
      repeat: 1,
      expected: {
        mode: "route",
        outcome: "need",
        crisisBanner: null,
        anyOf: ["inn-rops-senior-cuder", "inn-rops-organizator-kompleksowej-opieki"],
        targetGroups: ["seniorzy"],
        peopleRoles: ["advisor", "implementer_nearby"],
        summaryMustMention: ["świetlic"],
      },
    });
    expect(problem?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reads a robustness case with repeat, and marks the R and S sets sensitive with the banner expected for S", () => {
    const repeat = parseProblem(read("valid/R12.yaml"), "R12.yaml", REFS).problem;
    expect(repeat).toMatchObject({ set: "R", repeat: 20, sensitive: true, placeTerc: null, text: "Brakuje nam miejsc w przedszkolu,\nproszę o pomysł." });
    expect(repeat?.expected.outcome).toBe("off_topic");
    const sensitive = parseProblem(read("valid/S01.yaml"), "S01.yaml", REFS).problem;
    expect(sensitive).toMatchObject({ set: "S", sensitive: true, expected: { outcome: "need", crisisBanner: true, mode: "route" } });
  });

  it("names the file and the line of a YAML syntax error", () => {
    const { problem, issues } = parseProblem(read("invalid/syntax.yaml"), "P03.yaml", REFS);
    expect(problem).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/^P03\.yaml:4: .*unique/);
  });

  it("lists every missing field of one of the ten", () => {
    const result = parseProblem(read("invalid/missing.yaml"), "P04.yaml", REFS);
    expect(result.problem).toBeNull();
    expect(fieldsOf(result).sort()).toEqual(
      [
        "expected.mode",
        "expected.any_of_innovations",
        "expected.none_of_innovations",
        "expected.paths_any_of",
        "expected.people_roles",
        "expected.summary_must_mention_pl",
        "notes",
      ].sort(),
    );
  });

  it("reports wrong types, unknown values and unknown fields per field", () => {
    const result = parseProblem(read("invalid/types.yaml"), "P05.yaml", REFS);
    expect(result.problem).toBeNull();
    const byField = Object.fromEntries(result.issues.map((issue) => [issue.field, issue.message]));
    expect(byField.place_terc).toMatch(/quoted seven-digit TERC/);
    expect(byField.role).toMatch(/one of pracownik-instytucji/);
    expect(byField.written_on).toMatch(/YYYY-MM-DD/);
    expect(byField["expected.people_roles.1"]).toMatch(/one of advisor/);
    expect(byField[""]).toMatch(/unknown field difficulty/);
  });

  it("checks ids, codes, paths and the TERC against the data", () => {
    const result = parseProblem(read("invalid/references.yaml"), "P06.yaml", REFS);
    expect(result.problem).toBeNull();
    expect(fieldsOf(result).sort()).toEqual(["expected.any_of_innovations.1", "expected.paths_any_of.0", "expected.target_groups.0", "place_terc"]);
    expect(result.issues.find((issue) => issue.field === "expected.any_of_innovations.1")?.message).toMatch(/inn-rops-nie-istnieje: no record/);
  });

  it("requires expected.outcome outside the ten and the sensitive set", () => {
    const result = parseProblem(read("invalid/outcome.yaml"), "R02.yaml", REFS);
    expect(fieldsOf(result)).toEqual(["expected.outcome"]);
  });

  it("requires the id to match the file name", () => {
    const result = parseProblem(read("invalid/P07.yaml"), "tests/problems/P07.yaml", REFS);
    expect(result.issues).toEqual([{ file: "tests/problems/P07.yaml", field: "id", message: "the id P08 differs from the file name P07" }]);
  });
});

describe("loadProblems", () => {
  it("loads a folder in name order with a hash per file", () => {
    const loaded = loadProblems(path.join(FIXTURES, "valid"), REFS);
    expect(loaded.issues).toEqual([]);
    expect(loaded.problems.map((problem) => problem.id)).toEqual(["P01", "R12", "S01"]);
    expect(loaded.hashes.map((hash) => path.basename(hash.file))).toEqual(["P01.yaml", "R12.yaml", "S01.yaml"]);
  });

  it("reports an id used by two files", () => {
    const loaded = loadProblems(path.join(FIXTURES, "duplicate"), REFS);
    expect(loaded.problems).toHaveLength(2);
    expect(loaded.issues).toHaveLength(1);
    expect(loaded.issues[0]).toMatchObject({ field: "id" });
    expect(loaded.issues[0].message).toMatch(/also used by .*P09\.yaml/);
  });

  it("reports a missing folder instead of throwing", () => {
    const loaded = loadProblems(path.join(FIXTURES, "absent"), REFS);
    expect(loaded.problems).toEqual([]);
    expect(loaded.issues[0].message).toMatch(/does not exist/);
  });
});
