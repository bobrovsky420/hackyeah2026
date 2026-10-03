import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { loadDataset } from "@/lib/data/load";
import { getLlm } from "@/lib/llm";
import type { MatchInput } from "@/server/contracts";
import { createEmbedClient, matchNeed } from "@/server/match/index";

/*
 * Live spike of the matcher on three candidate problems of
 * docs/test-problem-candidates.md (C01 route, C06 route, C09 none): the real
 * embedding service and the configured model chain. Skipped unless
 * MATCH_SPIKE=1; needs the service on EMBEDDING_URL and a model key. Two
 * model calls per problem, plus the adapter's repair retries.
 *
 *   MATCH_SPIKE=1 npx vitest run tests/unit/match/live.spike.test.ts
 *
 * The report per problem goes to .local/match-spike/<id>.json.
 */

const PROBLEMS: { id: string; input: MatchInput; expected: string[] }[] = [
  {
    id: "C01",
    input: {
      needText:
        "Pracuję w ośrodku pomocy społecznej w małej gminie. W naszych wioskach mieszka sporo starszych ludzi, którzy zostali sami, bo dzieci wyjechały do miasta albo za granicę. Coraz częściej widzimy, że nie wychodzą z domu, przestają jeść i płaczą przy naszych wizytach, a do najbliższego psychologa jest ponad godzina drogi.",
      needSummary: null,
      placeTerc: "1214062",
      role: "pracownik-instytucji",
      targetGroups: [],
    },
    expected: ["inn-rops-mobilne-centrum-pomocy-dla-osob-starszych", "inn-rops-centrum-antydepresyjne", "inn-rops-senior-cuder"],
  },
  {
    id: "C06",
    input: {
      needText:
        "Jesteśmy stowarzyszeniem rodziców dzieci z autyzmem. Każda wizyta u lekarza albo dentysty to dla nas koszmar: dziecko krzyczy już w poczekalni, nie da się go zbadać, a personel nie wie, jak się zachować, więc często wychodzimy bez pomocy. Niektóre rodziny latami odkładają leczenie zębów.",
      needSummary: null,
      placeTerc: "1261011",
      role: "organizacja-spoleczna",
      targetGroups: [],
    },
    expected: [
      "inn-nat-stomatologia-bez-barier-adaptacja-i-kwalifikacja-pacjentow-z-niepelnosprawnoscia",
      "inn-rops-himalaje-autyzmu",
    ],
  },
  {
    id: "C09",
    input: {
      needText:
        "Po lipcowej ulewie woda weszła do kilkudziesięciu domów w dolinie, niektórym już drugi raz w ciągu trzech lat. Ludzie suszą ściany, dzieci śpią u krewnych, a wiele osób nie śpi po nocach przy każdym deszczu. Na początku była zbiórka i pomoc sąsiadów, teraz każdy został z tym sam i nikt tego nie koordynuje.",
      needSummary: null,
      placeTerc: "1216143",
      role: "urzad-gminy",
      targetGroups: [],
    },
    expected: [],
  },
];

describe.skipIf(!process.env.MATCH_SPIKE)("live spike", () => {
  const dataset = loadDataset();
  const embed = createEmbedClient();
  const llm = getLlm();

  for (const problem of PROBLEMS) {
    test(problem.id, { timeout: 180_000 }, async () => {
      const started = Date.now();
      const result = await matchNeed(problem.input, { llm, dataset, embed });
      const ranks = problem.expected.map((id) => `${id.slice(0, 40)}: ${result.retrieved_ids.indexOf(id) + 1 || "-"}`);
      const report = {
        problem: problem.id,
        totalMs: Date.now() - started,
        retrievalRanks: ranks,
        stages: result.stages.map((s) => ({
          stage: s.stage,
          provider: s.provider,
          model: s.model,
          ms: s.latencyMs,
          in: s.inputTokens,
          out: s.outputTokens,
          cached: s.cached,
          droppedIds: s.droppedIds.length,
          droppedReasons: s.droppedReasons,
          notes: s.notes,
        })),
        mode: result.mode,
        modeReason: result.mode_reason_pl,
        summary: result.need_summary_pl,
        groups: result.detected_target_groups,
        domains: result.detected_domains,
        clarification: result.clarification_needed,
        candidates: result.candidates.map((c) => `${c.id} ${c.prelim_fit}`),
        assessments: result.assessments.map((a) => ({
          id: a.id,
          fit: a.fit_score,
          reasons: a.fit_reasons.map((r) => `${r.field}: ${r.quote}`),
          gaps: a.gaps_pl,
        })),
        top: result.top_ids,
      };
      // Written to .local/ (git-ignored): the reporter hides the console of passing tests.
      fs.mkdirSync(path.join(".local", "match-spike"), { recursive: true });
      fs.writeFileSync(path.join(".local", "match-spike", `${problem.id}.json`), JSON.stringify(report, null, 2));
      expect(result.stages[0].stage).toBe("retrieve");
    });
  }
});
