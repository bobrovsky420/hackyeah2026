import { describe, expect, test } from "vitest";
import { t } from "@/lib/i18n";
import { LlmError, type LlmCall } from "@/lib/llm/types";
import { clusterId, clusterNeeds } from "@/server/needs/cluster";
import { fakeLlm, need } from "./fixtures";

/* Clustering of open needs (FR-5.4): each need in at most one cluster, unknown references dropped, names checked. */

const needs = [
  need({ id: "nd-a", summary_pl: "Seniorzy nie mają jak dojechać do przychodni" }),
  need({ id: "nd-b", summary_pl: "Brak zajęć dla młodzieży po szkole" }),
  need({ id: "nd-c", summary_pl: "Starsi mieszkańcy wsi nie docierają na rehabilitację" }),
  need({ id: "nd-d", summary_pl: "Rodziny po podtopieniach zostały bez wsparcia" }),
  need({ id: "nd-closed", status: "zamknieta" }),
];

describe("clusterNeeds", () => {
  test("unknown references and repeated needs are dropped; a need left out stays unclustered", async () => {
    const calls: LlmCall<unknown>[] = [];
    const { clusters, unclustered, stage } = await clusterNeeds(needs, {
      llm: fakeLlm(
        {
          clusters: [
            { name_pl: "Dojazd osób starszych do usług zdrowotnych", refs: ["n1", "n3", "n9"] },
            { name_pl: "Czas wolny młodzieży po szkole", refs: ["n2", "n1"] },
          ],
        },
        calls,
      ),
    });
    expect(clusters).toEqual([
      { id: clusterId(["nd-a", "nd-c"]), name_pl: "Dojazd osób starszych do usług zdrowotnych", need_ids: ["nd-a", "nd-c"] },
      { id: clusterId(["nd-b"]), name_pl: "Czas wolny młodzieży po szkole", need_ids: ["nd-b"] },
    ]);
    expect(unclustered).toEqual(["nd-d"]);
    expect(stage?.droppedIds).toEqual(["n9"]);
    expect(stage?.notes).toContain("clusters: 1 needs in more than one cluster, first kept");
    // A closed need is not clustered; the prompt holds references, summaries and codes only (FR-6.6).
    const user = calls[0].user;
    expect(user).not.toMatch(/nd-|Anna|Nowak|example\.pl|Tajne|Notatka|n5/);
    expect(user).toContain("Seniorzy nie mają jak dojechać do przychodni");
  });

  test("a name with a banned word, an amount or a new name gets the numbered template", async () => {
    const { clusters, stage } = await clusterNeeds(needs, {
      llm: fakeLlm({
        clusters: [
          { name_pl: "Rodziny dysfunkcyjne", refs: ["n4"] },
          { name_pl: "Dojazd dla seniorów w Nowym Sączu", refs: ["n1", "n3"] },
          { name_pl: "Zajęcia za 500 zł", refs: ["n2"] },
        ],
      }),
    });
    expect(clusters.map((cluster) => cluster.name_pl)).toEqual([
      t("console.clusters.fallback", { number: 1 }),
      t("console.clusters.fallback", { number: 2 }),
      t("console.clusters.fallback", { number: 3 }),
    ]);
    expect(stage?.notes).toEqual([
      "cluster 1 name templated: banned:stigmatising",
      "cluster 2 name templated: new-name",
      "cluster 3 name templated: amount-or-date",
    ]);
  });

  test("fewer than two open needs make no call; a model error leaves every need unclustered", async () => {
    const one = await clusterNeeds([needs[0], needs[4]], { llm: fakeLlm({ clusters: [] }) });
    expect(one).toEqual({ clusters: [], unclustered: ["nd-a"], stage: null, failed: null });

    const failed = await clusterNeeds(needs, {
      llm: fakeLlm(() => {
        throw new LlmError("invalid_output", "cluster", "bad", "openai-compatible");
      }),
    });
    expect(failed.clusters).toEqual([]);
    expect(failed.failed).toBe("invalid_output");
    expect(failed.unclustered).toEqual(["nd-a", "nd-b", "nd-c", "nd-d"]);
    expect(failed.stage?.notes).toEqual(["model failed (invalid_output): no clusters"]);
  });
});
