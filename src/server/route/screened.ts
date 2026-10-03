import { randomInt } from "node:crypto";
import type { Route } from "@/lib/contracts/route";
import type { Dataset } from "@/lib/data/to-contracts";
import { t } from "@/lib/i18n";
import { ropsDepartment } from "@/lib/catalogue";
import type { GateOutput } from "@/server/contracts";
import { DEFAULT_ADVISOR_CATEGORY } from "./people";

/*
 * The outcomes that replace a route (7.12, S10, S11): redirected, declined,
 * off_topic, and the mild declined of FR-12.12 (a model refusal after the
 * gate passed the text as a need). No solutions, no text of the reader
 * (S10 stores none, S11 never shows it back), a reference code for a
 * declined request.
 */

/** "HM-2026-0417": the code S11 shows and the appeal quotes (FR-12.6). */
export function referenceCode(createdAt: string): string {
  const year = /^\d{4}/.exec(createdAt)?.[0] ?? String(new Date().getUTCFullYear());
  return `HM-${year}-${randomInt(1000, 10000)}`;
}

export function screeningOf(gate: GateOutput): Route["screening"] {
  const { screening } = gate;
  return {
    category: screening.category,
    confidence: screening.confidence,
    sensitive_topics: screening.sensitive_topics,
    redactions: gate.redactionCount,
    crisis_banner: screening.crisis_banner,
  };
}

function advisorOf(dataset: Dataset | undefined): Route["people"]["advisor"] {
  const advisor = dataset?.advisorByCategory.get(DEFAULT_ADVISOR_CATEGORY);
  if (advisor) return advisor;
  return {
    category: DEFAULT_ADVISOR_CATEGORY,
    name: null,
    role: ropsDepartment().name,
    email: ropsDepartment().email,
    phone: ropsDepartment().phone,
  };
}

/**
 * The route of a screened outcome. The mode is the gate's outcome; a gate
 * outcome "need" means the model refused later, which is the mild declined
 * of FR-12.12 with its own sentence as the mode reason. The dataset, when
 * given, supplies the advisor row and the data version.
 */
export function buildScreenedRoute(
  routeId: string,
  createdAt: string,
  input: Route["input"],
  gate: GateOutput,
  dataset?: Dataset,
): Route {
  const outcome = gate.screening.outcome;
  const mode = outcome === "need" ? "declined" : outcome;
  const mild = outcome === "need";
  return {
    id: routeId,
    created_at: createdAt,
    input: { ...input, problem_text: null },
    mode,
    need_summary_pl: null,
    mode_reason_pl: mild ? t("route.declined.mild") : null,
    screening: screeningOf(gate),
    clarification_needed: false,
    summary_pl: null,
    solutions: [],
    knowledge: [],
    people: {
      innovators: [],
      implementers_nearby: [],
      advisor: advisorOf(dataset),
      readiness: { count: 0, names_with_consent: [] },
    },
    path: { applicant_type: "", cost_band: "unknown", paths: [] },
    next_steps: [],
    unknowns_pl: [],
    engine: {
      provider: gate.stage?.provider ?? "rules",
      model: gate.stage?.model ?? "",
      prompt_version: gate.stage?.promptVersion ?? gate.screening.prompt_version ?? "",
      data_version: dataset?.version ?? "",
      latency_ms: gate.stage?.latencyMs ?? 0,
      cached: gate.stage?.cached ?? false,
    },
    label_pl: t("route.generated.label"),
    reference_code: mode === "declined" ? referenceCode(createdAt) : null,
  };
}
