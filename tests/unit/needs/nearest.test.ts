import { describe, expect, test } from "vitest";
import type { Route, Embed, MatchNeed, MatchInput } from "@/lib/contracts";
import { LlmError, type Llm } from "@/lib/llm/types";
import { MAX_NEAREST, nearestMatches, toNearestMatches } from "@/server/needs/nearest";
import { assessment, BATHROOMS, dataset, matchResult, need, SENIORS } from "./fixtures";

/* The duplicate check of FR-5.3: nearest matches from the validated assessment, with no second model run when a result exists. */

const noModel: Llm = async () => {
  throw new Error("the model must not be called");
};
const noEmbed: Embed = async () => {
  throw new Error("the embedding service must not be called");
};
const noMatcher: MatchNeed = async () => {
  throw new Error("the matcher must not run");
};

describe("nearestMatches", () => {
  test("a given match result is reused without a model call", async () => {
    const match = matchResult([assessment(SENIORS, 30), assessment(BATHROOMS, 41)]);
    const result = await nearestMatches(need(), { llm: noModel, dataset, embed: noEmbed, matchNeed: noMatcher, match });
    expect(result.source).toBe("match");
    expect(result.stages).toEqual([]);
    expect(result.matches).toEqual([
      { innovation_id: BATHROOMS, fit_score: 41, what_fits_pl: "Odpowiada na potrzebę wsparcia w domu.", what_lacks_pl: "Nie obejmuje koordynacji pomocy sąsiedzkiej." },
      { innovation_id: SENIORS, fit_score: 30, what_fits_pl: "Odpowiada na potrzebę wsparcia w domu.", what_lacks_pl: "Nie obejmuje koordynacji pomocy sąsiedzkiej." },
    ]);
  });

  test("a stored route's solutions are reused without a model call", async () => {
    const route = {
      mode: "partial",
      solutions: [
        {
          innovation_id: BATHROOMS,
          fit_score: 55,
          fit_label_pl: "częściowe",
          fit_reasons: [{ field: "problem_pl", quote: "cytat", why_pl: "Pomaga osobom starszym w domu." }],
          gaps_pl: ["Nie działa na wsi."],
          adaptation_note_pl: null,
        },
      ],
    } as unknown as Route;
    const result = await nearestMatches(need(), { llm: noModel, dataset, embed: noEmbed, matchNeed: noMatcher, route });
    expect(result.source).toBe("route");
    expect(result.matches).toEqual([
      { innovation_id: BATHROOMS, fit_score: 55, what_fits_pl: "Pomaga osobom starszym w domu.", what_lacks_pl: "Nie działa na wsi." },
    ]);
  });

  test("a need typed straight into the bank runs the matcher on its stored text, never on reporter fields", async () => {
    const inputs: MatchInput[] = [];
    const matcher: MatchNeed = async (input) => {
      inputs.push(input);
      return matchResult([assessment(BATHROOMS, 20, [])]);
    };
    const result = await nearestMatches(need(), { llm: noModel, dataset, embed: noEmbed, matchNeed: matcher });
    expect(result.source).toBe("matcher");
    expect(inputs).toHaveLength(1);
    expect(JSON.stringify(inputs[0])).not.toMatch(/Anna|Nowak|example\.pl|Tajne/);
    expect(inputs[0].placeTerc).toBe("1216143");
    expect(result.matches[0].what_lacks_pl.length).toBeGreaterThan(0);
  });

  test("a model failure in the matcher leaves no matches and names the kind", async () => {
    const matcher: MatchNeed = async () => {
      throw new LlmError("timeout", "shortlist", "slow", "openai-compatible");
    };
    const result = await nearestMatches(need(), { llm: noModel, dataset, embed: noEmbed, matchNeed: matcher });
    expect(result).toEqual({ matches: [], source: "matcher", stages: [], failed: "timeout" });
  });
});

describe("toNearestMatches", () => {
  test("unknown ids and reasonless assessments are left out, at most three, best first", () => {
    const reasonless = { ...assessment(SENIORS, 90), fit_reasons: [] };
    const many = [assessment("inn-unknown", 99), reasonless, ...dataset.innovations.slice(0, 5).map((item, index) => assessment(item.id, 10 + index))];
    const matches = toNearestMatches(many, dataset);
    expect(matches).toHaveLength(MAX_NEAREST);
    expect(matches.map((match) => match.fit_score)).toEqual([14, 13, 12]);
  });
});
