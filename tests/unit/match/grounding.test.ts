import { describe, expect, test } from "vitest";
import { bestQuoteMatch, checkQuote, cutQuote, levenshtein, normaliseText, similarity } from "@/server/match/grounding";
import { modeFor, PARTIAL_MIN, ROUTE_MIN } from "@/server/match/thresholds";

const FIELD =
  "Osoby starsze często wycofują się z aktywnego życia, popadają w przygnębienie i apatię. Czują się osamotnione, odtrącone, niepotrzebne. Dotykają ich problemy komunikacyjne, izolacja społeczna czy trudności w realizacji spraw urzędowych.";

describe("normalisation and distance", () => {
  test("lowercase, quotes and punctuation gone, whitespace unified", () => {
    expect(normaliseText("  „Czują  się\nosamotnione”, ODTRĄCONE!  ")).toBe("czują się osamotnione odtrącone");
  });

  test("levenshtein and the ratio", () => {
    expect(levenshtein("kot", "kot")).toBe(0);
    expect(levenshtein("kot", "kit")).toBe(1);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("seniorzy", "seniorów")).toBe(2);
    expect(similarity("abcd", "abcf")).toBeCloseTo(0.75);
    expect(similarity("", "")).toBe(1);
  });
});

describe("the quote check of FR-3.4", () => {
  test("an exact quote passes with ratio 1 and keeps the record's words", () => {
    const verdict = checkQuote("popadają w przygnębienie i apatię", FIELD);
    expect(verdict).toEqual({ ok: true, ratio: 1, quote: "popadają w przygnębienie i apatię", cut: false });
  });

  test("case, quotes and punctuation do not matter", () => {
    const verdict = checkQuote("„Czują się osamotnione odtrącone niepotrzebne”", FIELD);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.quote).toBe("Czują się osamotnione, odtrącone, niepotrzebne");
  });

  test("a quote with a small typo passes at 0.8 and is replaced by the source text", () => {
    const verdict = checkQuote("popadaja w przygnębienie i apatie", FIELD);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.ratio).toBeGreaterThanOrEqual(0.8);
      expect(verdict.ratio).toBeLessThan(1);
      expect(verdict.quote).toBe("popadają w przygnębienie i apatię");
    }
  });

  test("a changed ending of one word passes", () => {
    expect(checkQuote("izolacja społeczna czy trudności w realizacji sprawy urzędowej", FIELD).ok).toBe(true);
  });

  test("a fabricated quote is not found", () => {
    const verdict = checkQuote("seniorzy dostają codziennie ciepły posiłek w świetlicy", FIELD);
    expect(verdict).toMatchObject({ ok: false, reason: "not_found" });
  });

  test("a paraphrase is not found", () => {
    expect(checkQuote("starsi ludzie bywają smutni i samotni", FIELD).ok).toBe(false);
  });

  test("a verbatim quote of more than 15 words is cut to 15, not dropped", () => {
    const sixteen = "Osoby starsze często wycofują się z aktywnego życia, popadają w przygnębienie i apatię. Czują się osamotnione";
    expect(sixteen.split(/\s+/).length).toBe(16);
    expect(checkQuote(sixteen, FIELD)).toEqual({
      ok: true,
      ratio: 1,
      quote: "Osoby starsze często wycofują się z aktywnego życia, popadają w przygnębienie i apatię. Czują się…",
      cut: true,
    });
  });

  test("the cut does not end on a short word", () => {
    expect(cutQuote("Dzieci ukraińskie w wieku szkolnym mają trudności w adaptacji w środowisku szkolnym i rówieśniczym w Polsce.")).toBe(
      "Dzieci ukraińskie w wieku szkolnym mają trudności w adaptacji w środowisku szkolnym i rówieśniczym…",
    );
  });

  test("a long paraphrase is still not found", () => {
    const verdict = checkQuote("Starsi ludzie często są smutni, samotni i niepotrzebni, a do tego mają kłopoty z załatwianiem spraw w urzędach", FIELD);
    expect(verdict).toMatchObject({ ok: false, reason: "not_found" });
  });

  test("a one-word quote grounds nothing", () => {
    expect(checkQuote("apatię", FIELD)).toMatchObject({ ok: false, reason: "empty" });
  });

  test("the best window wins over a partial one", () => {
    const match = bestQuoteMatch("trudności w realizacji spraw urzędowych", FIELD);
    expect(match).toEqual({ ratio: 1, text: "trudności w realizacji spraw urzędowych" });
  });
});

describe("the thresholds of FR-3.3", () => {
  test("mode at the boundaries", () => {
    expect(ROUTE_MIN).toBe(70);
    expect(PARTIAL_MIN).toBe(45);
    expect(modeFor(100)).toBe("route");
    expect(modeFor(70)).toBe("route");
    expect(modeFor(69)).toBe("partial");
    expect(modeFor(45)).toBe("partial");
    expect(modeFor(44)).toBe("none");
    expect(modeFor(0)).toBe("none");
    expect(modeFor(null)).toBe("none");
  });
});
