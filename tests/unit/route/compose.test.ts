import { describe, expect, test } from "vitest";
import type { Readiness, Route, Assessment, ComposeInput, GateOutput, MatchResult, ScreeningOutcome } from "@/lib/contracts";
import { loadDataset } from "@/lib/data/load";
import { t } from "@/lib/i18n";
import { LlmError, type Llm, type LlmCall } from "@/lib/llm/types";
import { buildScreenedRoute, composeRoute } from "@/server/route";
import { findBanned, hasAmountOrDate, parseBannedWords } from "@/server/route/safety";
import { contradictsReasons, type ComposeOutput } from "@/server/route/text";

/* The composer end to end on a small real slice: model output checks, the templates, the screened outcomes. */

const TODAY = "2026-09-29";
const dataset = loadDataset({ today: TODAY });
const BATHROOMS = "inn-rops-przenosne-modularne-lazienki";
const SENIORS = "inn-nat-649";

function gate(outcome: ScreeningOutcome = "need", over: Partial<GateOutput["screening"]> = {}): GateOutput {
  return {
    screening: {
      category: outcome === "need" ? "need" : outcome === "redirected" ? "crisis" : outcome === "declined" ? "harm" : "off_topic",
      confidence: 0.9,
      individual_case: false,
      sensitive_topics: [],
      redactions: [],
      need_summary_pl: "Brak łazienek dla osób starszych w gminie",
      outcome,
      crisis_banner: false,
      rules_fired: [],
      prompt_version: "screen-v1",
      ...over,
    },
    redactedText: "W gminie brakuje łazienek dostosowanych do potrzeb osób starszych.",
    redactionCount: 0,
    stage: null,
  };
}

function assessment(id: string, score: number): Assessment {
  return {
    id,
    fit_score: score,
    fit_reasons: [{ field: "problem_pl", quote: "cytat", why_pl: "Odpowiada na opisany problem." }],
    gaps_pl: [],
    adaptation_note_pl: null,
  };
}

function match(over: Partial<MatchResult> = {}): MatchResult {
  return {
    mode: "route",
    mode_reason_pl: "Dwa rozwiązania odpowiadają na opisany problem.",
    need_summary_pl: "Brak łazienek dla osób starszych w gminie",
    detected_target_groups: ["seniorzy"],
    detected_domains: [],
    retrieved_ids: [BATHROOMS, SENIORS],
    candidates: [],
    assessments: [assessment(BATHROOMS, 86), assessment(SENIORS, 72)],
    top_ids: [BATHROOMS, SENIORS],
    clarification_needed: false,
    stages: [
      {
        stage: "assess",
        provider: "openai-compatible",
        model: "bielik",
        promptVersion: "assess-v1",
        inputTokens: 1,
        outputTokens: 1,
        cacheReadTokens: 0,
        latencyMs: 100,
        cached: false,
        droppedIds: [],
        droppedReasons: 0,
        notes: [],
      },
    ],
    ...over,
  };
}

function input(over: Partial<ComposeInput> = {}): ComposeInput {
  return {
    routeId: "rt-test",
    createdAt: "2026-09-29T10:00:00+02:00",
    input: {
      problem_text: "W gminie brakuje łazienek dostosowanych do potrzeb osób starszych.",
      place_terc: "1261011",
      place_name: "Kraków",
      role: "pracownik-instytucji",
      target_groups: [],
    },
    gate: gate(),
    match: match(),
    ...over,
  };
}

/** A model that answers with `output`, recording what it was asked. */
function fakeLlm(output: ComposeOutput | (() => never), calls: LlmCall<unknown>[] = []): Llm {
  return (async <T>(call: LlmCall<T>) => {
    calls.push(call as LlmCall<unknown>);
    const value = typeof output === "function" ? output() : output;
    return {
      parsed: call.schema.parse(value),
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0 },
      latencyMs: 42,
      provider: "fake",
      model: "fake-model",
      promptVersion: call.promptVersion,
      cached: false,
    };
  }) as Llm;
}

const failingLlm = fakeLlm(() => {
  throw new LlmError("unavailable", "compose", "down", "openai-compatible");
});

/** Every block of 8.4 present and of the right shape (FR-4.1). */
function expectComplete(route: Route) {
  expect(route.solutions.length).toBeGreaterThan(0);
  for (const solution of route.solutions) {
    expect(solution.fit_label_pl.length).toBeGreaterThan(0);
    expect(solution.what_it_takes.cost_band).toBeTruthy();
    expect(typeof solution.where_it_runs.count).toBe("number");
  }
  expect(route.knowledge.some((item) => item.url.includes("ABC_Diagnozy"))).toBe(true);
  expect(route.people.advisor.email).toContain("@");
  expect(route.path.applicant_type).toBe("jst");
  expect(route.path.paths.length).toBeGreaterThan(0);
  for (const path of route.path.paths) {
    expect(dataset.pathById.has(path.path_id)).toBe(true);
    expect(path.why_pl.length).toBeGreaterThan(0);
  }
  expect(route.next_steps).toHaveLength(3);
  for (const step of route.next_steps) expect(step.link).toMatch(/^(https?:|\/kontakt\?|\/zapisz-potrzebe\?|#sciezka-)/);
  expect(new Set(route.next_steps.map((step) => step.text_pl)).size).toBe(3);
  expect(route.label_pl).toBe(t("route.generated.label"));
  expect(route.engine.data_version).toBe(dataset.version);
  expect(route.reference_code).toBeNull();
}

describe("model text blanked (FR-4.1)", () => {
  test("a failed call gives a complete route from templates", async () => {
    const { route, stage } = await composeRoute(input(), { llm: failingLlm, dataset, today: TODAY, readiness: [] });
    expectComplete(route);
    expect(route.summary_pl).toBeNull();
    expect(stage?.notes.some((note) => note.startsWith("model failed (unavailable)"))).toBe(true);
    expect(route.next_steps[0].link).toMatch(/^https?:/);
    expect(route.next_steps[1].link).toBe(`/kontakt?innowacja=${BATHROOMS}&droga=rt-test`);
    expect(route.next_steps[2].link).toMatch(/^#sciezka-/);
  });

  test("empty model output gives the same complete route", async () => {
    const { route } = await composeRoute(input(), {
      llm: fakeLlm({ summary_pl: "", next_steps: [], paths: [] }),
      dataset,
      today: TODAY,
      readiness: [],
    });
    expectComplete(route);
    expect(route.summary_pl).toBeNull();
  });
});

describe("model output checks", () => {
  test("a step with an unknown id is dropped and a template fills in", async () => {
    const { route, stage } = await composeRoute(input(), {
      llm: fakeLlm({
        summary_pl: "Oba rozwiązania pomagają osobom starszym. Zacznij od rozmowy z autorami.",
        next_steps: [
          { ref: "org-1", text_pl: "Poproś autorów przenośnych łazienek o rozmowę." },
          { ref: "org-99", text_pl: "Zadzwoń do nieistniejącej organizacji." },
          { ref: "path-1", text_pl: "Sprawdź pierwszą ścieżkę wdrożenia." },
        ],
        paths: [{ path_id: "nie-ma-takiej", why_pl: "Zmyślona ścieżka." }],
      }),
      dataset,
      today: TODAY,
      readiness: [],
    });
    expectComplete(route);
    expect(route.summary_pl).toContain("Oba rozwiązania");
    expect(route.next_steps[0]).toEqual({
      text_pl: "Poproś autorów przenośnych łazienek o rozmowę.",
      link: `/kontakt?innowacja=${BATHROOMS}&droga=rt-test`,
    });
    expect(route.next_steps[1].text_pl).toBe("Sprawdź pierwszą ścieżkę wdrożenia.");
    expect(route.next_steps.map((step) => step.text_pl)).not.toContain("Zadzwoń do nieistniejącej organizacji.");
    expect(stage?.droppedIds).toEqual(["org-99", "nie-ma-takiej"]);
    expect(stage?.notes).toContain("steps filled from templates: 1");
  });

  test("a banned word, an amount or a date replaces the text by its template", async () => {
    const paths = (await composeRoute(input(), { llm: failingLlm, dataset, today: TODAY, readiness: [] })).route.path.paths;
    const { route, stage } = await composeRoute(input(), {
      llm: fakeLlm({
        summary_pl: "To prawdziwa tragedia dla całej gminy.",
        next_steps: [
          { ref: "org-1", text_pl: "Zapytaj, jak pomagają pijakom w gminie." },
          { ref: "path-1", text_pl: "Złóż wniosek do 30 listopada." },
          { ref: "advisor", text_pl: "Napisz do Działu Innowacji Społecznych ROPS." },
        ],
        paths: [
          { path_id: paths[0].path_id, why_pl: "Dostaniesz do 400 000 zł." },
          { path_id: paths[1].path_id, why_pl: "Ścieżka pasuje do usług dla osób starszych." },
        ],
      }),
      dataset,
      today: TODAY,
      readiness: [],
    });
    expectComplete(route);
    expect(route.summary_pl).toBeNull();
    expect(route.next_steps[0].text_pl).toBe(t("compose.step.innovator", { title: dataset.innovationById.get(BATHROOMS)!.title }));
    expect(route.next_steps[1].text_pl).toBe(t("compose.step.path", { name: dataset.pathById.get(paths[0].path_id)!.name_pl }));
    expect(route.next_steps[2].text_pl).toBe(t("compose.step.advisor"));
    expect(route.path.paths[0].why_pl).toBe(paths[0].why_pl);
    expect(route.path.paths[1].why_pl).toBe("Ścieżka pasuje do usług dla osób starszych.");
    expect(stage?.notes).toEqual(
      expect.arrayContaining(["summary dropped: banned:sensational", "step 1 templated: banned:stigmatising", "step 2 templated: amount-or-date"]),
    );
  });

  test("the prompt carries no readiness entry, no contact and no amount (FR-6.6, FR-8.5)", async () => {
    const entry: Readiness = {
      id: "gt-1",
      created_at: TODAY,
      display_name: "Jan Tajny",
      is_organisation: false,
      place_terc: "1261011",
      topics: ["seniorzy"],
      channel: { type: "email", value: "jan.tajny@example.org" },
      consent_display_name: true,
      consent: { text_version: "v1", timestamp: TODAY },
      verification: { status: "zweryfikowane", reviewer: "rops", decided_at: TODAY },
      retention_until: "2027-09-29",
      note_pl: null,
    };
    const calls: LlmCall<unknown>[] = [];
    const { route } = await composeRoute(input(), {
      llm: fakeLlm({ summary_pl: "", next_steps: [], paths: [] }, calls),
      dataset,
      today: TODAY,
      readiness: [entry],
    });
    expect(route.people.readiness.count).toBe(1);
    expect(calls).toHaveLength(1);
    const prompt = `${calls[0].system}\n${calls[0].user}`;
    expect(prompt).not.toContain("Jan Tajny");
    expect(prompt).not.toContain("example.org");
    expect(calls[0].user).not.toMatch(/\d\s?\d{3}\s?zł/);
    expect(calls[0].user).toContain("<potrzeba>");
    expect(calls[0].promptVersion).toBe("compose-v1");
  });
});

describe("partial and none (S3)", () => {
  test("partial without top ids shows the best assessments and puts the needs bank first", async () => {
    const { route } = await composeRoute(
      input({ match: match({ mode: "partial", top_ids: [], assessments: [assessment(SENIORS, 55)] }) }),
      { llm: failingLlm, dataset, today: TODAY, readiness: [] },
    );
    expect(route.mode).toBe("partial");
    expect(route.solutions.map((item) => item.innovation_id)).toEqual([SENIORS]);
    expect(route.next_steps[0]).toEqual({ text_pl: t("compose.step.bank"), link: "/zapisz-potrzebe?droga=rt-test" });
    expect(route.next_steps[1].link).toBe("/kontakt?droga=rt-test");
    expect(route.path.paths.some(({ path_id }) => dataset.pathById.get(path_id)?.id === "iws-2-inkubator")).toBe(true);
  });

  test("none without any candidate skips the model", async () => {
    const calls: LlmCall<unknown>[] = [];
    const { route, stage } = await composeRoute(
      input({ match: match({ mode: "none", top_ids: [], assessments: [] }) }),
      { llm: fakeLlm({ summary_pl: "x", next_steps: [], paths: [] }, calls), dataset, today: TODAY, readiness: [] },
    );
    expect(calls).toHaveLength(0);
    expect(stage).toBeNull();
    expect(route.solutions).toEqual([]);
    expect(route.next_steps).toHaveLength(3);
    expect(route.unknowns_pl).toContain(t("route.unknowns.noSolutions"));
  });
});

describe("buildScreenedRoute", () => {
  const base = input().input;

  test.each([
    ["redirected", "redirected", false],
    ["declined", "declined", true],
    ["off_topic", "off_topic", false],
  ] as const)("%s", (outcome, mode, hasCode) => {
    const route = buildScreenedRoute("rt-x", "2026-09-29T10:00:00+02:00", base, gate(outcome), dataset);
    expect(route.mode).toBe(mode);
    expect(route.input.problem_text).toBeNull();
    expect(route.input.place_name).toBe("Kraków");
    expect(route.solutions).toEqual([]);
    expect(route.next_steps).toEqual([]);
    expect(route.screening.category).toBe(gate(outcome).screening.category);
    expect(route.reference_code === null).toBe(!hasCode);
    if (hasCode) expect(route.reference_code).toMatch(/^HM-2026-\d{4}$/);
    expect(route.mode_reason_pl).toBeNull();
  });

  test("the mild declined of FR-12.12 (the gate passed the text, the model refused)", () => {
    const route = buildScreenedRoute("rt-x", "2026-09-29T10:00:00+02:00", base, gate("need"));
    expect(route.mode).toBe("declined");
    expect(route.screening.category).toBe("need");
    expect(route.mode_reason_pl).toBe(t("route.declined.mild"));
    expect(route.reference_code).toMatch(/^HM-2026-\d{4}$/);
    expect(route.people.advisor.email).toContain("@");
  });
});

describe("the banned-words list", () => {
  test("prefix and exact forms, phrases, no false hit on ordinary words", () => {
    const list = parseBannedWords('categories:\n  a:\n    - "pijak*"\n    - "żul"\n    - "popełni* samobójstw*"\n');
    expect(findBanned("Pomoc dla pijaków", list)).toBe("a");
    expect(findBanned("Żuławy Wiślane", list)).toBeNull();
    expect(findBanned("Nikt nie chce popełnić samobójstwa", list)).toBe("a");
    expect(findBanned("Zapobieganie samobójstwom", list)).toBeNull();
  });

  test("the repository file loads and catches its own categories", () => {
    expect(findBanned("To była tragedia.")).toBe("sensational");
    expect(findBanned("Osoby w kryzysie bezdomności potrzebują miejsca.")).toBeNull();
    // Plurals of persons change the stem, so the file lists them beside the prefix.
    for (const text of ["Alkoholicy piją pod sklepem.", "Pijacy na przystanku.", "Wariaci z osiedla.", "Narkomani w parku.", "Bezdomniacy na dworcu."]) {
      expect(findBanned(text)).toBe("stigmatising");
    }
    expect(findBanned("Osoby uzależnione od alkoholu i osoby na wózkach inwalidzkich.")).toBeNull();
    expect(findBanned("Przeciwdziałanie narkomanii wśród młodzieży.")).toBeNull();
    expect(hasAmountOrDate("do 20 000 zł")).toBe(true);
    expect(hasAmountOrDate("do 30 września")).toBe(true);
    expect(hasAmountOrDate("Sprawdź ścieżkę w urzędzie.")).toBe(false);
    expect(hasAmountOrDate("Sprawdź ścieżkę „Inkubator Włączenia Społecznego 2.0”.")).toBe(false);
    expect(hasAmountOrDate("Złóż wniosek do 30.09.")).toBe(true);
  });
});

describe("why_pl against the selection's flags", () => {
  const reasons = { targetGroup: null, deadlineSoon: false, rolling: false, regional: false, vehicle: false, createNew: false, open: false };

  test("a statement the flags contradict", () => {
    expect(contradictsReasons("Program jest regionalny.", reasons)).toBe(true);
    expect(contradictsReasons("Nabór jest teraz otwarty.", reasons)).toBe(true);
    expect(contradictsReasons("Wniosek złożysz w dowolnym momencie.", reasons)).toBe(true);
    expect(contradictsReasons("Nabór kończy się wkrótce.", reasons)).toBe(true);
    expect(contradictsReasons("Nabór jest zamknięty.", { ...reasons, open: true })).toBe(true);
    expect(contradictsReasons("Nabór jest teraz zamknięty.", reasons)).toBe(false);
    expect(contradictsReasons("Program jest regionalny.", { ...reasons, regional: true })).toBe(false);
    expect(contradictsReasons("Program jest przeznaczony dla dzieci i młodzieży.", reasons)).toBe(true);
    expect(
      contradictsReasons("Program jest przeznaczony dla dzieci i młodzieży.", { ...reasons, targetGroup: "dzieci-mlodziez-rodziny" }),
    ).toBe(false);
  });

  test("a contradicting why is templated; a sensitive route's summary points to the helplines", async () => {
    const paths = (await composeRoute(input(), { llm: failingLlm, dataset, today: TODAY, readiness: [] })).route.path.paths;
    const sensitive = input({ gate: gate("need", { sensitive_topics: ["suicide"], crisis_banner: true }) });
    const { route, stage } = await composeRoute(sensitive, {
      llm: fakeLlm({
        summary_pl: "Rozwiązania wspierają osoby starsze w codziennym życiu.",
        next_steps: [],
        paths: [{ path_id: paths[0].path_id, why_pl: "Nabór trwa i przyjmuje wnioski." }],
      }),
      dataset,
      today: TODAY,
      readiness: [],
    });
    expect(route.summary_pl).toBe(`Rozwiązania wspierają osoby starsze w codziennym życiu. ${t("compose.summary.helplines")}`);
    expect(route.path.paths[0].why_pl).toBe(paths[0].why_pl);
    expect(stage?.notes).toContain(`why ${paths[0].path_id} templated: contradicts-selection`);
  });
});
