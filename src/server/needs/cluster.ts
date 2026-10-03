import { createHash } from "node:crypto";
import { z } from "zod";
import type { Need, StageLog } from "@/lib/contracts";
import { t } from "@/lib/i18n";
import { targetGroupLabel } from "@/lib/labels";
import { toStageLog } from "@/lib/llm/observability";
import { loadPrompt } from "@/lib/llm/prompts";
import { LlmError, type Llm, type LlmErrorKind } from "@/lib/llm/types";
import type { BannedWords } from "@/server/route/safety";
import { clean, knownText, needSummary, proseProblem } from "./checks";

/*
 * Clustering of open needs (FR-5.4, SHOULD) with the prompt cluster.md
 * (9.4): the model groups needs by the underlying need and names each
 * group in Polish. It sees short references, the redacted summaries and
 * the codes only, never the reporter (FR-6.6). The server keeps each need
 * in at most one cluster, drops unknown references, and replaces a name
 * that fails the checks by a numbered template. A need the model leaves
 * out stays unclustered and visible (E7: minority needs are not lost).
 */

export const clusterSchema = z.object({
  clusters: z.array(z.object({ name_pl: z.string(), refs: z.array(z.string()) })),
});
export type ClusterOutput = z.infer<typeof clusterSchema>;

export interface ClusterDraft {
  /** Stable for the same members: "cl-" and a hash of the sorted need ids, for Need.cluster_id. */
  id: string;
  name_pl: string;
  need_ids: string[];
}

export interface ClusterResult {
  clusters: ClusterDraft[];
  /** Needs in no cluster, in the order given. */
  unclustered: string[];
  /** Null when no model call was made (fewer than two needs). */
  stage: StageLog | null;
  /** Set when the model failed: the run has no result and nothing should be stored. */
  failed: LlmErrorKind | null;
}

/** Needs per call; the console clusters the newest first. */
export const MAX_CLUSTER_NEEDS = 80;
const NAME_LIMITS = { min: 3, max: 80 };
const EFFORT = "medium";
const MAX_TOKENS = 4000;

/** The needs worth clustering: stored with consent, not closed, not rejected by moderation. */
export function clusterable(needs: Need[]): Need[] {
  return needs
    .filter((need) => need.consents.store && need.status !== "zamknieta" && need.moderation.status !== "odrzucone")
    .slice(0, MAX_CLUSTER_NEEDS);
}

export function clusterId(needIds: string[]): string {
  return `cl-${createHash("sha256").update([...needIds].sort().join("\n")).digest("hex").slice(0, 10)}`;
}

/** The items of the call: a short reference, the redacted summary and the codes. Nothing else of the need. */
export function clusterItems(needs: Need[]): { ref: string; summary: string; target_groups: string[]; domains: string[] }[] {
  return needs.map((need, index) => ({
    ref: `n${index + 1}`,
    summary: needSummary(need).replace(/[<>]/g, " "),
    target_groups: need.target_groups,
    domains: need.domains,
  }));
}

/** Applies the server's rules to the model's grouping. */
export function finishClusters(
  output: ClusterOutput,
  needs: Need[],
  banned?: BannedWords,
): { clusters: ClusterDraft[]; unclustered: string[]; droppedIds: string[]; notes: string[] } {
  const byRef = new Map(needs.map((need, index) => [`n${index + 1}`, need]));
  const items = clusterItems(needs);
  const known = knownText(...items.map((item) => item.summary), ...needs.flatMap((need) => need.target_groups.map(targetGroupLabel)));
  const assigned = new Set<string>();
  const droppedIds: string[] = [];
  const notes: string[] = [];
  const clusters: ClusterDraft[] = [];
  let repeated = 0;

  for (const [index, cluster] of output.clusters.entries()) {
    const ids: string[] = [];
    for (const raw of cluster.refs) {
      const ref = raw.trim();
      const need = byRef.get(ref);
      if (!need) {
        droppedIds.push(ref);
        continue;
      }
      if (assigned.has(need.id)) {
        repeated += 1;
        continue;
      }
      assigned.add(need.id);
      ids.push(need.id);
    }
    if (ids.length === 0) continue;
    const name = clean(cluster.name_pl).replace(/[.!?;:]+$/, "");
    const problem = name ? proseProblem(name, NAME_LIMITS, known, banned) : "empty";
    if (problem) notes.push(`cluster ${index + 1} name templated: ${problem}`);
    clusters.push({ id: clusterId(ids), name_pl: problem ? "" : name, need_ids: ids });
  }
  clusters.forEach((cluster, index) => {
    if (!cluster.name_pl) cluster.name_pl = t("console.clusters.fallback", { number: index + 1 });
  });
  if (droppedIds.length > 0) notes.push(`clusters: ${droppedIds.length} unknown refs dropped`);
  if (repeated > 0) notes.push(`clusters: ${repeated} needs in more than one cluster, first kept`);
  const unclustered = needs.filter((need) => !assigned.has(need.id)).map((need) => need.id);
  if (unclustered.length > 0) notes.push(`clusters: ${unclustered.length} needs left unclustered`);
  return { clusters, unclustered, droppedIds, notes };
}

export async function clusterNeeds(needs: Need[], deps: { llm: Llm; banned?: BannedWords }): Promise<ClusterResult> {
  const open = clusterable(needs);
  if (open.length < 2) return { clusters: [], unclustered: open.map((need) => need.id), stage: null, failed: null };

  const prompt = loadPrompt("cluster");
  const started = Date.now();
  let output: ClusterOutput;
  let stage: StageLog;
  try {
    const result = await deps.llm({
      task: "cluster",
      system: prompt.body,
      promptVersion: prompt.version,
      user: JSON.stringify({ needs: clusterItems(open) }, null, 1),
      schema: clusterSchema,
      effort: EFFORT,
      maxTokens: MAX_TOKENS,
    });
    output = result.parsed;
    stage = toStageLog("cluster", result);
  } catch (error) {
    if (!(error instanceof LlmError)) throw error;
    return {
      clusters: [],
      unclustered: open.map((need) => need.id),
      failed: error.kind,
      stage: {
        stage: "cluster",
        provider: error.provider ?? "none",
        model: "",
        promptVersion: prompt.version,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        latencyMs: Date.now() - started,
        cached: false,
        droppedIds: [],
        droppedReasons: 0,
        notes: [`model failed (${error.kind}): no clusters`],
      },
    };
  }
  const finished = finishClusters(output, open, deps.banned);
  stage.droppedIds.push(...finished.droppedIds);
  stage.notes.push(...finished.notes);
  return { clusters: finished.clusters, unclustered: finished.unclustered, stage, failed: null };
}
