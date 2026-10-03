import { beforeEach, describe, expect, it } from "vitest";
import type { Evaluation, Idea, Need, Route } from "@/lib/contracts";
import { createMemoryRepository, createMemoryState } from "@/server/db/memory";
import type { Repository } from "@/server/db/repository";
import { csvCell, EXPORT_KINDS, exportRows, questions, queueCounts, toCsv, trends, weekStart } from "@/server/admin/data";
import { exampleIdeas, exampleNeeds } from "@/server/db/examples";

const pending = { status: "do-weryfikacji" as const, reviewer: null, decided_at: null, reason_pl: null };

function idea(id: string, createdAt: string, over: Partial<Idea> = {}): Idea {
  return { ...exampleIdeas()[0], id, created_at: createdAt, example: undefined, status: "nowy", reply: null, moderation: pending, ...over };
}

function evaluation(id: string, over: Partial<Evaluation> = {}): Evaluation {
  return {
    id,
    created_at: "2026-10-03T10:00:00.000Z",
    innovation_id: "inn-nat-649",
    rating: 4,
    experience: null,
    feedback: null,
    improvement: null,
    test_signup: null,
    author: { display_name: null, email: null },
    consents: { store: true, contact: false, text_version: "v1", timestamp: "2026-10-03T10:00:00.000Z" },
    moderation: pending,
    forwarded_at: null,
    retention_until: "2027-10-03",
    note_pl: null,
    ...over,
  };
}

function route(id: string, createdAt: string, mode: Route["mode"], questionGroups: string[] | undefined, readerGroups: string[] = []): Route {
  return {
    id,
    created_at: createdAt,
    input: { problem_text: "Tekst pytania.", place_terc: null, place_name: null, role: null, target_groups: readerGroups },
    mode,
    question_groups: questionGroups,
    solutions: [],
    engine: { provider: "x", model: "x", prompt_version: null, data_version: "x", latency_ms: 1, cached: false },
  } as unknown as Route;
}

describe("the CSV of the panel (FR-9.2)", () => {
  it("quotes separators, quotes and line breaks, and disarms a cell that starts like a formula", () => {
    expect(csvCell("Kraków")).toBe("Kraków");
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('powiedział "tak"')).toBe('"powiedział ""tak"""');
    expect(csvCell("dwie\nlinie")).toBe('"dwie\nlinie"');
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+48 600")).toBe("'+48 600");
    expect(csvCell(null)).toBe("");
    expect(csvCell(true)).toBe("true");
  });

  it("starts with the byte order mark and ends every row with CRLF, for Polish Excel", () => {
    expect(toCsv([["a", "b"], [1, null]])).toBe("﻿a;b\r\n1;\r\n");
  });

  it("gives every export a header as long as each of its rows", async () => {
    const repo = createMemoryRepository();
    await repo.addEvaluation(evaluation("oc-1", { test_signup: { as: "uzytkownik", place_terc: "1261011" } }));
    await repo.addContact({
      id: "kt-1",
      created_at: "2026-10-03T10:00:00.000Z",
      route_id: null,
      need_id: null,
      target: { type: "innovation", id: "inn-nat-649" },
      requester: { name: "Ala", organisation: null, email: "ala@example.org" },
      message: "Dzień dobry; chcemy wdrożyć ten program.",
      screening: { outcome: "need" },
      consent: { text_version: "v1", timestamp: "2026-10-03T10:00:00.000Z" },
      moderation: pending,
      status: "nowe",
      note_pl: null,
    });
    for (const kind of EXPORT_KINDS) {
      const [header, ...rows] = await exportRows(kind, repo);
      expect(rows.length, kind).toBeGreaterThan(0);
      for (const row of rows) expect(row, kind).toHaveLength(header.length);
    }
  });
});

describe("the queues of the dashboard", () => {
  let repo: Repository;
  beforeEach(() => {
    repo = createMemoryRepository({ ...createMemoryState(), needs: [], readiness: [], ideas: [] });
  });

  it("counts what waits for a decision and what came after the last visit", async () => {
    await repo.addIdea(idea("pm-old", "2026-10-01T10:00:00.000Z"));
    await repo.addIdea(idea("pm-new", "2026-10-03T10:00:00.000Z"));
    // Decided and answered: no longer waits.
    await repo.addIdea(idea("pm-done", "2026-10-03T11:00:00.000Z", { status: "przyjety", moderation: { ...pending, status: "zatwierdzone" } }));
    await repo.addEvaluation(evaluation("oc-1", { moderation: { ...pending, status: "zatwierdzone" } }));
    // Approved, but its test sign-up has not been passed on yet.
    await repo.addEvaluation(evaluation("oc-2", { moderation: { ...pending, status: "zatwierdzone" }, test_signup: { as: "uzytkownik", place_terc: null } }));

    const counts = Object.fromEntries((await queueCounts("2026-10-02T00:00:00.000Z", repo)).map((item) => [item.key, item]));
    expect(counts.ideas).toEqual({ key: "ideas", waiting: 2, fresh: 1 });
    expect(counts.evaluations).toEqual({ key: "evaluations", waiting: 1, fresh: 1 });
    expect(counts.needs.waiting).toBe(0);

    const all = Object.fromEntries((await queueCounts(null, repo)).map((item) => [item.key, item]));
    expect(all.ideas.fresh).toBe(2);
  });
});

describe("the trends of module II", () => {
  it("aggregates needs by group, powiat and week, and leaves rejected evaluations out", async () => {
    const needs: Need[] = exampleNeeds();
    const repo = createMemoryRepository({ ...createMemoryState(), needs, ideas: [] });
    await repo.addEvaluation(evaluation("oc-1", { rating: 5 }));
    await repo.addEvaluation(evaluation("oc-2", { rating: 1, moderation: { ...pending, status: "odrzucone" } }));
    const data = await trends(repo);
    expect(data.totals.needs).toBe(3);
    expect(data.needsByGroup.find((row) => row.key === "dzieci-mlodziez-rodziny")?.count).toBe(2);
    expect(data.needsByWeek).toEqual([{ key: weekStart(needs[0].created_at), count: 3 }]);
    expect(data.rated).toEqual([{ id: "inn-nat-649", ratings: 1, average: 5, testers: 0 }]);
    expect(data.totals.evaluations).toBe(1);
  });

  describe("the questions by group", () => {
    let repo: Repository;
    beforeEach(async () => {
      repo = createMemoryRepository({ ...createMemoryState(), needs: [], ideas: [] });
      await repo.saveRoute(route("rt-1", "2026-10-01T09:00:00.000Z", "route", ["seniorzy", "zdrowie"]));
      await repo.saveRoute(route("rt-2", "2026-10-02T09:00:00.000Z", "partial", ["seniorzy"]));
      // Stored before the composer recorded groups: the reader's answer counts.
      await repo.saveRoute(route("rt-3", "2026-10-02T22:30:00.000Z", "none", undefined, ["cudzoziemcy"]));
      await repo.saveRoute(route("rt-4", "2026-10-03T09:00:00.000Z", "none", []));
      // Not a question about a need.
      await repo.saveRoute(route("rt-5", "2026-10-03T10:00:00.000Z", "declined", undefined, ["seniorzy"]));
      await repo.saveRoute(route("rt-6", "2026-10-03T11:00:00.000Z", "off_topic", []));
    });

    it("counts a question in each of its groups and leaves declined and off-topic routes out", async () => {
      const data = await trends(repo);
      expect(data.questionsByGroup).toEqual([
        { key: "seniorzy", count: 2 },
        { key: "bez-grupy", count: 1 },
        { key: "cudzoziemcy", count: 1 },
        { key: "zdrowie", count: 1 },
      ]);
      expect(data.totals.questions).toBe(4);
    });

    it("lists the questions of a group, newest first", async () => {
      expect((await questions({ group: "seniorzy" }, repo)).map((item) => item.id)).toEqual(["rt-2", "rt-1"]);
      expect((await questions({ group: "bez-grupy" }, repo)).map((item) => item.id)).toEqual(["rt-4"]);
      expect((await questions({}, repo)).map((item) => item.id)).toEqual(["rt-4", "rt-3", "rt-2", "rt-1"]);
    });

    it("filters by the day in Poland, both ends included", async () => {
      // 22:30 UTC on 2 October is 00:30 on 3 October in Poland.
      expect((await questions({ from: "2026-10-03" }, repo)).map((item) => item.id)).toEqual(["rt-4", "rt-3"]);
      expect((await questions({ from: "2026-10-01", to: "2026-10-02" }, repo)).map((item) => item.id)).toEqual(["rt-2", "rt-1"]);
      expect(await questions({ group: "zdrowie", from: "2026-10-02" }, repo)).toEqual([]);
    });
  });

  it("starts a week on Monday", () => {
    expect(weekStart("2026-10-03T09:00:00.000Z")).toBe("2026-09-28");
    expect(weekStart("2026-09-28T00:00:00.000Z")).toBe("2026-09-28");
  });
});
