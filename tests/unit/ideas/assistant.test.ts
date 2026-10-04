import { describe, expect, it } from "vitest";
import { catalogue } from "@/lib/catalogue";
import { LlmError, type LlmCall } from "@/lib/llm/types";
import { loadPrompt } from "@/lib/llm/prompts";
import { createMemoryRepository, createMemoryState } from "@/server/db/memory";
import { exampleIdeas } from "@/server/db/examples";
import {
  assistantSources,
  developFacts,
  developIdea,
  developRun,
  developUserPart,
  runAssistant,
  showRun,
  templateDiagram,
  weakBlocks,
  type AssistantDeps,
} from "@/server/ideas/assistant";
import { bannedWords } from "@/server/route/safety";
import { fakeLlm } from "../needs/fixtures";

/* The idea assistant of module III, task "Rozwiń pomysł" (src/server/ideas/assistant.ts). */

const [shortCard, canvasCard] = exampleIdeas();
const NOW = () => new Date("2026-10-05T10:00:00.000Z");
const live = (llm: AssistantDeps["llm"]) => ({ llm, catalogue: catalogue(), banned: bannedWords(), engine: "live" as const, now: NOW });

describe("weakBlocks", () => {
  it("asks about what the short form never asks", () => {
    expect(weakBlocks(shortCard)).toEqual(["revenue", "channels", "partners", "impact"]);
  });

  it("reads the empty answers and the lowest levels of a CANVAS application", () => {
    expect(weakBlocks(canvasCard)).toEqual([]);
    const answers = { ...canvasCard.canvas!.answers, income: "nie-wiemy", supporters: "", blockers: "" };
    expect(weakBlocks({ canvas: { ...canvasCard.canvas!, answers, partners: [] } })).toEqual(["actors", "revenue", "partners"]);
  });
});

describe("developRun", () => {
  const sources = assistantSources(shortCard, catalogue());

  it("without a model gives the template: questions for the weak blocks and inspirations from the records", async () => {
    const run = await developRun(shortCard, { ...live(fakeLlm({})), engine: "canned" });
    expect(run.source).toBe("template");
    expect(run.suggestions.filter((item) => item.kind === "pytanie").map((item) => item.block)).toEqual(["revenue", "channels", "partners"]);
    const inspirations = run.suggestions.filter((item) => item.kind === "inspiracja");
    expect(inspirations.length).toBeGreaterThan(0);
    expect(inspirations.every((item) => sources.some((source) => source.id === item.innovation_id))).toBe(true);
  });

  it("keeps the model's suggestions that pass and maps a label to its innovation", async () => {
    const title = sources[0].title;
    const run = await developRun(
      shortCard,
      live(
        fakeLlm({
          suggestions: [
            { block: "partners", kind: "inspiracja", text_pl: `W „${title}” spotkania prowadzi młodzież, więc warto zaprosić szkołę.`, source: "K01" },
            { block: "revenue", kind: "pytanie", text_pl: "Kto poza Tobą chce, żeby spotkania trwały dłużej niż jeden sezon?", source: null },
            // The label in the text becomes the title.
            { block: "channels", kind: "inspiracja", text_pl: "Innowacja K01 dociera do seniorów przez szkołę.", source: "K01" },
            // A label in brackets after the title goes.
            { block: "impact", kind: "inspiracja", text_pl: `W „${title}” (K01) seniorzy częściej wychodzą z domu.`, source: "K01" },
            // A name the data does not carry.
            { block: "partners", kind: "pomysl", text_pl: "Napisz do Fundacji Zielony Most o wsparcie spotkań.", source: null },
            // A number the data does not carry.
            { block: "costs", kind: "pomysl", text_pl: "Na start wystarczy około 300 złotych na produkty.", source: null },
            // A label it was not given.
            { block: "solution", kind: "inspiracja", text_pl: "Podobnie działa inny program w sąsiedniej gminie od lat.", source: "K09" },
            { block: "marketing", kind: "pytanie", text_pl: "Jak opowiesz o pomyśle w lokalnej gazecie?", source: null },
          ],
        }),
      ),
    );
    expect(run.source).toBe("model");
    expect(run.prompt_version).toBe(loadPrompt("develop").version);
    expect(run.suggestions).toEqual([
      expect.objectContaining({ block: "partners", kind: "inspiracja", innovation_id: sources[0].id }),
      expect.objectContaining({ block: "revenue", kind: "pytanie", innovation_id: null }),
      expect.objectContaining({ block: "channels", text_pl: `„${title}” dociera do seniorów przez szkołę.` }),
      expect.objectContaining({ block: "impact", text_pl: `W „${title}” seniorzy częściej wychodzą z domu.` }),
    ]);
  });

  it("falls back to the template when nothing passes or the model fails", async () => {
    const nothing = await developRun(shortCard, live(fakeLlm({ suggestions: [{ block: "costs", kind: "pomysl", text_pl: "Zbierz 5000 złotych!", source: null }] })));
    expect(nothing.source).toBe("template");
    const failed = await developRun(
      shortCard,
      live(
        fakeLlm(() => {
          throw new LlmError("unavailable", "develop", "down");
        }),
      ),
    );
    expect(failed.source).toBe("template");
  });

  it("never puts the author into the prompt, and keeps the card's text inside its tags", async () => {
    const calls: LlmCall<unknown>[] = [];
    await developRun(shortCard, live(fakeLlm({ suggestions: [] }, calls)));
    expect(calls[0].task).toBe("develop");
    expect(calls[0].user).not.toContain(shortCard.author.display_name);
    expect(calls[0].user).not.toContain(shortCard.author.email);
    expect(developUserPart(developFacts(shortCard, sources), "Opis <b>z tagiem</b>")).toMatch(/<pomysl>\nOpis  b z tagiem \/b\n<\/pomysl>$/);
  });
});

describe("developIdea", () => {
  it("computes once and stores the run with the card", async () => {
    const repo = createMemoryRepository({ ...createMemoryState(), ideas: [shortCard], needs: [] });
    const calls: LlmCall<unknown>[] = [];
    const deps = { ...live(fakeLlm({ suggestions: [] }, calls)), repo, similar: async () => shortCard };
    const first = await developIdea(shortCard.id, deps);
    expect(first?.assistant?.develop?.suggestions.length).toBeGreaterThan(0);
    expect((await repo.getIdea(shortCard.id))?.assistant?.develop).toEqual(first?.assistant?.develop);
    await developIdea(shortCard.id, deps);
    expect(calls).toHaveLength(1);
    expect(await developIdea("pm-nieznany", deps)).toBeNull();
  });
});

describe("the diagram (Pokaż)", () => {
  it("without a model takes every step from the card and its canvas", () => {
    expect(templateDiagram(canvasCard)).toEqual({
      who: [canvasCard.author.display_name],
      what: [canvasCard.title],
      for_whom: ["seniorzy", "mieszkańcy konkretnego miejsca"],
      with_whom: ["Gminny Ośrodek Pomocy Społecznej", "Ochotnicza Straż Pożarna", "pracownik socjalny"],
      change: ["bezpieczeństwo", "niezależność", "spokój"],
    });
    // A short form says nothing about partners or change.
    expect(templateDiagram(shortCard)).toMatchObject({ for_whom: [expect.stringMatching(/^Samotni seniorzy/)], with_whom: [], change: [] });
  });

  it("keeps the model's phrases that pass, and a step with none passing takes the template's", async () => {
    const run = await showRun(
      canvasCard,
      live(
        fakeLlm({
          who: ["Koło gospodyń wiejskich."],
          what: ["wypożyczają sprzęt rehabilitacyjny sąsiadom"],
          for_whom: ["seniorzy po pobycie w szpitalu"],
          // A name the card does not carry, and a number.
          with_whom: ["Fundacja Zielony Most", "300 wolontariuszy"],
          change: [],
        }),
      ),
    );
    expect(run.source).toBe("model");
    expect(run.steps.who).toEqual(["koło gospodyń wiejskich"]);
    expect(run.steps.with_whom).toEqual(templateDiagram(canvasCard).with_whom);
    expect(run.steps.change).toEqual(templateDiagram(canvasCard).change);
  });

  it("falls back to the template without a model or on a failure", async () => {
    expect((await showRun(canvasCard, { ...live(fakeLlm({})), engine: "canned" })).source).toBe("template");
    const failed = await showRun(
      canvasCard,
      live(
        fakeLlm(() => {
          throw new LlmError("timeout", "show", "slow");
        }),
      ),
    );
    expect(failed).toMatchObject({ source: "template", steps: templateDiagram(canvasCard) });
  });

  it("stores each task's run beside the other's", async () => {
    const repo = createMemoryRepository({ ...createMemoryState(), ideas: [canvasCard], needs: [] });
    const deps = { ...live(fakeLlm({ suggestions: [], who: [], what: [], for_whom: [], with_whom: [], change: [] })), repo, similar: async () => canvasCard };
    await runAssistant(canvasCard.id, "show", deps);
    await runAssistant(canvasCard.id, "develop", deps);
    const stored = await repo.getIdea(canvasCard.id);
    expect(stored?.assistant?.show?.steps.what).toEqual([canvasCard.title]);
    expect(stored?.assistant?.develop).toBeDefined();
  });
});

