import type { SensitiveTopic } from "@/lib/contracts/route";
import { fold } from "@/lib/text";

/*
 * Stand-in for the screening gate (7.12) and the matching engine: picks a
 * canned route by keywords, mirroring the expected outcomes of the sets of
 * 13.1. Order matters: a person in crisis first (R01-R03: first-person or
 * individual wording only), then harm, then off-topic, then the sensitive
 * topics at community level, which keep their route and get the crisis
 * banner (S01-S03), then the example topics. Keywords are diacritics-free.
 * The real gate and its lexicon come from Developer 1 and the lawyer.
 */

export interface Scenario {
  routeId: string;
  sensitiveTopics: SensitiveTopic[];
  /** Neither a topic nor a group was recognised: S3 may ask the question of FR-2.3. */
  unrecognised: boolean;
}

const crisis = [
  /nie chce (juz )?zyc/,
  /(chce|chcialbym|chcialabym) (sie )?zabic/,
  /zabic sie/,
  /odebrac sobie zycie/,
  /mysle o samobojstwie/,
  /nie daje (juz )?rady/,
  /(maz|zona|partner|partnerka|ojciec|ojczym|matka|sasiad|sasiadka) (mnie |ja |go |je )?(bije|katuje|molestuje)/,
  /bije (moje |swoje )?(dziecko|dzieci|zone|meza)/,
  /przemoc w (moim|naszym) domu/,
  /grozi mi/,
  /molestuje/,
  /gloduje/,
];
const harm = [/pozbyc sie/, /wyrzucic z/, /nie wpuszczac/, /zakazac wstepu/];
const offTopic = [/\btest\b/, /lorem/, /asdf/, /przepis na/, /sernik/, /wiersz/, /reklam/, /sprzedam/, /kupie/];

const sensitive: { topic: SensitiveTopic; routeId: string; keywords: RegExp[] }[] = [
  { topic: "suicide", routeId: "przyklad-zdrowie-psychiczne", keywords: [/samoboj/] },
  { topic: "self_harm", routeId: "przyklad-zdrowie-psychiczne", keywords: [/samookalecz/, /samouszkodz/] },
  { topic: "violence", routeId: "przyklad-przemoc", keywords: [/przemoc/, /niebiesk(a|ie|ich) kart/] },
  { topic: "child_abuse", routeId: "przyklad-przemoc", keywords: [/krzywdzeni[ea] dzieci/, /zaniedbywani[ea] dzieci/] },
  { topic: "addiction", routeId: "brak-rozwiazania", keywords: [/uzaleznien/, /alkoholizm/, /nalog/, /narkotyk/, /dopalacz/] },
];

const topics: { routeId: string; keywords: RegExp[] }[] = [
  { routeId: "przyklad-zdrowie-psychiczne", keywords: [/depresj/, /zdrowi[ae] psychiczn/, /kryzys(ie|u)? psychiczn/, /psychiatr/] },
  { routeId: "przyklad-mlodziez", keywords: [/mlodziez/, /nastolat/, /alkohol/, /przystan/] },
  { routeId: "przyklad-dzieci", keywords: [/ukrain/, /lekcj/, /korepetyc/, /cudzoziem/, /uchodz/] },
  { routeId: "przyklad-seniorzy", keywords: [/senior/, /starsz/, /emeryt/, /samotn/] },
];

/** Words that name a group or a setting; without any of them stage 1 would find no target group. */
const groupWords = [
  /mieszkan/, /rodzin/, /dziec/, /dzieci/, /mlodziez/, /senior/, /starsz/, /osob/, /kobiet/, /mezczyzn/,
  /niepelnospraw/, /bezrobot/, /bezdom/, /cudzoziem/, /chor/, /pacjent/, /uczn/, /wies/, /wsi\b/, /miast/,
  /gmin/, /opiekun/, /sasiad/, /pracownik/,
];

export function pickScenario(problemText: string, targetGroups: string[] = []): Scenario {
  const text = fold(problemText);
  const matches = (keywords: RegExp[]) => keywords.some((pattern) => pattern.test(text));
  const plain = (routeId: string): Scenario => ({ routeId, sensitiveTopics: [], unrecognised: false });

  if (matches(crisis)) return plain("pomoc-czlowieka");
  if (matches(harm)) return plain("z-tym-nie-pomozemy");
  if (matches(offTopic)) return plain("inny-cel");

  const hits = sensitive.filter((rule) => matches(rule.keywords));
  if (hits.length > 0) {
    return { routeId: hits[0].routeId, sensitiveTopics: [...new Set(hits.map((rule) => rule.topic))], unrecognised: false };
  }
  const topic = topics.find((rule) => matches(rule.keywords));
  if (topic) return plain(topic.routeId);
  return { routeId: "brak-rozwiazania", sensitiveTopics: [], unrecognised: targetGroups.length === 0 && !matches(groupWords) };
}
