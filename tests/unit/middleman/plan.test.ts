import { describe, expect, it } from "vitest";
import { catalogue, fromDataset } from "@/lib/catalogue";
import { loadDataset } from "@/lib/data/load";
import { LlmError, type LlmCall } from "@/lib/llm/types";
import type { AdaptInput } from "@/lib/middleman";
import { adaptFacts, adaptUserPart, fundsTheService, planMarkdown, planPaths, servicePlan, templateParts, type MiddlemanDeps } from "@/server/middleman";
import { bannedWords } from "@/server/route/safety";
import { fakeLlm } from "../needs/fixtures";

/* The Middleman of module VII (src/server/middleman): a service plan of one innovation for one institution. */

const ID = "inn-nat-649";
const input: AdaptInput = { institution: "ops", place_terc: "1207062", constraints: ["budzet", "dojazd"], scale: "pilot", target_group: "seniorzy", note: null };
const live = (llm: MiddlemanDeps["llm"]) => ({ llm, catalogue: catalogue(), banned: bannedWords(), engine: "live" as const, today: () => "2026-10-05" });

const good = {
  service_pl:
    "Ośrodek pomocy zaprasza seniorów na warsztaty komputerowe, które prowadzą uczniowie szkoły podstawowej pod okiem nauczycieli. Spotkania odbywają się w szkole raz w tygodniu, a koordynator ośrodka dba o zapisy.",
  roles: ["koordynator w ośrodku pomocy: zaprasza seniorów", "nauczyciel w szkole: przygotowuje uczniów"],
  adaptations: [
    { constraint: "budzet", text_pl: "Skorzystaj z sali komputerowej szkoły zamiast kupować sprzęt dla ośrodka." },
    { constraint: "dojazd", text_pl: "Umów wspólny dojazd seniorów do szkoły z pomocą sąsiadów." },
    { constraint: "lokal", text_pl: "Tego ograniczenia instytucja nie podała, więc ta podpowiedź odpada." },
  ],
  first_steps: [
    "Porozmawiaj z dyrektorem szkoły o wspólnych warsztatach.",
    "Zbierz w ośrodku listę seniorów chętnych do nauki.",
    "Ustal z nauczycielem dzień i salę na pierwsze spotkanie.",
  ],
};

describe("servicePlan", () => {
  it("without a model gives the template, and the facts come from the data", async () => {
    const plan = (await servicePlan(ID, input, { ...live(fakeLlm({})), engine: "canned" }))!;
    const item = catalogue().innovationById.get(ID)!;
    expect(plan.source).toBe("template");
    expect(plan.service).toContain(item.title);
    expect(plan.adaptations.map((row) => row.constraint)).toEqual(["Mały budżet", "Odbiorcy mieszkają daleko, trudny dojazd"]);
    expect(plan.first_steps).toHaveLength(3);
    expect(plan.needs.requires).toEqual(item.requires);
    expect(plan).toMatchObject({ place_name: "Laskowa", group_label: "Seniorzy" });
  });

  it("keeps the model's parts that pass and drops an adaptation for a constraint not given", async () => {
    const plan = (await servicePlan(ID, input, live(fakeLlm(good))))!;
    expect(plan.source).toBe("model");
    expect(plan.service).toBe(good.service_pl);
    expect(plan.roles).toEqual(good.roles);
    expect(plan.adaptations).toEqual([
      { constraint: "Mały budżet", text: good.adaptations[0].text_pl },
      { constraint: "Odbiorcy mieszkają daleko, trudny dojazd", text: good.adaptations[1].text_pl },
    ]);
    expect(plan.first_steps).toEqual(good.first_steps);
  });

  it("gives every constraint its adaptation in the form's order, the template's where the model's fails or is missing", async () => {
    const item = catalogue().innovationById.get(ID)!;
    const three: AdaptInput = { ...input, constraints: ["budzet", "etat", "dojazd"] };
    const template = templateParts(item, three);
    const plan = (await servicePlan(
      ID,
      three,
      live(
        fakeLlm({
          ...good,
          adaptations: [
            good.adaptations[1],
            // Numbers the data does not carry.
            { constraint: "etat", text_pl: "Wystarczy pół etatu i 2 wolontariuszy przez 3 miesiące." },
          ],
        }),
      ),
    ))!;
    expect(plan.adaptations).toEqual([
      template.adaptations[0],
      template.adaptations[1],
      { constraint: template.adaptations[2].constraint, text: good.adaptations[1].text_pl },
    ]);
  });

  it("takes an adaptation without its constraint key as a general one", async () => {
    const plan = (await servicePlan(ID, input, live(fakeLlm({ ...good, adaptations: [good.adaptations[0], { text_pl: "Zacznij od jednej grupy seniorów, a kolejne zaproś po pierwszych spotkaniach." }] }))))!;
    expect(plan.source).toBe("model");
    expect(plan.adaptations).toContainEqual({ constraint: null, text: "Zacznij od jednej grupy seniorów, a kolejne zaproś po pierwszych spotkaniach." });
  });

  it("puts the template in place of a part that fails the checks", async () => {
    const item = catalogue().innovationById.get(ID)!;
    const template = templateParts(item, input);
    const plan = (await servicePlan(
      ID,
      input,
      live(
        fakeLlm({
          ...good,
          // A name and an amount the data does not carry.
          service_pl: "Fundacja Zielony Most sfinansuje warsztaty kwotą 5000 złotych, a ośrodek zaprosi seniorów na spotkania w szkole.",
          first_steps: [good.first_steps[0], "Złóż wniosek do 15 listopada."],
        }),
      ),
    ))!;
    expect(plan.source).toBe("model");
    expect(plan.service).toBe(template.service);
    expect(plan.first_steps).toEqual(template.first_steps);
    expect(plan.roles).toEqual(good.roles);
  });

  it("falls back to the template when the model fails", async () => {
    const plan = (await servicePlan(
      ID,
      input,
      live(
        fakeLlm(() => {
          throw new LlmError("unavailable", "adapt", "down");
        }),
      ),
    ))!;
    expect(plan.source).toBe("template");
  });

  it("is null for an unknown innovation", async () => {
    expect(await servicePlan("inn-nie-ma", input, live(fakeLlm(good)))).toBeNull();
  });
});

describe("the call and the file", () => {
  it("names the institution's group and keeps its note inside its tags", async () => {
    const calls: LlmCall<unknown>[] = [];
    await servicePlan(ID, { ...input, note: "Mamy <b>świetlicę</b> przy ośrodku." }, live(fakeLlm(good, calls)));
    expect(calls[0].task).toBe("adapt");
    expect(calls[0].user).toContain('"dla_kogo": "Seniorzy"');
    expect(calls[0].user).toMatch(/<instytucja>\nMamy  b świetlicę \/b  przy ośrodku.\n<\/instytucja>$/);
    expect(adaptUserPart(adaptFacts(catalogue().innovationById.get(ID)!, input), null)).not.toContain("<instytucja>");
  });

  it("writes the plan as Markdown in the order of the page", async () => {
    const plan = (await servicePlan(ID, input, live(fakeLlm(good))))!;
    const markdown = planMarkdown(plan);
    const order = ["## Usługa w Twojej instytucji", "## Kto i co robi", "## Jak dopasować do Twoich warunków", "## Pierwsze kroki", "## Czego potrzeba"];
    const positions = order.map((heading) => markdown.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(markdown).toContain("1. Porozmawiaj z dyrektorem szkoły");
  });
});

describe("the funding paths on the real data", () => {
  const TODAY = "2026-10-05";
  const dataset = loadDataset({ today: TODAY });
  const deps = { catalogue: fromDataset(dataset), today: () => TODAY };

  it("leave out the programmes for new care places, which fund a facility rather than the service", () => {
    expect(
      dataset.raw.paths
        .filter((path) => !fundsTheService(path))
        .map((path) => path.id)
        .sort(),
    ).toEqual(["aktywny-maluch", "asy-priorytet-v"]);
    // A crisis team and a respite service for families: the nursery programme matched both by the group alone.
    for (const id of ["inn-rops-mobilna-pomoc-terapeutyczna", "inn-nat-program-przerwy-regeneracyjnej-2"]) {
      const names = planPaths(dataset.innovationById.get(id)!, { ...input, institution: "gmina", place_terc: "1211102", target_group: null }, deps).map((path) => path.name);
      expect(names.length).toBeGreaterThan(0);
      expect(names.join(" | ")).not.toMatch(/Aktywny Maluch|priorytet V/);
    }
  });

  it("give an OPS in Laskowa the seniors' programmes for a service of seniors", () => {
    const names = planPaths(dataset.innovationById.get(ID)!, input, deps).map((path) => path.name);
    expect(names.some((name) => /Senior/.test(name))).toBe(true);
  });
});
