import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { catalogue, fromDataset } from "@/lib/catalogue";
import { loadDataset } from "@/lib/data/load";
import { LlmError } from "@/lib/llm/types";
import { parseTasksArgs, TasksUsageError } from "@/server/eval/tasks-cli";
import { caseIssues, DEFAULT_TASK_CASES_DIR, loadTaskCases, runTaskCase, scoreTaskCase, type TaskCase, type TaskDeps } from "@/server/eval/tasks";
import { bannedWords } from "@/server/route/safety";
import { fakeLlm } from "../needs/fixtures";

/* The evaluation of the model tasks beyond the route (src/server/eval/tasks.ts, decision A.17): the cases, a run, the score and the flags. */

const hasData = fs.existsSync(path.join(process.cwd(), "data", "built", "data-version.json"));
const noEmbed: TaskDeps["embed"] = async () => {
  throw new Error("no embedding service in the unit tests");
};
const deps = (llm: TaskDeps["llm"]): TaskDeps => ({ llm, catalogue: catalogue(), banned: bannedWords(), embed: noEmbed, now: () => new Date("2026-10-05T10:00:00Z"), runTag: null });

const raw: Parameters<typeof caseIssues>[0] = {
  id: "A90",
  task: "adapt",
  title: "Ośrodek pomocy, warsztaty dla seniorów",
  innovation: "inn-nat-649",
  input: { institution: "ops", place_terc: "1207062", constraints: ["budzet", "dojazd"], scale: "pilot", target_group: "seniorzy", note: null },
  expect: { mentions: { first_role: "ośrod|OPS" }, avoids: { service: "!" } },
};
const adaptCase: TaskCase = { ...raw, file: "A90.yaml", sha256: "" };

const goodPlan = {
  service_pl:
    "Ośrodek pomocy zaprasza seniorów na warsztaty komputerowe, które prowadzą uczniowie szkoły pod okiem nauczycieli. Spotkania odbywają się w szkole, a koordynator ośrodka dba o zapisy.",
  roles: ["koordynator w ośrodku pomocy: zaprasza seniorów", "nauczyciel w szkole: przygotowuje uczniów"],
  adaptations: [
    { constraint: "budzet", text_pl: "Skorzystaj z sali komputerowej szkoły zamiast kupować sprzęt dla ośrodka." },
    { constraint: "dojazd", text_pl: "Umów wspólny dojazd seniorów do szkoły z pomocą sąsiadów." },
  ],
  first_steps: ["Porozmawiaj z dyrektorem szkoły o wspólnych warsztatach.", "Zbierz w ośrodku listę seniorów chętnych do nauki.", "Ustal z nauczycielem dzień i salę na pierwsze spotkanie."],
};

describe.skipIf(!hasData)("the golden cases of tests/task-cases", () => {
  it("all load and refer only to what the data release holds", () => {
    const { cases, issues } = loadTaskCases(DEFAULT_TASK_CASES_DIR, fromDataset(loadDataset()));
    expect(issues).toEqual([]);
    expect(new Set(cases.map((c) => c.task))).toEqual(new Set(["adapt", "develop", "show", "inspire"]));
  });
});

describe("caseIssues", () => {
  it("names what a case cannot refer to or check", () => {
    const refs = catalogue();
    expect(caseIssues(raw, refs)).toEqual([]);
    expect(caseIssues({ ...raw, innovation: "inn-nie-ma" }, refs)).toContain("unknown innovation inn-nie-ma");
    expect(caseIssues({ ...raw, input: { ...raw.input!, scale: "region", constraints: ["pieniadze"] } }, refs)).toEqual(["unknown scale region", "unknown constraint pieniadze"]);
    expect(caseIssues({ ...raw, expect: { mentions: { summary: "x" }, avoids: { service: "(" } } }, refs)).toEqual([
      "mentions: adapt has no part summary",
      expect.stringMatching(/^avoids\.service: /),
    ]);
    expect(caseIssues({ ...raw, input: undefined }, refs)).toEqual(["an adapt case needs `innovation` and `input`"]);
    expect(caseIssues({ id: "D90", task: "develop", title: "Rozwiń", idea: { title: "Pomysł" }, expect: { paths_any: ["proo"] } }, refs)).toEqual([
      "the card has no similar innovations, which the app computes before develop and inspire: give `similar`",
      "an idea needs `example` or a `title` and a `description`",
      "paths are a plan's: only an adapt case checks them",
    ]);
    // The CANVAS example has none until the app computes them, so a case fixes them.
    expect(caseIssues({ id: "D91", task: "develop", title: "Rozwiń", idea: { example: 1 }, expect: {} }, refs)).toEqual([
      "the card has no similar innovations, which the app computes before develop and inspire: give `similar`",
    ]);
    expect(caseIssues({ id: "D91", task: "develop", title: "Rozwiń", idea: { example: 1, similar: [] }, expect: {} }, refs)).toEqual([]);
  });
});

describe("a run and its score", () => {
  it("counts the parts the model wrote, and passes a plan that keeps them", async () => {
    const observation = await runTaskCase(adaptCase, deps(fakeLlm(goodPlan)));
    expect(observation).toMatchObject({ source: "model", proposed: 4, kept: 4, error: null });
    expect(observation.texts.first_role).toEqual([goodPlan.roles[0]]);
    expect(observation.modelTexts.service).toEqual([goodPlan.service_pl]);
    expect(scoreTaskCase(adaptCase, observation, bannedWords())).toEqual([]);
  });

  it("fails a plan whose parts fell to the template, and says why", async () => {
    // A name and a number the data does not carry, in every part.
    const bad = { service_pl: "Fundacja Zielony Most da 5000 złotych na warsztaty dla seniorów w każdej gminie regionu.", roles: ["Fundacja Zielony Most: płaci"], adaptations: [], first_steps: ["Zadzwoń do Fundacji Zielony Most do 15 listopada."] };
    const observation = await runTaskCase(adaptCase, deps(fakeLlm(bad)));
    expect(observation.kept).toBe(0);
    expect(scoreTaskCase(adaptCase, observation)).toEqual(["kept 0 of 4 parts from the model, expected at least 3", "first_role does not mention /ośrod|OPS/"]);
  });

  it("fails a run the model never answered, and an answer that is not Polish", async () => {
    const failed = await runTaskCase(
      adaptCase,
      deps(
        fakeLlm(() => {
          throw new LlmError("unavailable", "adapt", "down");
        }),
      ),
    );
    expect(scoreTaskCase(adaptCase, failed)[0]).toBe("no answer: the call failed (unavailable)");
    const english = await runTaskCase(adaptCase, deps(fakeLlm({ ...goodPlan, first_steps: [...goodPlan.first_steps.slice(0, 2), "Please call the school and ask them about the workshops."] })));
    expect(scoreTaskCase(adaptCase, english)).toEqual([expect.stringMatching(/^polish first_steps: english/), expect.stringMatching(/^polish first_steps: not-polish/)]);
  });

  it("checks the funding paths of a plan by their ids", async () => {
    const observation = await runTaskCase(adaptCase, deps(fakeLlm(goodPlan)));
    const listed = observation.pathIds[0];
    if (!listed) return;
    expect(scoreTaskCase({ ...adaptCase, expect: { paths_exclude: [listed] } }, observation)).toEqual([`the plan lists the path ${listed}`]);
    expect(scoreTaskCase({ ...adaptCase, expect: { paths_any: ["nie-ma-takiej"] } }, observation)).toEqual(["the plan lists none of nie-ma-takiej"]);
  });

  it("scores the assistant's suggestions on an example card", async () => {
    const developCase: TaskCase = { id: "D90", task: "develop", title: "Rozwiń", idea: { example: 0 }, expect: { blocks_any: ["revenue"] }, file: "D90.yaml", sha256: "" };
    const observation = await runTaskCase(
      developCase,
      deps(
        fakeLlm({
          suggestions: [
            { block: "revenue", kind: "pytanie", text_pl: "Kto poza Tobą chce, żeby spotkania trwały dłużej niż jeden sezon?", source: null },
            { block: "partners", kind: "pytanie", text_pl: "Kto w gminie może udostępnić kuchnię na wspólne gotowanie?", source: null },
          ],
        }),
      ),
    );
    expect(observation).toMatchObject({ source: "model", proposed: 2, kept: 2, items: 2, blocks: ["revenue", "partners"] });
    expect(scoreTaskCase(developCase, observation)).toEqual([]);
  });
});

describe("parseTasksArgs", () => {
  it("reads the flags and refuses a wrong one", () => {
    expect(parseTasksArgs(["--task", "adapt", "--only", "A01,A02", "--repeat", "3", "--check"])).toMatchObject({ task: "adapt", only: ["A01", "A02"], repeat: 3, check: true });
    expect(() => parseTasksArgs(["--task", "route"])).toThrow(TasksUsageError);
    expect(() => parseTasksArgs(["--repeat", "0"])).toThrow(TasksUsageError);
    expect(() => parseTasksArgs(["--fast"])).toThrow(TasksUsageError);
  });
});
