import { describe, expect, it } from "vitest";
import { reportJson, reportMarkdown, type ReportData } from "@/server/eval/report";
import { scoreRun } from "@/server/eval/score";
import { summarise } from "@/server/eval/summary";
import { observation, problem } from "./helpers";

/* The report never carries the text of a problem marked sensitive, nor the need summary written from it. */

function data(sensitive: boolean): ReportData {
  const p = problem({ id: "S01", set: "S", sensitive, text: "TEKST-WRAZLIWY o kryzysie", expected: { crisisBanner: true } });
  const o = observation({
    problemId: "S01",
    crisisBanner: true,
    generated: [
      { field: "summary_pl", text: "Gmina może wykorzystać świetlicę wiejską na spotkania seniorów." },
      { field: "need_summary_pl", text: "STRESZCZENIE-POTRZEBY o kryzysie" },
    ],
  });
  const results = [scoreRun(p, o)];
  return {
    meta: {
      command: "eval",
      runId: "20260929-abcdef",
      startedAt: "2026-09-29T12:00:00.000Z",
      finishedAt: "2026-09-29T12:05:00.000Z",
      official: false,
      options: { provider: "replay", readCache: true, concurrency: 1, gate: "final", exceptions: [], fairnessAll: false, runTag: false, only: [] },
      environment: { llmHead: "replay", llmModel: null, llmConfigured: [], dataVersion: "2026-09-29-x", promptVersions: { screen: "screen-v1" }, embeddingModel: "OPI-PIB/PolDense-400M", embeddingReachable: false },
    },
    loaded: { dir: "tests/problems", problems: [p], issues: [], hashes: [{ file: p.file, sha256: p.sha256 }] },
    results,
    pairs: [],
    skippedPairs: [],
    targetGroups: [],
    summary: summarise({ problems: [p], results, pairs: [], validationIssues: 0, level: "final", exceptions: [] }),
  };
}

describe("the report", () => {
  it("leaves out a sensitive problem's text and need summary, in the Markdown and the JSON", () => {
    const markdown = reportMarkdown(data(true));
    const json = JSON.stringify(reportJson(data(true)));
    for (const text of [markdown, json]) {
      expect(text).not.toContain("TEKST-WRAZLIWY");
      expect(text).not.toContain("STRESZCZENIE-POTRZEBY");
    }
    expect(markdown).toContain("The text is marked sensitive and is not shown.");
    expect(markdown).toMatch(/^# Evaluation report 2026-09-29 12:05 UTC/);
    expect(JSON.parse(json)).toMatchObject({ schema: "hubmi-eval-report/1", lastRun: "2026-09-29T12:05:00.000Z" });
  });

  it("shows the text of a problem that is not sensitive", () => {
    expect(reportMarkdown(data(false))).toContain("> TEKST-WRAZLIWY o kryzysie");
  });
});
