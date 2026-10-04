import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Route } from "@/lib/contracts";
import { getExampleRoute } from "@/lib/mock/routes";
import { demoCount, questions, queueCounts, trends } from "@/server/admin/data";
import { buildDemo, readDemoSources, withDemoData, type DemoSources } from "@/server/db/demo";
import { createMemoryRepository, createMemoryState } from "@/server/db/memory";
import { evaluationSummary } from "@/server/evaluations";
import { similarCasesForRoute } from "@/server/match/similar-cases";

const NOW = Date.parse("2026-10-03T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const example = getExampleRoute("przyklad-seniorzy")!;
const groups = ["seniorzy", "dzieci-mlodziez-rodziny", "bezdomnosc"];

/** A small bank: ten questions per group, each with the example route, and the texts of every record kind. */
function sources(): DemoSources {
  const questions = groups.flatMap((group) =>
    Array.from({ length: 10 }, (_, index) => ({ id: `${group}-${index}`, category: group, place_terc: "1261011" })),
  );
  const runs = new Map(
    questions.map((question) => [
      question.id,
      { question_id: question.id, route: { ...example, question_groups: [question.category] } as Route, nearest: [] },
    ]),
  );
  const person = { display_name: "Anna W." };
  return {
    questions,
    runs,
    ideaSimilar: { PM01: [] },
    records: {
      ideas: [
        {
          id: "PM01",
          kind: "pomysl",
          stage: "pomysl",
          target_groups: ["seniorzy"],
          author: { ...person, is_organisation: false },
          title: "Pomysł",
          description: "Opis.",
          essence: "Istota.",
          for_whom: "Dla kogo.",
          reply_pl: "Odpowiedź.",
        },
      ],
      contacts: [
        { id: "KT01", target: "innovation", group: "seniorzy", requester: { name: "Anna W.", organisation: null }, message: "Prośba." },
        { id: "KT02", target: "advisor", group: "bezdomnosc", requester: { name: "Jan K.", organisation: "Fundacja" }, message: "Pytanie." },
      ],
      readiness: [{ id: "GT01", display_name: "Ośrodek Pomocy Społecznej", topics: ["seniorzy"] }],
      mentors: [{ id: "MT01", name: "Ekspertka", expertise_pl: "Rodziny.", target_groups: ["dzieci-mlodziez-rodziny"] }],
      posts: [
        {
          id: "PP01",
          kind: "szukam",
          sector: "ngo",
          seeking: ["biznes"],
          target_groups: ["seniorzy"],
          author: { ...person, organisation: "Fundacja" },
          title: "Ogłoszenie",
          description: "Treść ogłoszenia.",
        },
      ],
      threads: [
        {
          id: "RZ01",
          topic: "mentor",
          subject: "Rozmowa",
          author: { ...person, organisation: null, sector: "mieszkaniec" },
          target_groups: ["seniorzy"],
          mentor: "MT01",
          post: null,
          messages: [
            { author: "uzytkownik", text: "Pytanie." },
            { author: "rops", text: "Odpowiedź." },
          ],
        },
      ],
      reports: [{ id: "ZG01", target: "innovation", reason: "inne", comment: null }],
      moderation_reasons_pl: ["Powód."],
      notes_pl: ["Notatka."],
      evaluations: [
        {
          id: "OP01",
          innovation_id: "inn-nat-649",
          rating: 5,
          experience: "korzystam",
          feedback: "Dobre.",
          improvement: null,
          test_signup: { as: "uzytkownik" },
          author: person,
        },
      ],
    },
  };
}

function demoRepository() {
  const state = createMemoryState();
  const demo = buildDemo(sources(), NOW);
  for (const route of demo.routes) state.routes.set(route.id, route);
  const repo = createMemoryRepository({
    ...state,
    needs: [...state.needs, ...demo.needs],
    ideas: [...state.ideas, ...demo.ideas],
    evaluations: demo.evaluations,
    readiness: [...state.readiness, ...demo.readiness],
    contacts: demo.contacts,
    posts: [...state.posts, ...demo.posts],
    threads: [...state.threads, ...demo.threads],
    reports: demo.reports,
  });
  return { repo, demo };
}

describe("the demonstration data of the panel", () => {
  it("is the same for the same sources and moment", () => {
    expect(buildDemo(sources(), NOW)).toEqual(buildDemo(sources(), NOW));
  });

  it("marks every record and keeps every date inside the twelve weeks before the moment", () => {
    const demo = buildDemo(sources(), NOW);
    const records = [...demo.routes, ...demo.needs, ...demo.ideas, ...demo.evaluations, ...demo.contacts, ...demo.readiness, ...demo.mentors, ...demo.posts, ...demo.threads, ...demo.reports];
    expect(records.length).toBeGreaterThan(30);
    expect(records.every((record) => record.demo === true)).toBe(true);
    const dates = [...demo.routes, ...demo.needs, ...demo.ideas, ...demo.evaluations, ...demo.contacts, ...demo.readiness, ...demo.posts, ...demo.reports].map((record) => Date.parse(record.created_at));
    expect(Math.min(...dates)).toBeGreaterThanOrEqual(NOW - 12 * 7 * DAY);
    expect(Math.max(...dates, ...demo.log.map((entry) => Date.parse(entry.ts)))).toBeLessThan(NOW);
    expect(new Set(records.map((record) => record.id)).size).toBe(records.length);
  });

  it("thins the homelessness questions and asks some seniors' and families' questions twice", () => {
    const { routes } = buildDemo(sources(), NOW);
    const count = (group: string) => routes.filter((route) => route.question_groups?.includes(group)).length;
    expect(count("bezdomnosc")).toBe(8);
    expect(count("seniorzy")).toBe(20);
    expect(count("dzieci-mlodziez-rodziny")).toBe(20);
  });

  it("gives contacts only reserved example addresses and keeps a person's place in every section", () => {
    const demo = buildDemo(sources(), NOW);
    expect(demo.contacts.every((item) => item.requester.email.endsWith("@example.org"))).toBe(true);
    const places = new Set([...demo.ideas.map((item) => item.place_terc), ...demo.threads.filter((item) => item.author.display_name === "Anna W.").map((item) => item.place_terc)]);
    expect(places.size).toBe(1);
  });

  it("leaves a fresh store unchanged when the source files are missing", () => {
    const state = createMemoryState();
    const before = state.routes.size + state.needs.length;
    const root = mkdtempSync(path.join(tmpdir(), "demo-"));
    expect(withDemoData(state, NOW, root)).toBe(state);
    expect(state.routes.size + state.needs.length).toBe(before);
  });

  it("reads the three files from data/built/ only: the hand-written ones in data/curated/ switch nothing on", () => {
    const root = mkdtempSync(path.join(tmpdir(), "demo-"));
    const write = (folder: string, file: string, text: string) => {
      mkdirSync(path.join(root, "data", folder), { recursive: true });
      writeFileSync(path.join(root, "data", folder, file), text);
    };
    write("curated", "demo-questions.yaml", "questions: []\n");
    write("curated", "demo-records.yaml", "ideas: []\n");
    write("built", "demo-routes.json", '{"entries": []}');
    expect(readDemoSources(root)).toBeNull();

    write("built", "demo-questions.yaml", "questions: []\n");
    write("built", "demo-records.yaml", "ideas: []\n");
    expect(readDemoSources(root)).toMatchObject({ questions: [], ideaSimilar: {}, records: { ideas: [] } });
  });
});

describe("panel only: the demonstration data stays off the public pages", () => {
  it("leaves the innovation's numbers to the real evaluations, unless the panel asks", async () => {
    const { repo } = demoRepository();
    expect((await evaluationSummary("inn-nat-649", repo)).ratings).toBe(0);
    expect((await evaluationSummary("inn-nat-649", repo, true)).ratings).toBe(1);
  });

  it("never offers a simulated need or idea as a similar case of a route", async () => {
    const { repo, demo } = demoRepository();
    const cases = await similarCasesForRoute(demo.routes[0], repo);
    const ids = new Set([...demo.needs, ...demo.ideas].map((item) => item.id));
    expect(cases.shown.some((item) => ids.has(item.id))).toBe(false);
  });

  it("counts the simulated records for the banner and always in the trends and questions of the panel", async () => {
    const { repo, demo } = demoRepository();
    expect(await demoCount(repo)).toBeGreaterThan(30);
    const data = await trends(repo);
    expect(data.totals.routes).toBe(demo.routes.length);
    expect(data.totals.needs).toBe((await repo.listNeeds()).length);
    expect((await questions({}, repo)).length).toBe(demo.routes.filter((route) => route.mode !== "declined" && route.mode !== "off_topic").length);
    expect((await queueCounts(null, repo, NOW)).find((queue) => queue.key === "threads")!.waiting).toBeGreaterThanOrEqual(0);
  });
});
