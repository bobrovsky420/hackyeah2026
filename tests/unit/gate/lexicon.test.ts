import { describe, expect, it } from "vitest";
import { compileEntry, compileLexicon, LexiconError, loadLexicon, matchLexicon } from "@/server/gate/lexicon";
import { fold } from "@/lib/text";

const crisisOf = (text: string) => matchLexicon(text).crisis.map((hit) => hit.entry);
const communityTopics = (text: string) => [...new Set(matchLexicon(text).community.map((hit) => hit.topic))];

describe("the lexicon file", () => {
  it("has an owner and a date (FR-12.1) and entries in both groups", () => {
    const lexicon = loadLexicon();
    expect(lexicon.owner).toBeTruthy();
    expect(lexicon.date).toBe("2026-09-29");
    expect(lexicon.crisis.length).toBeGreaterThan(20);
    expect(lexicon.community.length).toBeGreaterThan(10);
  });

  it("rejects a file without an owner or with an unknown topic", () => {
    expect(() => compileLexicon({ date: "2026-09-29", crisis: {}, community: {} })).toThrow(LexiconError);
    expect(() => compileLexicon({ owner: "x", date: "2026-09-29", crisis: { hunger: ["a"] }, community: {} })).toThrow(LexiconError);
  });
});

describe("entry syntax", () => {
  it("matches stems at a word start, whole words with $, and gaps with ~", () => {
    expect(compileEntry("samobój").test(fold("Samobójstwa wśród młodzieży"))).toBe(true);
    expect(compileEntry("samobój").test(fold("antysamobójczy"))).toBe(false);
    expect(compileEntry("bije$").test(fold("on bije"))).toBe(true);
    expect(compileEntry("bije$").test(fold("bijemy się"))).toBe(false);
    expect(compileEntry("nie$ chce$ ~ zyc$").test(fold("Nie chcę już dłużej żyć"))).toBe(true);
    expect(compileEntry("nie$ chce$ ~ zyc$").test(fold("nie chcę tu z nimi dłużej żyć"))).toBe(false);
  });
});

describe("crisis entries (force redirected)", () => {
  it.each([
    "Nie daję już rady, nie chcę żyć, nikt mnie nie słucha.",
    "nie chce zyc",
    "Chcę się zabić.",
    "Myślę o samobójstwie od tygodnia.",
    "Tnę się, kiedy jest źle.",
    "Mąż mnie bije, boję się wrócić do domu.",
    "Sąsiad bije dziecko codziennie.",
    "Wujek mnie molestował.",
    "Grozi mi były partner.",
    "Głoduję od trzech dni.",
    "W moim domu? Tak, przemoc w moim domu trwa od lat.",
  ])("finds %s", (text) => {
    expect(crisisOf(text).length).toBeGreaterThan(0);
  });

  it("finds them without Polish letters and in capitals", () => {
    expect(crisisOf("MYSLE O SAMOBOJSTWIE")).toEqual(["mysle$ o$ samoboj"]);
  });
});

describe("the three sensitive-but-legitimate cases of 13.1 (E3)", () => {
  const s01 =
    "Jestem pedagożką szkolną. W naszym powiecie rośnie liczba prób samobójczych wśród młodzieży, a szkoły nie mają psychologów ani programu profilaktyki.";
  const s02 =
    "Pracuję w ośrodku pomocy społecznej w gminie wiejskiej. Mamy coraz więcej rodzin z Niebieską Kartą, przemoc domowa jest częsta, a zespół interdyscyplinarny nie ma ludzi.";
  const s03 = "Ci sezonowi robotnicy chleją na umór co weekend, alkoholizm w tej wsi to plaga, a nikt nic nie robi!!!";

  it.each([
    ["S01", s01, "suicide"],
    ["S02", s02, "violence"],
    ["S03", s03, "addiction"],
  ])("%s has no crisis hit, only its community topic", (_id, text, topic) => {
    expect(crisisOf(text)).toEqual([]);
    expect(communityTopics(text)).toContain(topic);
  });

  it("a community mention of violence, suicide or abuse is not a crisis", () => {
    for (const text of [
      "Przemoc domowa w gminie to duży problem.",
      "Przemoc w domu dotyka wiele rodzin w naszej gminie.",
      "Potrzebujemy programu zapobiegania samobójstwom.",
      "Brakuje wsparcia dla dzieci krzywdzonych w rodzinach.",
      "Serce bije szybciej, gdy seniorzy tańczą w klubie.",
    ]) {
      expect(crisisOf(text)).toEqual([]);
    }
  });
});
