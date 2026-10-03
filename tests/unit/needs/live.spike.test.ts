import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { IndicatorKey, Brief, Embed } from "@/lib/contracts";
import { loadDataset } from "@/lib/data/load";
import { getLlm } from "@/lib/llm";
import { fromDataset } from "@/lib/catalogue";
import { createMemoryRepository, createMemoryState } from "@/server/db/memory";
import { briefForNeed, generateBrief, nearestMatches } from "@/server/needs";
import { assessment, matchResult, need } from "./fixtures";

/*
 * Live spike of the brief on the none case C09 of
 * docs/test-problem-candidates.md, through the configured model chain.
 * Skipped unless NEEDS_SPIKE=1. The match result is built by hand from the
 * retriever's nearest records of C09, so the matcher makes no call: one
 * model call in all (brief), plus the adapter's repair retries.
 *
 *   NEEDS_SPIKE=1 npx vitest run tests/unit/needs/live.spike.test.ts
 *
 * The report goes to .local/needs-spike/C09.json. NEEDS_SPIKE=service runs
 * the endpoint's logic instead (briefForNeed on a memory repository): C09
 * typed straight into the bank, so the matcher runs with the lexical
 * retriever (two calls) before the brief (one call). The report goes to
 * .local/needs-spike/C09-service.json.
 */

const C09 =
  "Po lipcowej ulewie woda weszła do kilkudziesięciu domów w dolinie, niektórym już drugi raz w ciągu trzech lat. Ludzie suszą ściany, dzieci śpią u krewnych, a wiele osób nie śpi po nocach przy każdym deszczu. Na początku była zbiórka i pomoc sąsiadów, teraz każdy został z tym sam i nikt tego nie koordynuje.";
const ENERGY = "inn-nat-opracowanie-standaryzowanego-modelu-wsparcia-doradczego-dla-osob-z-grupy-ubostwa-energetycznego";
const PHOENIX = "inn-rops-wiejski-program-pomocy-osobom-w-kryzysie-bezdomnosci-sciezka-feniksa";
const noEmbed: Embed = async () => {
  throw new Error("not used");
};

describe.skipIf(process.env.NEEDS_SPIKE !== "service")("live spike of the endpoint logic", () => {
  test("C09 through briefForNeed", { timeout: 240_000 }, async () => {
    const dataset = loadDataset();
    const repo = createMemoryRepository({ ...createMemoryState(), needs: [] });
    await repo.addNeed(need({ problem_text: C09, summary_pl: null, target_groups: [] }));
    const started = Date.now();
    const stored = await briefForNeed("nd-test-1", { repo, llm: getLlm(), catalogue: fromDataset(dataset), embed: noEmbed });
    const report = {
      ms: Date.now() - started,
      nearest: (await repo.getNeed("nd-test-1"))?.nearest_matches,
      generation: stored?.brief.generation,
      title: stored?.brief.title,
      problem: stored?.brief.problem,
      gap: stored?.brief.gapText,
      direction: stored?.brief.direction,
      markdown: stored?.markdown,
    };
    const dir = path.join(process.cwd(), ".local", "needs-spike");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "C09-service.json"), `${JSON.stringify(report, null, 2)}
`);
    expect(stored).not.toBeNull();
  });
});

describe.skipIf(process.env.NEEDS_SPIKE !== "1")("live spike", () => {
  const dataset = loadDataset();
  const llm = getLlm();

  test("C09 brief and a cluster run", { timeout: 180_000 }, async () => {
    const energy = assessment(ENERGY, 32, ["Nie dotyczy skutków podtopień ani osuszania domów.", "Nie koordynuje pomocy sąsiedzkiej."]);
    energy.fit_reasons[0].why_pl = "Doradza gospodarstwom domowym w trudnej sytuacji mieszkaniowej.";
    const phoenix = assessment(PHOENIX, 24, ["Dotyczy osób w kryzysie bezdomności, a nie rodzin, które mają dom."]);
    phoenix.fit_reasons[0].why_pl = "Łączy wsparcie gminy i sąsiadów na wsi.";
    const record = need({ problem_text: C09, summary_pl: "Rodziny po podtopieniach w dolinie zostały bez koordynacji pomocy", target_groups: [] });
    const nearest = await nearestMatches(record, { llm, dataset, embed: noEmbed, match: matchResult([energy, phoenix]) });
    record.nearest_matches = nearest.matches;

    const values = dataset.indicators.values[record.place_terc!] ?? {};
    const indicators = (["social-assistance", "ageing", "unemployment"] as IndicatorKey[]).flatMap((key) => {
      const entry = values[key];
      const median = dataset.indicators.indicators.find((item) => item.key === key)?.median ?? null;
      return entry && median !== null ? [{ key, value: entry.value, year: entry.year, median }] : [];
    });
    const template: Brief = {
      needId: record.id,
      generatedAt: new Date().toISOString(),
      title: record.summary_pl!,
      problem: record.problem_text,
      groups: [],
      placeTerc: record.place_terc,
      indicators,
      matches: [],
      similarNeeds: [],
      gaps: [],
      implementerTypes: [],
      partnersNearby: [],
      readinessCount: 0,
      paths: ["iws-2-inkubator", "maly-grant-19a", "inicjatywa-lokalna"].flatMap((id) => dataset.pathById.get(id) ?? []),
      sources: [],
      gapText: null,
      direction: null,
      helplines: null,
      generation: null,
    };
    const started = Date.now();
    const { brief, stage } = await generateBrief(record, { llm, dataset, template });
    const briefMs = Date.now() - started;


    const report = {
      brief: { ms: briefMs, stage, title: brief.title, problem: brief.problem, gap: brief.gapText, direction: brief.direction, generation: brief.generation },
      nearest: record.nearest_matches,
    };
    const dir = path.join(process.cwd(), ".local", "needs-spike");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "C09.json"), `${JSON.stringify(report, null, 2)}\n`);
    expect(stage).not.toBeNull();
  });
});
