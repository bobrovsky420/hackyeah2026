import { describe, expect, it } from "vitest";
import type { Innovation, InnovationOverride, KnowledgeEntry, Route } from "@/lib/contracts";
import { getExampleRoute } from "@/lib/mock/routes";
import { overlayInnovation, overlayRoute, type Overlay } from "@/server/knowledge/overlay";

const route = getExampleRoute("przyklad-seniorzy") as Route;
const data = { knowledge: { always: [], byTargetGroup: new Map(), byId: new Map([["kn-abc", { title: "ABC", url: "https://rops.example/abc.pdf", type: "guide", for_innovation_id: null }]]) } };
const withAbc: Route = { ...route, knowledge: [...route.knowledge, { title: "ABC", url: "https://rops.example/abc.pdf", type: "guide", for_innovation_id: null }] };

function override(id: string, over: Partial<InnovationOverride> = {}): InnovationOverride {
  return { innovation_id: id, status: null, summary_pl: null, extra_materials: [], note_pl: null, updated_at: "2026-10-03T10:00:00.000Z", updated_by: "AT", ...over };
}

function entry(over: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: "wz-1",
    base_id: null,
    title_pl: "Film o samotności",
    description_pl: "",
    url: "https://www.youtube.com/watch?v=x",
    type: "video",
    target_groups: ["seniorzy"],
    always_show: false,
    hidden: false,
    updated_at: "2026-10-03T10:00:00.000Z",
    updated_by: "AT",
    ...over,
  };
}

const overlay = (entries: KnowledgeEntry[], overrides: InnovationOverride[] = []): Overlay => ({
  entries,
  overrides: new Map(overrides.map((item) => [item.innovation_id, item])),
});

describe("the panel's knowledge over a route (module VI)", () => {
  it("returns the route itself without any change of the panel", () => {
    expect(overlayRoute(route, overlay([]), data)).toBe(route);
  });

  it("drops a hidden innovation with its materials, and marks a verified one with its film first", () => {
    const [first, second] = route.solutions.map((solution) => solution.innovation_id);
    const film = { title: "Film", url: "https://www.youtube.com/watch?v=k", type: "video" as const };
    const shown = overlayRoute(route, overlay([], [override(first, { status: "ukryte" }), override(second, { status: "zweryfikowane", extra_materials: [film] })]), data);
    expect(shown.solutions.map((solution) => solution.innovation_id)).not.toContain(first);
    expect(shown.knowledge.some((link) => link.for_innovation_id === first)).toBe(false);
    const verified = shown.solutions.find((solution) => solution.innovation_id === second);
    expect(verified?.verified_by_rops).toBe(true);
    expect(verified?.materials[0]).toEqual(film);
    expect(shown.knowledge).toContainEqual({ ...film, for_innovation_id: second });
    // The stored route is not changed.
    expect(route.solutions[0].innovation_id).toBe(first);
  });

  it("edits or hides a curated item by its id, and adds a new item to the routes of its groups", () => {
    const edited = overlayRoute(withAbc, overlay([entry({ id: "wz-2", base_id: "kn-abc", title_pl: "ABC, wydanie 2", url: "https://rops.example/abc-2.pdf", type: "guide" })]), data);
    expect(edited.knowledge.find((link) => link.title === "ABC, wydanie 2")?.url).toBe("https://rops.example/abc-2.pdf");
    expect(edited.knowledge.some((link) => link.url === "https://rops.example/abc.pdf")).toBe(false);

    const hidden = overlayRoute(withAbc, overlay([entry({ id: "wz-2", base_id: "kn-abc", hidden: true })]), data);
    expect(hidden.knowledge.some((link) => link.url === "https://rops.example/abc.pdf")).toBe(false);

    const added = overlayRoute(route, overlay([entry({})]), data);
    expect(added.knowledge.at(-1)).toEqual({ title: "Film o samotności", url: "https://www.youtube.com/watch?v=x", type: "video", for_innovation_id: null });
    const otherGroup = overlayRoute(route, overlay([entry({ target_groups: ["bezdomnosc"] })]), data);
    expect(otherGroup.knowledge.some((link) => link.title === "Film o samotności")).toBe(false);
    const everywhere = overlayRoute(route, overlay([entry({ target_groups: ["bezdomnosc"], always_show: true })]), data);
    expect(everywhere.knowledge.some((link) => link.title === "Film o samotności")).toBe(true);
  });
});

describe("the panel's word over an innovation's page", () => {
  const innovation = { id: "inn-1", summary: "Z katalogu.", materials: [{ title: "PDF", url: "https://a/x.pdf", type: "pdf" }] } as Innovation;

  it("hides it, corrects its summary and puts the added materials first", () => {
    expect(overlayInnovation(innovation, undefined)).toBe(innovation);
    expect(overlayInnovation(innovation, override("inn-1", { status: "ukryte" }))).toBeNull();
    const shown = overlayInnovation(
      innovation,
      override("inn-1", { summary_pl: "Poprawione.", extra_materials: [{ title: "Film", url: "https://v/1", type: "video" }, { title: "PDF", url: "https://a/x.pdf", type: "document" }] }),
    );
    expect(shown?.summary).toBe("Poprawione.");
    expect(shown?.materials.map((material) => material.url)).toEqual(["https://v/1", "https://a/x.pdf"]);
  });
});
