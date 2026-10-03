import "server-only";
import type { ImplementationPath } from "@/lib/contracts/path";
import type { Need } from "@/lib/contracts/records";
import type { Route } from "@/lib/contracts/route";
import { getInnovation } from "@/lib/mock/data";
import { indicatorFacts, indicatorValue, type IndicatorKey } from "@/lib/mock/indicators";
import { getPath } from "@/lib/mock/paths";
import { getRoute } from "./routes";
import { countEvent, nowIso, store } from "./store";

/*
 * The brief of FR-5.5 ("Fiszka potrzeby dla inkubatora"), assembled from
 * the need, its route and the data, standing in for the prompt brief.md.
 * The section order follows the IWS 2.0 application form (8.5). The
 * direction is always a hypothesis.
 */

export const INCUBATOR_PAGE = "https://rops.krakow.pl/realizowane-projekty-i-zadania/inkubator-wlaczenia-spolecznego-20";
const ABC_DIAGNOZY = "https://rops.krakow.pl/mpliki/MACIUS/ABC_Diagnozy_final.pdf";
const BDL = "https://bdl.stat.gov.pl/";

/** The paths of FR-5.5: the incubator call, the small grant and the local initiative; the ROPS advice is a line of its own. */
const BRIEF_PATHS = ["iws-inkubator", "maly-grant-19a", "inicjatywa-lokalna"];
const SCALE_INDICATORS: IndicatorKey[] = ["social-assistance", "ageing", "unemployment"];

export interface BriefMatch {
  id: string;
  title: string;
  sourceUrl: string;
  fits: string[];
  lacks: string[];
}

export interface Brief {
  needId: string;
  generatedAt: string;
  title: string;
  problem: string;
  groups: string[];
  placeTerc: string | null;
  indicators: { key: IndicatorKey; value: number; year: number; median: number }[];
  matches: BriefMatch[];
  /** Other needs of the same category and gmina: the duplicate check of FR-5.3. */
  similarNeeds: { summary: string; createdAt: string }[];
  gaps: string[];
  implementerTypes: string[];
  partnersNearby: Route["people"]["implementers_nearby"];
  readinessCount: number;
  paths: ImplementationPath[];
  sources: { title: string; url: string }[];
}

function firstSentence(text: string): string {
  const sentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return sentence.length > 110 ? `${sentence.slice(0, 107).trimEnd()}…` : sentence.replace(/[.!?]$/, "");
}

export function buildBrief(need: Need): Brief {
  const route = need.route_id ? (getRoute(need.route_id) ?? null) : null;
  const groups = need.target_groups.length > 0 ? need.target_groups : (route?.input.target_groups ?? []);
  const matches: BriefMatch[] = (route?.solutions ?? []).flatMap((solution) => {
    const item = getInnovation(solution.innovation_id);
    if (!item) return [];
    return [
      {
        id: item.id,
        title: item.title,
        sourceUrl: item.sourceUrl,
        fits: solution.fit_reasons.map((reason) => reason.why_pl),
        lacks: solution.gaps_pl,
      },
    ];
  });

  const indicators = need.place_terc
    ? SCALE_INDICATORS.flatMap((key) => {
        const value = indicatorValue(need.place_terc as string, key);
        if (value === null) return [];
        const facts = indicatorFacts(key);
        return [{ key, value, year: facts.year, median: facts.median }];
      })
    : [];

  const similarNeeds = store.needs
    .filter(
      (other) =>
        other.id !== need.id &&
        other.place_terc === need.place_terc &&
        other.target_groups.some((group) => groups.includes(group)),
    )
    .map((other) => ({ summary: other.summary_pl ?? firstSentence(other.problem_text), createdAt: other.created_at }));

  const readinessCount = store.readiness.filter(
    (entry) =>
      entry.verification.status !== "odrzucone" &&
      (need.place_terc === null || entry.place_terc === need.place_terc) &&
      entry.topics.some((topic) => groups.includes(topic)),
  ).length;

  const paths = BRIEF_PATHS.map(getPath).filter((path): path is ImplementationPath => path !== undefined);
  const sources = [
    ...matches.map((match) => ({ title: match.title, url: match.sourceUrl })),
    ...(indicators.length > 0 ? [{ title: "GUS, Bank Danych Lokalnych (CC BY 4.0)", url: BDL }] : []),
    { title: "ROPS w Krakowie, ABC Diagnozy", url: ABC_DIAGNOZY },
    ...paths.map((path) => ({ title: path.name_pl, url: path.source_url })),
  ];

  return {
    needId: need.id,
    generatedAt: nowIso(),
    // A working title, not a sentence: no full stop at the end.
    title: (need.summary_pl ?? route?.need_summary_pl ?? firstSentence(need.problem_text)).replace(/[.!?]$/, ""),
    problem: need.problem_text,
    groups,
    placeTerc: need.place_terc,
    indicators,
    matches,
    similarNeeds,
    gaps: [...new Set(matches.flatMap((match) => match.lacks))],
    implementerTypes: [...new Set((route?.solutions ?? []).flatMap((solution) => solution.what_it_takes.implementer_types))],
    partnersNearby: route?.people.implementers_nearby ?? [],
    readinessCount,
    paths,
    sources,
  };
}

/** The brief of a stored need; the first generation counts as brief_generated (FR-10.2). */
export function getBrief(needId: string): Brief | null {
  const need = store.needs.find((entry) => entry.id === needId);
  if (!need) return null;
  if (!store.briefs.has(need.id)) {
    store.briefs.add(need.id);
    countEvent("brief_generated");
  }
  return buildBrief(need);
}
