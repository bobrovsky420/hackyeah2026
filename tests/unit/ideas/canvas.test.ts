import { describe, expect, it } from "vitest";
import {
  CANVAS_FIELDS,
  CANVAS_STEPS,
  canvasSections,
  canvasTexts,
  hintKey,
  labelKey,
  optionDescriptionKey,
  optionKey,
  parseCanvas,
  PARTNER_ROLES,
  PARTNER_STATUSES,
  promptKey,
  stageFromReadiness,
  stepLeadKey,
  stepTitleKey,
  targetGroupsFromUsers,
  withCanvasTexts,
} from "@/lib/canvas";
import { hasMessage } from "@/lib/i18n";

/* The CANVAS application of module III (src/lib/canvas.ts): its texts, its checks and its screening order. */

/** Every choice answered with its first option and the card's texts filled in: the smallest valid application. */
function minimal(): Record<string, string | string[]> {
  const answers: Record<string, string | string[]> = {
    title: "Sąsiedzka wypożyczalnia",
    description: "Mieszkańcy wypożyczają sobie sprzęt rehabilitacyjny przez świetlicę.",
    essence: "Sprzęt krąży między sąsiadami.",
    for_whom: "Seniorzy po urazach",
  };
  for (const field of CANVAS_FIELDS) if (field.type === "choice") answers[field.id] = field.options[0];
  return answers;
}

describe("the canvas's texts", () => {
  it("has a label for every field and a text for every option, step, prompt and error", () => {
    const missing: string[] = [];
    const need = (key: string) => hasMessage(key) || missing.push(key);
    for (const step of CANVAS_STEPS) [stepTitleKey(step.id), stepLeadKey(step.id)].forEach(need);
    ["contact", "summary"].forEach((step) => [stepTitleKey(step), stepLeadKey(step)].forEach(need));
    for (const field of CANVAS_FIELDS) {
      need(labelKey(field.id));
      if (field.type === "choice") {
        need(`canvas.${field.id}.error`);
        for (const code of field.options) {
          need(optionKey(field.id, code));
          if (field.described) need(optionDescriptionKey(field.id, code));
        }
      }
      if (field.type === "multi") field.options.forEach((code) => need(optionKey(field.id, code)));
      if (field.type === "text" && field.min) need(`canvas.${field.id}.error`);
      if (field.type === "text") for (let index = 0; index < (field.prompts ?? 0); index++) need(promptKey(field.id, index));
    }
    PARTNER_ROLES.forEach((code) => need(optionKey("partner-role", code)));
    PARTNER_STATUSES.forEach((code) => need(optionKey("partner-status", code)));
    expect(missing).toEqual([]);
    // A hint is optional, but the questions without a level of their own carry one.
    expect(CANVAS_FIELDS.filter((field) => field.type === "text" && !hasMessage(hintKey(field.id))).map((field) => field.id)).toEqual([]);
  });
});

describe("parseCanvas", () => {
  it("splits the card's fields from the canvas", () => {
    const parsed = parseCanvas({ ...minimal(), kind: "pomysl" }, []);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.core).toMatchObject({ kind: "pomysl", title: "Sąsiedzka wypożyczalnia", for_whom: "Seniorzy po urazach" });
    expect(parsed.canvas.answers.title).toBeUndefined();
    expect(parsed.canvas.answers.intensity).toBe("bardzo-powazny");
  });

  it("names the first field that fails", () => {
    const answers: Record<string, string | string[]> = { ...minimal(), kind: "pomysl" };
    delete answers.frequency;
    expect(parseCanvas(answers, [])).toEqual({ ok: false, field: "frequency-0" });
    expect(parseCanvas({ ...minimal(), kind: "pomysl", title: "x" }, [])).toEqual({ ok: false, field: "title" });
    expect(parseCanvas({ ...minimal(), kind: "pomysl", emotional: ["spokoj", "pewnosc", "motywacja", "nastroj"] }, [])).toEqual({
      ok: false,
      field: "emotional-0",
    });
    expect(parseCanvas("nie", [])).toEqual({ ok: false, field: "canvas" });
  });

  it("drops unknown codes and keys, and partners without a name", () => {
    const parsed = parseCanvas({ ...minimal(), kind: "pomysl", users: ["seniorzy", "smoki"], hacked: "x" }, [
      { name: " Gminny Ośrodek Pomocy Społecznej ", roles: ["zasieg", "inna"], status: "potwierdzony" },
      { name: "  ", roles: [], status: "potencjalny" },
      { name: "Fundacja", roles: [], status: "zly" },
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.canvas.answers.users).toEqual(["seniorzy"]);
    expect(parsed.canvas.answers.hacked).toBeUndefined();
    expect(parsed.canvas.partners).toEqual([
      { name: "Gminny Ośrodek Pomocy Społecznej", roles: ["zasieg"], status: "potwierdzony" },
      { name: "Fundacja", roles: [], status: "potencjalny" },
    ]);
  });

  it("refuses more than eight partners", () => {
    const partners = Array.from({ length: 9 }, (_, index) => ({ name: `Partner ${index}`, roles: [], status: "potencjalny" }));
    expect(parseCanvas({ ...minimal(), kind: "pomysl" }, partners)).toEqual({ ok: false, field: "partners" });
  });
});

describe("the screening order", () => {
  it("gives the free texts back in place", () => {
    const parsed = parseCanvas(
      { ...minimal(), kind: "pomysl", supporters: "Sołtys", users_inne: "Opiekunki", income_text: "Gmina" },
      [{ name: "Koło Gospodyń Wiejskich", roles: [], status: "rozmowy" }],
    );
    if (!parsed.ok) throw new Error("invalid");
    const texts = canvasTexts(parsed.canvas);
    expect(texts.filter(Boolean).sort()).toEqual(["Gmina", "Koło Gospodyń Wiejskich", "Opiekunki", "Sołtys"]);
    expect(texts.at(-1)).toBe("Koło Gospodyń Wiejskich");
    const redacted = withCanvasTexts(parsed.canvas, texts.map((text) => (text === "Sołtys" ? "[osoba]" : text)));
    expect(redacted.answers.supporters).toBe("[osoba]");
    expect(redacted.answers.users_inne).toBe("Opiekunki");
    expect(redacted.partners[0].name).toBe("Koło Gospodyń Wiejskich");
  });
});

describe("what the card reads from the canvas", () => {
  it("takes the stage from the readiness and the groups from the users", () => {
    expect(["pomysl", "prototyp", "przetestowane", "gotowe"].map(stageFromReadiness)).toEqual(["pomysl", "prototyp", "test", "test"]);
    expect(targetGroupsFromUsers(["dzieci", "rodzice", "seniorzy", "nauczyciele"])).toEqual(["dzieci-mlodziez-rodziny", "seniorzy"]);
  });

  it("prints the answered blocks only, without the card's own fields", () => {
    const parsed = parseCanvas({ ...minimal(), kind: "pomysl" }, []);
    if (!parsed.ok) throw new Error("invalid");
    const sections = canvasSections(parsed.canvas);
    expect(sections.map((section) => section.id)).toEqual(["problem", "solution", "revenue", "impact"]);
    expect(sections[0].rows[0]).toEqual({ label: "Intensywność: jak bardzo źle jest bez Twojego rozwiązania?", value: "Bardzo poważny problem" });
    expect(canvasSections(parsed.canvas, { core: true, empty: true })).toHaveLength(CANVAS_STEPS.length);
  });
});
