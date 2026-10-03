import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCatalogue } from "@/lib/catalogue";
import { DataLoadError } from "@/lib/data/load";
import { FIXTURES_VERSION } from "@/lib/mock/fixtures";

/* The facade picks data/ or the fixtures (src/lib/catalogue.ts). */

const DATA = path.join(process.cwd(), "data");
const hasData = fs.existsSync(path.join(DATA, "data-version.json"));
const emptyDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "catalogue-"));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("source selection", () => {
  it("serves the fixtures when forced to mock", () => {
    const data = loadCatalogue({ source: "mock" });
    expect(data.source).toBe("mock");
    expect(data.version).toBe(FIXTURES_VERSION);
    expect(data.gminy).toHaveLength(183);
    expect(data.innovations.length).toBeGreaterThan(0);
    expect(data.dataset).toBeNull();
  });

  it("reads DATA_SOURCE", () => {
    vi.stubEnv("DATA_SOURCE", "mock");
    expect(loadCatalogue().source).toBe("mock");
  });

  it("falls back to the fixtures when data/ is missing, and says why", () => {
    const warn = vi.fn();
    const data = loadCatalogue({ dataDir: emptyDir(), warn });
    expect(data.source).toBe("mock");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/data\/data-version\.json is missing/);
  });

  it("refuses to fall back when forced to data", () => {
    expect(() => loadCatalogue({ source: "data", dataDir: emptyDir(), warn: () => {} })).toThrow(DataLoadError);
  });

  it.skipIf(!hasData)("serves data/ when it loads", () => {
    const data = loadCatalogue({ source: "data" });
    const stamp = JSON.parse(fs.readFileSync(path.join(DATA, "data-version.json"), "utf8")) as { version: string; records: number };
    expect(data.source).toBe("data");
    expect(data.version).toBe(stamp.version);
    expect(data.innovations).toHaveLength(stamp.records);
    expect(data.gminy).toHaveLength(183);
    expect(data.gminy.every((gmina) => gmina.terc.startsWith("12"))).toBe(true);
    expect(data.boundaries.features).toHaveLength(183);
  });
});

describe.skipIf(!hasData)("the fixtures against data/", () => {
  const data = loadCatalogue({ source: "data" });
  const mock = loadCatalogue({ source: "mock" });

  it("has every fixture innovation, with the same title", () => {
    for (const item of mock.innovations) expect(data.innovationById.get(item.id)?.title, item.id).toBe(item.title);
  });

  it("has every innovation the canned routes name", () => {
    const text = fs.readFileSync(path.join(process.cwd(), "src/lib/mock/routes.ts"), "utf8");
    const ids = [...new Set(text.match(/"inn-[a-z0-9-]+"/g) ?? [])].map((id) => id.slice(1, -1));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => !data.innovationById.has(id))).toEqual([]);
  });

  it("keeps the facts the journeys assert (tests/e2e)", () => {
    expect(data.innovationById.get("inn-nat-649")?.title).toBe("Kapsuła czasu - recepta na samotność");
    expect(data.innovationById.get("inn-rops-senior-cuder")?.licence).toBe("MIIS-agreement");
    const proszowice = data.implementations.filter((item) => item.place_terc === "1214053").map((item) => item.innovation_id);
    expect(proszowice).toContain("inn-rops-mobilna-pomoc-terapeutyczna");
    expect(data.pathById.get("asy-priorytet-v")?.name_pl).toMatch(/Aktywni Seniorzy/);
    expect(data.pathById.get("maly-grant-19a")?.applicant_types).toContain("ngo");
  });
});
