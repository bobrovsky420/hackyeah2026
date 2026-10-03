import type { SensitiveTopic, GateTextKind, ScreeningCategory, ScreeningOutcome } from "@/lib/contracts";
import type { LexiconHit } from "./lexicon";
import type { ModelScreen } from "./model";
import { DECLINE_MIN_CONFIDENCE, OFF_TOPIC_MIN_CONFIDENCE, REDIRECT_MIN_CONFIDENCE } from "./thresholds";

/*
 * The decision rules of FR-12.3, deterministic, in this order:
 *
 *   1. a crisis lexicon hit, or a repeat of a text that was redirected   -> redirected
 *   2. a repeated identical text, or a text mostly of links              -> off_topic (spam)
 *   3. no model answer                                                   -> need, "model:unavailable"
 *   4. crisis or individual_case at REDIRECT_MIN_CONFIDENCE or more      -> redirected
 *   5. harm at DECLINE_MIN_CONFIDENCE or more                            -> declined
 *   6. off_topic or spam at OFF_TOPIC_MIN_CONFIDENCE or more             -> off_topic
 *   7. otherwise                                                         -> need
 *
 * Principle E3 sets the bias: nothing is declined without the model, and a
 * crisis or an individual case below the threshold is routed with the crisis
 * banner. The banner is set when the need touches a sensitive topic (the
 * model's or the community lexicon's) and is about a group or a place, not
 * one person. A readiness registration's display name is screened for harm
 * only (7.12, first paragraph).
 */

export interface DecisionInput {
  kind: GateTextKind;
  lexicon: { crisis: LexiconHit[]; community: LexiconHit[] };
  spam: { repeat: boolean; repeatOfRedirected: boolean; links: boolean };
  /** Null when the model was not asked or did not answer. */
  model: ModelScreen | null;
}

export interface Decision {
  category: ScreeningCategory;
  confidence: number;
  individual_case: boolean;
  sensitive_topics: SensitiveTopic[];
  outcome: ScreeningOutcome;
  crisis_banner: boolean;
  rules_fired: string[];
}

function topicsOf(hits: LexiconHit[]): SensitiveTopic[] {
  return hits.flatMap((hit) => (hit.topic ? [hit.topic] : []));
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/** Whether the rules need the model at all: a crisis hit or deterministic spam decide alone. */
export function decidesWithoutModel(input: Omit<DecisionInput, "model">): boolean {
  if (input.kind === "readiness") return false;
  return input.lexicon.crisis.length > 0 || input.spam.repeatOfRedirected || input.spam.repeat || input.spam.links;
}

export function decide(input: DecisionInput): Decision {
  const { kind, lexicon, spam, model } = input;
  const communityTopics = topicsOf(lexicon.community);
  const communityRules = lexicon.community.map((hit) => `lexicon-banner:${hit.entry}`);

  if (kind === "readiness") {
    // A display name: only harm matters; nothing is redirected or turned away as off-topic.
    if (model && model.category === "harm" && model.confidence >= DECLINE_MIN_CONFIDENCE) {
      return { ...base(model), outcome: "declined", crisis_banner: false, rules_fired: [`model:harm>=${DECLINE_MIN_CONFIDENCE}`] };
    }
    return {
      category: "need",
      confidence: model?.confidence ?? 0,
      individual_case: false,
      sensitive_topics: [],
      outcome: "need",
      crisis_banner: false,
      rules_fired: ["kind:readiness", model ? `model:${model.category}` : "model:unavailable"],
    };
  }

  if (lexicon.crisis.length > 0 || spam.repeatOfRedirected) {
    return {
      category: "crisis",
      confidence: 1,
      individual_case: model?.individualCase ?? false,
      sensitive_topics: unique([...topicsOf(lexicon.crisis), ...communityTopics]),
      outcome: "redirected",
      crisis_banner: false,
      rules_fired: lexicon.crisis.length > 0 ? lexicon.crisis.map((hit) => `lexicon:${hit.entry}`) : ["repeat:redirected"],
    };
  }

  if (spam.repeat || spam.links) {
    return {
      category: "spam",
      confidence: 1,
      individual_case: false,
      sensitive_topics: [],
      outcome: "off_topic",
      crisis_banner: false,
      rules_fired: [...(spam.repeat ? ["spam:repeat"] : []), ...(spam.links ? ["spam:links"] : [])],
    };
  }

  if (!model) {
    return {
      category: "need",
      confidence: 0,
      individual_case: false,
      sensitive_topics: unique(communityTopics),
      outcome: "need",
      crisis_banner: communityTopics.length > 0,
      rules_fired: ["model:unavailable", ...communityRules],
    };
  }

  const redirecting = model.category === "crisis" || model.category === "individual_case";
  if (redirecting && model.confidence >= REDIRECT_MIN_CONFIDENCE) {
    return { ...base(model), outcome: "redirected", crisis_banner: false, rules_fired: [`model:${model.category}>=${REDIRECT_MIN_CONFIDENCE}`] };
  }
  if (model.category === "harm" && model.confidence >= DECLINE_MIN_CONFIDENCE) {
    return { ...base(model), outcome: "declined", crisis_banner: false, rules_fired: [`model:harm>=${DECLINE_MIN_CONFIDENCE}`] };
  }
  const offTopic = model.category === "off_topic" || model.category === "spam";
  if (offTopic && model.confidence >= OFF_TOPIC_MIN_CONFIDENCE) {
    return { ...base(model), outcome: "off_topic", crisis_banner: false, rules_fired: [`model:${model.category}>=${OFF_TOPIC_MIN_CONFIDENCE}`] };
  }

  const topics = unique([...model.topics, ...communityTopics]);
  const rules = [`model:${model.category}`, ...communityRules];
  // E3: a crisis or an individual case the model is unsure of is routed, with the helplines on top.
  const doubtfulCrisis = redirecting;
  if (doubtfulCrisis) rules.push(`model:${model.category}<${REDIRECT_MIN_CONFIDENCE}:banner`);
  return {
    ...base(model),
    sensitive_topics: topics,
    outcome: "need",
    crisis_banner: doubtfulCrisis || (topics.length > 0 && !model.individualCase),
    rules_fired: rules,
  };
}

function base(model: ModelScreen): Pick<Decision, "category" | "confidence" | "individual_case" | "sensitive_topics"> {
  return { category: model.category, confidence: model.confidence, individual_case: model.individualCase, sensitive_topics: model.topics };
}
