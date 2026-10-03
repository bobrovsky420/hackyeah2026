import { describe, expect, test } from "vitest";
import type { Path } from "@/lib/data/types";
import { loadDataset } from "@/lib/data/load";
import {
  applicantTypesForRole,
  fitsCostBand,
  KRAKOW_TERC,
  nextDeadline,
  selectPaths,
  type PathContext,
} from "@/server/route/paths";

/* The selection rules of 8.7 (FR-8.2), one by one, on hand-built paths; then a check on the real files. */

const TODAY = "2026-10-03";

function makePath(id: string, over: Partial<Path> = {}): Path {
  return {
    id,
    name_pl: id,
    legal_basis_pl: "",
    applicant_types: ["jst"],
    decides: "jst",
    purposes: ["zadanie-publiczne"],
    target_groups: ["any"],
    scope: "krajowa",
    amount_min_pln: null,
    amount_max_pln: 50_000,
    amount_note_pl: "",
    timing: { kind: "closed", note_pl: "", calls: [] },
    decision_maker_pl: "",
    steps_pl: [],
    fit: { cost_bands: ["low", "medium", "high", "unknown"], roles: [], boost_when_implementer_types: [] },
    source_url: "",
    verified_on: TODAY,
    reviewer: null,
    notes_pl: "",
    ...over,
  };
}

function ctx(over: Partial<PathContext> = {}): PathContext {
  return {
    role: "pracownik-instytucji",
    today: TODAY,
    placeTerc: "1207062",
    targetGroups: ["seniorzy"],
    mode: "route",
    best: { costBand: "low", implementerTypes: ["ngo"], evidenceLevel: "tested" },
    ...over,
  };
}

const ids = (paths: Path[], context: PathContext) => selectPaths(paths, context).paths.map((item) => item.path.id);

describe("rule 1: applicant type from the role", () => {
  test("the four roles and no role", () => {
    expect(applicantTypesForRole("pracownik-instytucji")).toEqual(["jst"]);
    expect(applicantTypesForRole("urzad-gminy")).toEqual(["jst"]);
    expect(applicantTypesForRole("organizacja-spoleczna")).toEqual(["ngo"]);
    expect(applicantTypesForRole("mieszkaniec")).toEqual(["mieszkancy", "ngo"]);
    expect(applicantTypesForRole(null)).toEqual(["ngo", "jst"]);
  });

  test("the route shows the first choice", () => {
    expect(selectPaths([], ctx({ role: "mieszkaniec" })).applicantType).toBe("mieszkancy");
  });
});

describe("rule 2: filters", () => {
  test("by applicant type", () => {
    const paths = [makePath("for-jst"), makePath("for-ngo", { applicant_types: ["ngo"] })];
    expect(ids(paths, ctx())).toEqual(["for-jst"]);
    expect(ids(paths, ctx({ role: "organizacja-spoleczna" }))).toEqual(["for-ngo"]);
  });

  test("a resident gets residents' paths first and organisation paths as the second choice", () => {
    const paths = [
      makePath("ngo-rolling", { applicant_types: ["ngo"], timing: { kind: "rolling", note_pl: "", calls: [] } }),
      makePath("residents", { applicant_types: ["mieszkancy"] }),
    ];
    expect(ids(paths, ctx({ role: "mieszkaniec" }))).toEqual(["residents", "ngo-rolling"]);
  });

  test("by cost band: a maximum below the band's lower bound drops the path", () => {
    const small = makePath("small", { amount_max_pln: 6_000 });
    const grant = makePath("grant", { amount_max_pln: 20_000 });
    expect(fitsCostBand(small, "low")).toBe(true);
    expect(fitsCostBand(small, "medium")).toBe(false);
    expect(fitsCostBand(grant, "medium")).toBe(true);
    expect(fitsCostBand(grant, "high")).toBe(false);
    expect(ids([small, grant], ctx({ best: { costBand: "medium", implementerTypes: [], evidenceLevel: "tested" } }))).toEqual([
      "grant",
    ]);
  });

  test("an unknown band filters nothing; a path without a PLN maximum uses its fit.cost_bands", () => {
    const eur = makePath("eur", { amount_max_pln: null, fit: { cost_bands: ["high"], roles: [], boost_when_implementer_types: [] } });
    expect(fitsCostBand(eur, "unknown")).toBe(true);
    expect(fitsCostBand(eur, "low")).toBe(false);
    expect(fitsCostBand(eur, "high")).toBe(true);
    expect(fitsCostBand(makePath("tiny", { amount_max_pln: 1 }), "unknown")).toBe(true);
  });

  test("by target group: any always matches, another group does not", () => {
    const paths = [
      makePath("any"),
      makePath("seniors", { target_groups: ["seniorzy"] }),
      makePath("children", { target_groups: ["dzieci-mlodziez-rodziny"] }),
    ];
    expect(ids(paths, ctx())).toEqual(["seniors", "any"]);
    expect(ids(paths, ctx({ targetGroups: [] }))).toEqual(["any"]);
  });

  test("by scope: Kraków paths only in Kraków, Małopolska paths not elsewhere", () => {
    const paths = [makePath("krakow", { scope: "krakow" }), makePath("region", { scope: "malopolska" })];
    expect(ids(paths, ctx())).toEqual(["region"]);
    expect(ids(paths, ctx({ placeTerc: KRAKOW_TERC }))).toEqual(["krakow", "region"]);
    expect(ids(paths, ctx({ placeTerc: "1465011" }))).toEqual([]);
    expect(ids(paths, ctx({ placeTerc: null }))).toEqual(["region"]);
  });
});

describe("rule 3: score", () => {
  test("+3 when the path names the target group", () => {
    const [first] = selectPaths([makePath("seniors", { target_groups: ["seniorzy"] })], ctx()).paths;
    expect(first.score).toBe(3);
    expect(first.reasons.targetGroup).toBe("seniorzy");
  });

  test("+2 when a deadline is within 90 days, not later and not for another applicant", () => {
    const call = (closes: string, applicants: Path["applicant_types"] = ["jst"]) => ({
      kind: "fixed" as const,
      note_pl: "",
      calls: [{ label_pl: "", applicant_types: applicants, opens_on: null, closes_on: closes }],
    });
    const soon = makePath("soon", { timing: call("2027-01-01") });
    const late = makePath("late", { timing: call("2027-01-02") });
    const other = makePath("other", { applicant_types: ["jst", "ngo"], timing: call("2026-10-10", ["ngo"]) });
    const scores = Object.fromEntries(selectPaths([soon, late, other], ctx()).paths.map((item) => [item.path.id, item.score]));
    expect(scores).toEqual({ soon: 2, late: 0, other: 0 });
  });

  test("an annual call that passed rolls forward a year", () => {
    const annual = makePath("annual", {
      timing: { kind: "annual", note_pl: "", calls: [{ label_pl: "", applicant_types: ["jst"], opens_on: null, closes_on: "2026-09-28" }] },
    });
    expect(nextDeadline(annual, "jst", TODAY)).toBe("2027-09-28");
    const fixed = makePath("fixed", { timing: { ...annual.timing, kind: "fixed" } });
    expect(nextDeadline(fixed, "jst", TODAY)).toBeNull();
  });

  test("+1 for a rolling path and +1 for a regional one", () => {
    const paths = [
      makePath("national"),
      makePath("rolling", { timing: { kind: "rolling", note_pl: "", calls: [] } }),
      makePath("regional-rolling", { scope: "malopolska", timing: { kind: "rolling", note_pl: "", calls: [] } }),
    ];
    const selected = selectPaths(paths, ctx()).paths;
    expect(selected.map((item) => [item.path.id, item.score])).toEqual([
      ["regional-rolling", 2],
      ["rolling", 1],
      ["national", 0],
    ]);
  });

  test("ties: an open path before a closed one, then the id", () => {
    const paths = [makePath("b-closed"), makePath("c-per-call", { timing: { kind: "per-call", note_pl: "", calls: [] } }), makePath("a-closed")];
    expect(ids(paths, ctx())).toEqual(["c-per-call", "a-closed", "b-closed"]);
  });
});

describe("rule 4: at most three, and the gmina's vehicle for a service model", () => {
  const many = ["p1", "p2", "p3", "p4"].map((id) => makePath(id, { target_groups: ["seniorzy"] }));
  const cus = makePath("cus", { amount_max_pln: null, purposes: ["program-uslug-spolecznych"], scope: "lokalna" });

  test("at most three paths", () => {
    expect(ids(many, ctx())).toHaveLength(3);
  });

  test("a service model brings in the CUS programme for a gmina", () => {
    const serviceModel = ctx({ best: { costBand: "low", implementerTypes: ["ops-cus-pcpr"], evidenceLevel: "tested" } });
    const selected = selectPaths([...many, cus], serviceModel).paths;
    expect(selected.map((item) => item.path.id)).toEqual(["p1", "p2", "cus"]);
    expect(selected[2].reasons.vehicle).toBe(true);
    const regional = ctx({ best: { costBand: "low", implementerTypes: ["ngo"], evidenceLevel: "in-regional-model" } });
    expect(ids([...many, cus], regional)).toContain("cus");
  });

  test("no vehicle when the best solution is not a service model or the applicant is not a gmina", () => {
    expect(ids([...many, cus], ctx())).not.toContain("cus");
    const ngo = ctx({ role: "organizacja-spoleczna", best: { costBand: "low", implementerTypes: ["ops-cus-pcpr"], evidenceLevel: "tested" } });
    expect(ids([...many.map((path) => ({ ...path, applicant_types: ["ngo" as const] })), cus], ngo)).not.toContain("cus");
  });

  test("partial and none: the incubator call is included and the cost filter is the pilot's low band", () => {
    const incubator = makePath("incubator", { purposes: ["testowanie-innowacji"], amount_max_pln: 120_000 });
    const tiny = makePath("tiny", { amount_max_pln: 1_000, target_groups: ["seniorzy"] });
    const partial = ctx({ mode: "partial", best: { costBand: "high", implementerTypes: [], evidenceLevel: "tested" } });
    const selected = selectPaths([...many, incubator, tiny], partial).paths;
    expect(selected.map((item) => item.path.id)).toContain("incubator");
    expect(selected.find((item) => item.path.id === "incubator")?.reasons.createNew).toBe(true);
    expect(ids([tiny], partial)).toEqual(["tiny"]);
    const eurOnly = makePath("eur", { amount_max_pln: null, fit: { cost_bands: ["high"], roles: [], boost_when_implementer_types: [] } });
    expect(ids([eurOnly], partial)).toEqual([]);
    expect(selectPaths([eurOnly], partial).costBand).toBe("low");
  });
});

describe("the real paths of data/built/paths", () => {
  const dataset = loadDataset({ today: TODAY });

  test("a gmina with a low-cost senior service gets the senior programme and the CUS programme", () => {
    const chosen = ids(
      dataset.raw.paths,
      ctx({ best: { costBand: "low", implementerTypes: ["ops-cus-pcpr", "ngo"], evidenceLevel: "tested" } }),
    );
    expect(chosen).toHaveLength(3);
    expect(chosen).toContain("asy-priorytet-v");
    expect(chosen).toContain("cus-program-uslug");
  });

  test("every role gets at least one path, and never one it cannot apply for", () => {
    for (const role of ["pracownik-instytucji", "organizacja-spoleczna", "mieszkaniec", "urzad-gminy", null] as const) {
      const selection = selectPaths(dataset.raw.paths, ctx({ role }));
      expect(selection.paths.length).toBeGreaterThan(0);
      const allowed = applicantTypesForRole(role);
      for (const { path, reasons } of selection.paths) {
        if (!reasons.vehicle) expect(path.applicant_types.some((type) => allowed.includes(type))).toBe(true);
      }
    }
  });
});
