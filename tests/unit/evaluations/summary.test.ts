import { describe, expect, it } from "vitest";
import type { Evaluation } from "@/lib/contracts";
import { isRating, summarise } from "@/server/evaluations";

function evaluation(over: Partial<Evaluation>): Evaluation {
  return {
    id: "oc-1",
    created_at: "2026-10-03T10:00:00.000Z",
    innovation_id: "inn-1",
    rating: null,
    experience: null,
    feedback: null,
    improvement: null,
    test_signup: null,
    author: { display_name: null, email: null },
    consents: { store: true, contact: false, text_version: "v1", timestamp: "2026-10-03T10:00:00.000Z" },
    moderation: { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null },
    forwarded_at: null,
    retention_until: "2027-10-03",
    note_pl: null,
    ...over,
  };
}

describe("the evaluation summary of module IV", () => {
  it("counts ratings, testers and improvements, with the average to one decimal", () => {
    const summary = summarise([
      evaluation({ rating: 5 }),
      evaluation({ rating: 4, improvement: "Krótsza instrukcja." }),
      evaluation({ rating: 4, test_signup: { as: "wdrazajacy", place_terc: null } }),
      evaluation({ test_signup: { as: "uzytkownik", place_terc: "1261011" } }),
    ]);
    expect(summary).toEqual({ ratings: 3, average: 4.3, testers: 2, improvements: 1 });
  });

  it("leaves out the evaluations ROPS rejected in the panel", () => {
    const rejected = { status: "odrzucone" as const, reviewer: "AT", decided_at: "2026-10-03T11:00:00.000Z", reason_pl: "Inny powód" };
    expect(summarise([evaluation({ rating: 5 }), evaluation({ rating: 1, moderation: rejected })])).toMatchObject({ ratings: 1, average: 5 });
  });

  it("has no average without a rating", () => {
    expect(summarise([evaluation({ feedback: "Dobre." })])).toEqual({ ratings: 0, average: null, testers: 0, improvements: 0 });
    expect(summarise([])).toEqual({ ratings: 0, average: null, testers: 0, improvements: 0 });
  });

  it("takes only whole ratings from 1 to 5", () => {
    expect([1, 3, 5].every(isRating)).toBe(true);
    expect([0, 6, 2.5, "4", null].some(isRating)).toBe(false);
  });
});
