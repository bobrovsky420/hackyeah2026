import { describe, expect, it } from "vitest";
import { REDACTED, redact, applySpans, locateNames } from "@/server/gate/redaction";
import { findPatternSpans, isPesel, mergeSpans, mostlyLinks } from "@/server/gate/patterns";

const typesOf = (text: string) => findPatternSpans(text).map((span) => [span.type, text.slice(span.start, span.end)]);

describe("PESEL (FR-12.1)", () => {
  it("accepts a valid checksum and rejects an invalid one", () => {
    expect(isPesel("44051401359")).toBe(true);
    expect(isPesel("44051401358")).toBe(false);
    expect(isPesel("4405140135")).toBe(false);
  });

  it("finds only eleven digits with a valid checksum", () => {
    expect(typesOf("PESEL 44051401359 w tekście")).toEqual([["pesel", "44051401359"]]);
    expect(typesOf("numer 44051401358 w tekście")).toEqual([]);
    expect(typesOf("numer 440514013591 w tekście")).toEqual([]);
  });
});

describe("phone numbers", () => {
  it.each([
    ["600 100 200", "600 100 200"],
    ["600-100-200", "600-100-200"],
    ["600100200", "600100200"],
    ["+48 600 100 200", "+48 600 100 200"],
    ["0048600100200", "0048600100200"],
    ["12 345 67 89", "12 345 67 89"],
    ["(12) 345 67 89", "(12) 345 67 89"],
  ])("finds %s", (phone, found) => {
    expect(typesOf(`Proszę dzwonić: ${phone}, dziękuję.`)).toEqual([["phone", found]]);
  });

  it("leaves years, amounts and short numbers", () => {
    expect(typesOf("W 2026 roku gmina wydała 120 000 zł na 35 osób.")).toEqual([]);
  });
});

describe("e-mail addresses", () => {
  it("finds an address and not the digits inside it as a phone", () => {
    expect(typesOf("Pisz na jan.kowalski600100200@poczta.pl lub dzwoń.")).toEqual([["email", "jan.kowalski600100200@poczta.pl"]]);
  });
});

describe("street addresses with a house number", () => {
  it.each([
    "ul. Długa 5",
    "ul. Jana Pawła II 12/4",
    "ulica Mickiewicza 3a",
    "al. Solidarności 17",
    "os. Tysiąclecia 22",
    "plac Wolnica 9",
  ])("finds %s", (address) => {
    expect(typesOf(`Mieszka przy ${address}, obok sklepu.`)).toEqual([["address", address]]);
  });

  it("leaves a street named without a house number", () => {
    expect(typesOf("Na ulicy Długiej brakuje ławek.")).toEqual([]);
  });
});

describe("spans", () => {
  it("keeps the first of overlapping spans", () => {
    const merged = mergeSpans([
      { type: "phone", start: 5, end: 10 },
      { type: "address", start: 0, end: 12 },
      { type: "email", start: 20, end: 30 },
    ]);
    expect(merged).toEqual([
      { type: "address", start: 0, end: 12 },
      { type: "email", start: 20, end: 30 },
    ]);
  });

  it("offsets refer to the submitted text", () => {
    const text = "Tel. 600 100 200, mail a@b.pl";
    for (const span of findPatternSpans(text)) expect(text.slice(span.start, span.end)).not.toContain(" mail");
    expect(applySpans(text, findPatternSpans(text))).toBe(`Tel. ${REDACTED}, mail ${REDACTED}`);
  });
});

describe("person names", () => {
  it("are located as whole words, ignoring case and diacritics", () => {
    const text = "Pani Anna Nowak i pan Łukasz Żak; annanowak nie jest imieniem.";
    const spans = locateNames(text, ["Anna Nowak", "lukasz zak"]);
    expect(spans.map((span) => text.slice(span.start, span.end))).toEqual(["Anna Nowak", "Łukasz Żak"]);
  });
});

describe("links", () => {
  it("marks a text of mostly links as spam and a need with one link as not", () => {
    expect(mostlyLinks("https://example.com/promocja https://example.com/tanio www.example.com/x")).toBe(true);
    expect(mostlyLinks("W naszej gminie brakuje opieki wytchnieniowej, opis programu jest na https://gov.pl/opieka.")).toBe(false);
  });
});

describe("redact() of src/server/gate/redaction.ts", () => {
  it("keeps its behaviour: count and replacement", () => {
    const result = redact("Kontakt: jan@x.pl, 600 100 200, PESEL 44051401359, ul. Długa 5.");
    expect(result.count).toBe(4);
    expect(result.text).toBe(`Kontakt: ${REDACTED}, ${REDACTED}, PESEL ${REDACTED}, ${REDACTED}.`);
  });
});
