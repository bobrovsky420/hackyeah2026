import { describe, expect, it } from "vitest";
import type { SensitiveTopic, GateTextKind, ScreeningCategory } from "@/lib/contracts";
import { decide, decidesWithoutModel, type DecisionInput } from "@/server/gate/decide";
import type { LexiconHit } from "@/server/gate/lexicon";
import type { ModelScreen } from "@/server/gate/model";
import { DECLINE_MIN_CONFIDENCE, OFF_TOPIC_MIN_CONFIDENCE, REDIRECT_MIN_CONFIDENCE } from "@/server/gate/thresholds";

function model(category: ScreeningCategory, confidence: number, extra: Partial<ModelScreen> = {}): ModelScreen {
  return { category, confidence, individualCase: false, topics: [], personNames: [], summary: null, promptVersion: "screen-v1", ...extra };
}

const noSpam = { repeat: false, repeatOfRedirected: false, links: false };
const noLexicon = { crisis: [] as LexiconHit[], community: [] as LexiconHit[] };

function input(overrides: Partial<DecisionInput>): DecisionInput {
  return { kind: "need" as GateTextKind, lexicon: noLexicon, spam: noSpam, model: model("need", 0.9), ...overrides };
}

const below = (threshold: number) => Math.round((threshold - 0.01) * 100) / 100;

describe("rule 1: the crisis lexicon", () => {
  it("redirects whatever the model says, and needs no model", () => {
    const lexicon = { crisis: [{ topic: "suicide" as SensitiveTopic, entry: "nie$ chce$ ~ zyc$" }], community: [] };
    const decision = decide(input({ lexicon, model: model("need", 0.99) }));
    expect(decision.outcome).toBe("redirected");
    expect(decision.rules_fired).toEqual(["lexicon:nie$ chce$ ~ zyc$"]);
    expect(decision.sensitive_topics).toEqual(["suicide"]);
    expect(decidesWithoutModel({ kind: "need", lexicon, spam: noSpam })).toBe(true);
  });

  it("redirects a repeat of a text that was redirected", () => {
    const decision = decide(input({ spam: { ...noSpam, repeat: true, repeatOfRedirected: true }, model: null }));
    expect(decision.outcome).toBe("redirected");
    expect(decision.rules_fired).toEqual(["repeat:redirected"]);
  });
});

describe("rule 2: deterministic spam", () => {
  it.each([
    [{ ...noSpam, repeat: true }, "spam:repeat"],
    [{ ...noSpam, links: true }, "spam:links"],
  ])("gives off_topic with category spam (%o)", (spam, rule) => {
    const decision = decide(input({ spam, model: null }));
    expect(decision).toMatchObject({ category: "spam", outcome: "off_topic", rules_fired: [rule] });
  });
});

describe("rule 3: no model", () => {
  it("routes, never declines, and shows the banner on a community term", () => {
    const plain = decide(input({ model: null }));
    expect(plain).toMatchObject({ outcome: "need", crisis_banner: false, rules_fired: ["model:unavailable"] });
    const community = { crisis: [], community: [{ topic: "violence" as SensitiveTopic, entry: "przemoc" }] };
    const banner = decide(input({ lexicon: community, model: null }));
    expect(banner).toMatchObject({ outcome: "need", crisis_banner: true, sensitive_topics: ["violence"] });
    expect(banner.rules_fired).toEqual(["model:unavailable", "lexicon-banner:przemoc"]);
  });
});

describe("rule 4: crisis and individual case", () => {
  it.each(["crisis", "individual_case"] as const)("%s at the threshold redirects, just below it routes with the banner", (category) => {
    expect(decide(input({ model: model(category, REDIRECT_MIN_CONFIDENCE) })).outcome).toBe("redirected");
    const doubtful = decide(input({ model: model(category, below(REDIRECT_MIN_CONFIDENCE)) }));
    expect(doubtful).toMatchObject({ outcome: "need", crisis_banner: true });
  });
});

describe("rule 5: harm", () => {
  it("declines at the threshold and routes just below it, without a banner", () => {
    expect(decide(input({ model: model("harm", DECLINE_MIN_CONFIDENCE) })).outcome).toBe("declined");
    expect(decide(input({ model: model("harm", below(DECLINE_MIN_CONFIDENCE)) }))).toMatchObject({ outcome: "need", crisis_banner: false });
  });
});

describe("rule 6: off-topic and spam from the model", () => {
  it.each(["off_topic", "spam"] as const)("%s at the threshold is off_topic, below it a need", (category) => {
    expect(decide(input({ model: model(category, OFF_TOPIC_MIN_CONFIDENCE) })).outcome).toBe("off_topic");
    expect(decide(input({ model: model(category, below(OFF_TOPIC_MIN_CONFIDENCE)) })).outcome).toBe("need");
  });
});

describe("rule 7: need and the crisis banner", () => {
  it("sets the banner for a sensitive topic about a group, not about one person", () => {
    const group = decide(input({ model: model("need", 0.9, { topics: ["suicide"] }) }));
    expect(group).toMatchObject({ outcome: "need", crisis_banner: true, sensitive_topics: ["suicide"] });
    const person = decide(input({ model: model("need", 0.9, { topics: ["suicide"], individualCase: true }) }));
    expect(person.crisis_banner).toBe(false);
    expect(decide(input({})).crisis_banner).toBe(false);
  });

  it("adds the community lexicon's topics to the model's", () => {
    const community = { crisis: [], community: [{ topic: "addiction" as SensitiveTopic, entry: "alkoholizm" }] };
    const decision = decide(input({ lexicon: community, model: model("need", 0.9) }));
    expect(decision).toMatchObject({ crisis_banner: true, sensitive_topics: ["addiction"] });
  });
});

describe("readiness: harm only", () => {
  it("declines harm and routes everything else, even a crisis hit", () => {
    const lexicon = { crisis: [{ topic: null, entry: "gloduje$" }], community: [] };
    expect(decide(input({ kind: "readiness", model: model("harm", 0.8) })).outcome).toBe("declined");
    expect(decide(input({ kind: "readiness", model: model("off_topic", 0.99) })).outcome).toBe("need");
    expect(decide(input({ kind: "readiness", lexicon, model: model("crisis", 0.99) })).outcome).toBe("need");
    expect(decide(input({ kind: "readiness", model: null })).outcome).toBe("need");
    expect(decidesWithoutModel({ kind: "readiness", lexicon, spam: noSpam })).toBe(false);
  });
});
