import { describe, expect, test } from "vitest";
import { fromDataset, type Catalogue } from "@/lib/catalogue";
import type { Route, Embed, MatchNeed } from "@/lib/contracts";
import { LlmError, type LlmCall } from "@/lib/llm/types";
import { createMemoryRepository, createMemoryState } from "@/server/db/memory";
import type { Repository } from "@/server/db/repository";
import { briefForNeed, type NeedsDeps } from "@/server/needs/service";
import { savedNeedSummary } from "@/server/needs/save";
import { assessment, BATHROOMS, dataset, fakeLlm, matchResult, need, SENIORS, template } from "./fixtures";

/* The needs bank behind the handlers: the brief generated once and stored, the duplicate check on the first brief. */

const catalogue = fromDataset(dataset);
const fixturesCatalogue: Catalogue = { ...catalogue, dataset: null };
const noEmbed: Embed = async () => {
  throw new Error("not used");
};
const BRIEF = {
  title_pl: "Wsparcie rodzin po podtopieniach w gminie Zakliczyn",
  problem_pl: "Po ulewie woda weszła do wielu domów w dolinie. Rodziny zostały z tym same, bo pomoc sąsiedzka ustała.",
  gap_pl: "W sprawdzonych katalogach nie ma innowacji, które odpowiadają na tę potrzebę w pełni.",
  direction_pl: "Hipoteza do sprawdzenia: sąsiedzka sieć wsparcia może skrócić powrót rodzin do domów.",
};

function emptyRepo(): Repository {
  return createMemoryRepository({ ...createMemoryState(), needs: [] });
}

function deps(repo: Repository, over: Partial<NeedsDeps> = {}, calls: LlmCall<unknown>[] = []): Partial<NeedsDeps> {
  return {
    repo,
    llm: fakeLlm(BRIEF, calls),
    catalogue,
    embed: noEmbed,
    matchNeed: async () => matchResult([]),
    template: async (item) => template({ needId: item.id, title: item.summary_pl ?? "Tytuł" }),
    now: () => new Date("2026-10-03T12:00:00.000Z"),
    ...over,
  };
}

describe("briefForNeed", () => {
  test("generates once, stores sections and Markdown, counts brief_generated once", async () => {
    const repo = emptyRepo();
    await repo.addNeed(need({ nearest_matches: [{ innovation_id: BATHROOMS, fit_score: 30, what_fits_pl: "a", what_lacks_pl: "b" }] }));
    const calls: LlmCall<unknown>[] = [];

    const first = await briefForNeed("nd-test-1", deps(repo, {}, calls));
    expect(first?.brief.title).toBe(BRIEF.title_pl);
    expect(first?.brief.generation?.parts).toEqual(["title", "problem", "gap", "direction"]);
    expect(first?.sections.map((section) => section.key)[0]).toBe("tytul-roboczy");
    expect(first?.markdown).toContain(BRIEF.direction_pl);
    expect((await repo.getNeed("nd-test-1"))?.brief_id).toBe(first?.id);
    expect(calls).toHaveLength(1);

    const second = await briefForNeed("nd-test-1", deps(repo, {}, calls));
    expect(second).toEqual(first);
    expect(calls).toHaveLength(1);
    expect((await repo.counters()).counts).toEqual({ brief_generated: 1 });
  });

  test("an unknown need has no brief", async () => {
    expect(await briefForNeed("nd-none", deps(emptyRepo()))).toBeNull();
  });

  test("parallel requests share one generation", async () => {
    const repo = emptyRepo();
    await repo.addNeed(need());
    const calls: LlmCall<unknown>[] = [];
    const [a, b] = await Promise.all([briefForNeed("nd-test-1", deps(repo, {}, calls)), briefForNeed("nd-test-1", deps(repo, {}, calls))]);
    expect(a).toEqual(b);
    expect(calls).toHaveLength(1);
  });

  test("on the fixtures the template stands without a model call", async () => {
    const repo = emptyRepo();
    await repo.addNeed(need());
    const calls: LlmCall<unknown>[] = [];
    const stored = await briefForNeed("nd-test-1", deps(repo, { catalogue: fixturesCatalogue }, calls));
    expect(calls).toHaveLength(0);
    expect(stored?.brief.generation).toBeNull();
    expect(stored?.brief.title).toBe("Rodziny po podtopieniach zostały bez wsparcia");
  });

  test("a model error keeps the template brief, stored like any other", async () => {
    const repo = emptyRepo();
    await repo.addNeed(need());
    const failing = fakeLlm(() => {
      throw new LlmError("unavailable", "brief", "down", "openai-compatible");
    });
    const stored = await briefForNeed("nd-test-1", deps(repo, { llm: failing }));
    expect(stored?.brief.generation).toBeNull();
    expect(await repo.getBrief("nd-test-1")).toEqual(stored);
  });

  test("a need typed straight into the bank gets its nearest matches on the first brief", async () => {
    const repo = emptyRepo();
    await repo.addNeed(need());
    let runs = 0;
    const matcher: MatchNeed = async () => {
      runs += 1;
      return matchResult([assessment(SENIORS, 35)]);
    };
    const stored = await briefForNeed("nd-test-1", deps(repo, { matchNeed: matcher }));
    expect(runs).toBe(1);
    expect((await repo.getNeed("nd-test-1"))?.nearest_matches.map((match) => match.innovation_id)).toEqual([SENIORS]);
    expect(stored?.brief.matches.map((match) => match.id)).toEqual([SENIORS]);
  });

  test("a need from a route takes the route's assessments and the route's sensitive topics, with no matcher run", async () => {
    const repo = emptyRepo();
    const route = {
      id: "rt-1",
      created_at: "2026-10-03T10:00:00.000Z",
      mode: "partial",
      input: { problem_text: "x", place_terc: null, place_name: null, role: null, target_groups: [] },
      screening: { category: "need", confidence: 0.9, sensitive_topics: ["suicide"], redactions: 0, crisis_banner: true },
      solutions: [
        {
          innovation_id: BATHROOMS,
          fit_score: 52,
          fit_reasons: [{ field: "problem_pl", quote: "q", why_pl: "Pomaga w domu." }],
          gaps_pl: ["Nie działa na wsi."],
          adaptation_note_pl: null,
        },
      ],
    } as unknown as Route;
    await repo.saveRoute(route);
    await repo.addNeed(need({ route_id: "rt-1" }));
    const noMatcher: MatchNeed = async () => {
      throw new Error("the matcher must not run");
    };
    const stored = await briefForNeed("nd-test-1", deps(repo, { matchNeed: noMatcher }));
    expect((await repo.getNeed("nd-test-1"))?.nearest_matches[0]).toMatchObject({ innovation_id: BATHROOMS, what_lacks_pl: "Nie działa na wsi." });
    expect(stored?.brief.helplines).toContain("116 123");
  });
});

describe("savedNeedSummary", () => {
  const route = { input: { problem_text: "Tekst  drogi." }, need_summary_pl: "Streszczenie drogi" } as unknown as Route;
  test("the gate's summary first, the route's while the text is the route's, never the body's", () => {
    expect(savedNeedSummary("Streszczenie bramki", route, "Tekst drogi.")).toBe("Streszczenie bramki");
    expect(savedNeedSummary(null, route, "Tekst drogi.")).toBe("Streszczenie drogi");
    expect(savedNeedSummary(null, route, "Inny tekst.")).toBeNull();
    expect(savedNeedSummary("Pisz na jan@example.pl", null, "x")).toBe("Pisz na [usunięto]");
  });
});
