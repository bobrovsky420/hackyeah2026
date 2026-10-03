import { loadDataset } from "@/lib/data/load";
import type { Need } from "@/lib/contracts/records";
import type { LlmCall, Llm } from "@/lib/llm/types";
import type { Brief } from "@/lib/contracts/brief";
import type { Assessment, MatchResult } from "@/server/contracts";

/* Shared fixtures of the needs-bank tests: the real dataset, a need, a template brief and a fake model. */

export const TODAY = "2026-09-29";
export const dataset = loadDataset({ today: TODAY });
export const BATHROOMS = "inn-rops-przenosne-modularne-lazienki";
export const SENIORS = "inn-nat-649";

export function need(over: Partial<Need> = {}): Need {
  return {
    id: "nd-test-1",
    created_at: "2026-09-29T10:00:00+02:00",
    route_id: null,
    problem_text:
      "Po ulewie woda weszła do kilkudziesięciu domów w dolinie. Ludzie suszą ściany, dzieci śpią u krewnych. Nikt tego nie koordynuje.",
    summary_pl: "Rodziny po podtopieniach zostały bez wsparcia",
    place_terc: "1216143",
    role: "urzad-gminy",
    target_groups: ["dzieci-mlodziez-rodziny"],
    domains: ["mieszkalnictwo"],
    reporter: { name: "Anna Nowak", organisation: "Stowarzyszenie Tajne", email: "anna.nowak@example.pl" },
    consents: { store: true, publish_anonymised: true, contact: true, text_version: "consent-v1", timestamp: "2026-09-29T10:00:00+02:00" },
    status: "nowa",
    moderation: { status: "zatwierdzone", reviewer: "rops-1", decided_at: "2026-09-29T11:00:00+02:00", reason_pl: null },
    cluster_id: null,
    nearest_matches: [],
    brief_id: null,
    note_pl: "Notatka konsoli o Annie",
    example: false,
    ...over,
  };
}

export function template(over: Partial<Brief> = {}): Brief {
  return {
    needId: "nd-test-1",
    generatedAt: "2026-09-29T12:00:00+02:00",
    title: "Rodziny po podtopieniach zostały bez wsparcia",
    problem: need().problem_text,
    groups: ["dzieci-mlodziez-rodziny"],
    placeTerc: "1216143",
    indicators: [{ key: "social-assistance", value: 42.5, year: 2024, median: 38.1 }],
    matches: [],
    similarNeeds: [],
    gaps: [],
    implementerTypes: ["ngo"],
    partnersNearby: [],
    readinessCount: 0,
    paths: dataset.paths.slice(0, 2),
    sources: [{ title: "ROPS w Krakowie, ABC Diagnozy", url: "https://rops.krakow.pl/abc.pdf" }],
    gapText: null,
    direction: null,
    helplines: null,
    generation: null,
    ...over,
  };
}

export function assessment(id: string, score: number, gaps: string[] = ["Nie obejmuje koordynacji pomocy sąsiedzkiej."]): Assessment {
  return {
    id,
    fit_score: score,
    fit_reasons: [{ field: "problem_pl", quote: "cytat", why_pl: "Odpowiada na potrzebę wsparcia w domu." }],
    gaps_pl: gaps,
    adaptation_note_pl: null,
  };
}

export function matchResult(assessments: Assessment[]): MatchResult {
  return {
    mode: "none",
    mode_reason_pl: null,
    need_summary_pl: null,
    detected_target_groups: [],
    detected_domains: [],
    retrieved_ids: assessments.map((item) => item.id),
    candidates: [],
    assessments,
    top_ids: [],
    clarification_needed: false,
    stages: [],
  };
}

/** A model that answers with `output` (or throws), recording what it was asked. */
export function fakeLlm(output: unknown | (() => never), calls: LlmCall<unknown>[] = []): Llm {
  return (async <T>(call: LlmCall<T>) => {
    calls.push(call as LlmCall<unknown>);
    const value = typeof output === "function" ? (output as () => never)() : output;
    return {
      parsed: call.schema.parse(value),
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0 },
      latencyMs: 42,
      provider: "fake",
      model: "fake-model",
      promptVersion: call.promptVersion,
      cached: false,
    };
  }) as Llm;
}
