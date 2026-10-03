import { describe, expect, it } from "vitest";
import type { Idea, Need } from "@/lib/contracts";
import { exampleIdeas, exampleNeeds } from "@/server/db/examples";
import { findSimilarCases, MAX_SHOWN } from "@/server/match/similar-cases";

const approved = { status: "zatwierdzone" as const, reviewer: "AT", decided_at: "2026-10-03T10:00:00.000Z", reason_pl: null };
const pending = { status: "do-weryfikacji" as const, reviewer: null, decided_at: null, reason_pl: null };

function need(id: string, text: string, over: Partial<Need> = {}): Need {
  const base = exampleNeeds()[1];
  return {
    ...base,
    id,
    route_id: null,
    problem_text: text,
    summary_pl: text,
    target_groups: [],
    moderation: approved,
    consents: { ...base.consents, publish_anonymised: true },
    nearest_matches: [],
    ...over,
  };
}

function idea(id: string, over: Partial<Idea> = {}): Idea {
  return { ...exampleIdeas()[0], id, moderation: approved, consents: { ...exampleIdeas()[0].consents, publish: true }, ...over };
}

const query = { text: "Samotni seniorzy w naszej wsi nie mają gdzie spotykać się w ciągu dnia.", targetGroups: ["seniorzy"], routeId: "rt-1" };

describe("similar cases of a route (module I)", () => {
  it("finds the needs and the idea cards close to the query, best first", () => {
    const cases = findSimilarCases(
      query,
      [
        need("nd-seniorzy", "Samotni seniorzy w gminie wiejskiej, brak miejsca spotkań w ciągu dnia.", { target_groups: ["seniorzy"] }),
        need("nd-mlodziez", "Młodzież nie ma gdzie się spotykać po lekcjach."),
        need("nd-drogi", "Dziurawa droga do szkoły w sołectwie."),
      ],
      [idea("pm-gotowanie")],
    );
    expect(cases.shown.map((item) => item.id)[0]).toBe("nd-seniorzy");
    expect(cases.shown.map((item) => item.id)).toContain("pm-gotowanie");
    expect(cases.shown.map((item) => item.id)).not.toContain("nd-drogi");
    expect(cases.hiddenCount).toBe(0);
  });

  it("shows only what was approved with consent, counts the rest, and never shows the author's own words", () => {
    const words = "Samotni seniorzy w gminie, brak miejsca spotkań w ciągu dnia.";
    const cases = findSimilarCases(
      query,
      [
        need("nd-zgoda", words, { summary_pl: "Osoby starsze w gminie wiejskiej nie mają miejsca spotkań w ciągu dnia." }),
        need("nd-bez-zgody", words, { consents: { ...exampleNeeds()[0].consents, publish_anonymised: false } }),
        need("nd-czeka", words, { moderation: pending }),
        need("nd-bez-streszczenia", words, { summary_pl: null }),
      ],
      [idea("pm-czeka", { moderation: pending })],
    );
    expect(cases.shown.map((item) => item.id)).toEqual(["nd-zgoda"]);
    expect(cases.shown[0].title).toBe("Osoby starsze w gminie wiejskiej nie mają miejsca spotkań w ciągu dnia.");
    expect(cases.hiddenCount).toBe(4);
  });

  it("leaves out the need saved from the same route, and needs two shared words", () => {
    const cases = findSimilarCases(
      query,
      [need("nd-ta-droga", "Samotni seniorzy w naszej wsi.", { route_id: "rt-1" }), need("nd-jedno-slowo", "Seniorzy potrzebują transportu do lekarza.")],
      [],
    );
    expect(cases.shown).toEqual([]);
    expect(cases.hiddenCount).toBe(0);
  });

  it("shows at most three cases, with how a need went on", () => {
    const needs = [1, 2, 3, 4, 5].map((n) =>
      need(`nd-${n}`, `Samotni seniorzy we wsi ${n}, brak spotkań w ciągu dnia.`, {
        status: "temat-naboru",
        nearest_matches: [{ innovation_id: "inn-nat-649", fit_score: 60, what_fits_pl: "a", what_lacks_pl: "b" }],
      }),
    );
    const cases = findSimilarCases(query, needs, []);
    expect(cases.shown).toHaveLength(MAX_SHOWN);
    expect(cases.shown[0]).toMatchObject({ kind: "need", state: "temat-naboru", innovation_ids: ["inn-nat-649"] });
    expect(cases.hiddenCount).toBe(0);
  });

  it("finds nothing for an empty query or an empty bank", () => {
    expect(findSimilarCases({ ...query, text: " " }, [need("nd-1", "Samotni seniorzy")], [])).toEqual({ shown: [], hiddenCount: 0 });
    expect(findSimilarCases(query, [], [])).toEqual({ shown: [], hiddenCount: 0 });
  });
});
