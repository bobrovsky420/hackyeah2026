import { describe, expect, test } from "vitest";
import { t } from "@/lib/i18n";
import { LlmError, type LlmCall } from "@/lib/llm/types";
import { generateBrief, type BriefOutput } from "@/server/needs/brief";
import { knownText, unknownNames } from "@/server/needs/checks";
import { BRIEF_SECTION_KEYS, briefSections, sectionsToMarkdown } from "@/server/needs/sections";
import { BATHROOMS, dataset, fakeLlm, need, template } from "./fixtures";

/* The brief of FR-5.5: the model's prose on top of the template, each part checked, the template standing wherever a part fails. */

const GOOD: BriefOutput = {
  title_pl: "Wsparcie rodzin po podtopieniach w gminie Zakliczyn.",
  problem_pl:
    "Po ulewie woda weszła do wielu domów w dolinie. Rodziny suszą ściany, a dzieci nocują u krewnych. Pomoc sąsiedzka z pierwszych dni ustała i nikt jej nie koordynuje.",
  gap_pl:
    "W katalogach innowacji społecznych nie ma rozwiązania, które odpowiada na tę potrzebę. Nowe rozwiązanie nie powielałoby innowacji już wdrożonych w Polsce.",
  direction_pl:
    "Hipoteza do sprawdzenia: sąsiedzka sieć wsparcia koordynowana przez gminę może skrócić czas powrotu rodzin do domów. Warto przetestować ją w małej skali.",
};

const failing = fakeLlm(() => {
  throw new LlmError("unavailable", "brief", "down", "openai-compatible");
});

describe("generateBrief", () => {
  test("the model's prose fills the four parts and the sections keep the order of FR-5.5", async () => {
    const calls: LlmCall<unknown>[] = [];
    const { brief, stage } = await generateBrief(need(), { llm: fakeLlm(GOOD, calls), dataset, template: template() });

    expect(brief.title).toBe("Wsparcie rodzin po podtopieniach w gminie Zakliczyn");
    expect(brief.problem).toBe(GOOD.problem_pl);
    expect(brief.gapText).toBe(GOOD.gap_pl);
    expect(brief.direction).toBe(GOOD.direction_pl);
    expect(brief.generation).toEqual({ promptVersion: "brief-v1", provider: "fake", model: "fake-model", parts: ["title", "problem", "gap", "direction"], notes: [] });
    expect(stage?.notes).toEqual([]);
    expect(calls[0].task).toBe("brief");
    expect(calls[0].promptVersion).toBe("brief-v1");

    const sections = briefSections(brief, dataset.department);
    expect(sections.map((section) => section.key)).toEqual([...BRIEF_SECTION_KEYS]);
    const text = Object.fromEntries(sections.map((section) => [section.key, section.text]));
    expect(text["tytul-roboczy"]).toBe(brief.title);
    expect(text.problem).toBe(GOOD.problem_pl);
    expect(text["co-juz-istnieje"]).toContain(t("brief.existing.question"));
    expect(text["co-juz-istnieje"]).toContain(t("brief.existing.none"));
    expect(text.luka).toBe(GOOD.gap_pl);
    expect(text["kierunek-rozwiazania"]).toBe(GOOD.direction_pl);
    expect(text.stopka).toContain(t("attribution.note"));

    const markdown = sectionsToMarkdown(sections);
    const headings = [...markdown.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(headings).toEqual([
      t("brief.titleLabel"),
      t("brief.problem.title"),
      t("brief.whom.title"),
      t("brief.existing.title"),
      t("brief.gap.title"),
      t("brief.direction.title"),
      t("brief.partners.title"),
      t("brief.paths.title"),
      t("brief.sources.title"),
    ]);
  });

  test("the prompt carries no reporter field and no note; the need text is inside <potrzeba>", async () => {
    const calls: LlmCall<unknown>[] = [];
    await generateBrief(need(), { llm: fakeLlm(GOOD, calls), dataset, template: template() });
    const user = calls[0].user;
    for (const leak of ["Anna", "Nowak", "anna.nowak@example.pl", "Stowarzyszenie Tajne", "Notatka konsoli"]) expect(user).not.toContain(leak);
    expect(user).toMatch(/<potrzeba>\nPo ulewie woda weszła[\s\S]*<\/potrzeba>$/);
    // The model sees the scale in words, never the numbers (9.4).
    expect(user).toContain("wyższy niż mediana Małopolski");
    expect(user).not.toContain("42");
  });

  test("a model error leaves the template brief and the stage says so", async () => {
    const base = template();
    const { brief, stage } = await generateBrief(need(), { llm: failing, dataset, template: base });
    expect(brief.title).toBe(base.title);
    expect(brief.problem).toBe(base.problem);
    expect(brief.gapText).toBeNull();
    expect(brief.direction).toBeNull();
    expect(brief.generation).toBeNull();
    expect(stage?.notes).toEqual(["model failed (unavailable): template brief"]);
    const sections = briefSections(brief, dataset.department);
    expect(sections.map((section) => section.key)).toEqual([...BRIEF_SECTION_KEYS]);
    expect(sections.find((section) => section.key === "kierunek-rozwiazania")?.text).toBe(t("brief.direction.text"));
    expect(sections.find((section) => section.key === "luka")?.text).toBe(t("brief.gap.none"));
  });

  test("a banned word, an amount, a new name or a direction that is no hypothesis each put back the part's template", async () => {
    const base = template();
    const { brief, stage } = await generateBrief(need(), {
      llm: fakeLlm({
        title_pl: GOOD.title_pl,
        problem_pl: "W dolinie mieszkają rodziny dysfunkcyjne, które nie radzą sobie po ulewie i potrzebują wsparcia.",
        gap_pl: "Brakuje funduszu w wysokości 50 000 zł na osuszanie domów w dolinie i na pomoc rodzinom.",
        direction_pl: "Gmina powinna zatrudnić koordynatora pomocy sąsiedzkiej dla rodzin w dolinie.",
      }),
      dataset,
      template: base,
    });
    expect(brief.title).toBe("Wsparcie rodzin po podtopieniach w gminie Zakliczyn");
    expect(brief.problem).toBe(base.problem);
    expect(brief.gapText).toBeNull();
    expect(brief.direction).toBeNull();
    expect(brief.generation?.parts).toEqual(["title"]);
    expect(stage?.notes).toEqual([
      "problem templated: banned:stigmatising",
      "gap templated: amount-or-date",
      "direction templated: not-hypothesis",
    ]);

    const named = await generateBrief(need(), {
      llm: fakeLlm({ ...GOOD, direction_pl: "Hipoteza do sprawdzenia: pomoc mogłaby koordynować pani Jadwiga Kowalska z Fundacji Dunajec." }),
      dataset,
      template: base,
    });
    expect(named.brief.direction).toBeNull();
    expect(named.stage?.notes).toEqual(["direction templated: new-name"]);

    const copied = await generateBrief(need(), {
      llm: fakeLlm({ ...GOOD, problem_pl: `${need().problem_text} Rodziny potrzebują wsparcia.` }),
      dataset,
      template: base,
    });
    expect(copied.brief.problem).toBe(base.problem);
    expect(copied.stage?.notes).toEqual(["problem templated: copied-need-text"]);
  });

  test("a sensitive topic adds the support lines under the problem", async () => {
    const { brief } = await generateBrief(need(), { llm: failing, dataset, template: template(), sensitiveTopics: ["suicide"] });
    expect(brief.helplines).toContain("116 123");
    const problem = briefSections(brief, dataset.department).find((section) => section.key === "problem");
    expect(problem?.text).toContain(brief.helplines);
  });

  test("a need without a route gets its duplicate check from the stored nearest matches", async () => {
    const stored = need({
      nearest_matches: [{ innovation_id: BATHROOMS, fit_score: 38, what_fits_pl: "Pomaga w domu.", what_lacks_pl: "Nie koordynuje pomocy." }],
    });
    const { brief } = await generateBrief(stored, { llm: failing, dataset, template: template() });
    expect(brief.matches.map((match) => match.id)).toEqual([BATHROOMS]);
    expect(brief.matches[0].lacks).toEqual(["Nie koordynuje pomocy."]);
    expect(brief.gaps).toEqual(["Nie koordynuje pomocy."]);
    expect(brief.sources[0].title).toBe(dataset.innovationById.get(BATHROOMS)?.title);
  });
});

describe("the name check", () => {
  test("inflected names from the input pass, new ones do not, a sentence's first word is no name", () => {
    const known = knownText("Zakliczyn", "Kraków");
    expect(unknownNames("Rodziny w Zakliczynie i w Krakowie. Ludzie czekają.", known)).toEqual([]);
    expect(unknownNames("Pomoc da Jan Kowalski nad Dunajcem.", known)).toEqual(["Jan", "Kowalski", "Dunajcem"]);
    expect(unknownNames("„Hipoteza” brzmi prosto. Wsparcie ROPS w Małopolsce.", known)).toEqual([]);
    // Kinds of local institution are no names (the live C09 brief of 29 September 2026 was dropped on "OSP").
    expect(unknownNames("Współpraca gminy, OSP, KGW i GOPS.", known)).toEqual([]);
  });
});
