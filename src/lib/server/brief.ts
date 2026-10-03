import type { Brief, BriefMatch } from "@/lib/contracts/brief";
import type { ImplementationPath } from "@/lib/contracts/path";
import type { Need } from "@/lib/contracts/records";
import type { Route } from "@/lib/contracts/route";
import { getInnovation, getPath, indicators as indicatorSet } from "@/lib/catalogue";
import type { IndicatorKey } from "@/lib/contracts/map";
import { repository } from "@/server/db";
import { indicatorFacts } from "./map";
import { getRoute } from "./routes";
import { nowIso } from "./store";

export type { Brief, BriefMatch } from "@/lib/contracts/brief";

/*
 * The template of the brief of FR-5.5 ("Fiszka potrzeby dla inkubatora"),
 * assembled from the need, its route and the data. The prompt brief.md
 * writes the prose parts on top of it (src/server/needs/brief.ts), and
 * src/server/needs/service.ts generates and stores the result once. The
 * section order follows the IWS 2.0 application form (8.5). The direction
 * is always a hypothesis.
 */

export const INCUBATOR_PAGE = "https://rops.krakow.pl/realizowane-projekty-i-zadania/inkubator-wlaczenia-spolecznego-20";
const ABC_DIAGNOZY = "https://rops.krakow.pl/mpliki/MACIUS/ABC_Diagnozy_final.pdf";
const BDL = "https://bdl.stat.gov.pl/";

/**
 * The paths of FR-5.5: the incubator call, the small grant and the local
 * initiative; the ROPS advice is a line of its own. The incubator is
 * iws-2-inkubator in data/paths/ and iws-inkubator in the fixtures.
 */
const BRIEF_PATHS = [["iws-2-inkubator", "iws-inkubator"], ["maly-grant-19a"], ["inicjatywa-lokalna"]];
const SCALE_INDICATORS: IndicatorKey[] = ["social-assistance", "ageing", "unemployment"];

function firstSentence(text: string): string {
  const sentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return sentence.length > 110 ? `${sentence.slice(0, 107).trimEnd()}…` : sentence.replace(/[.!?]$/, "");
}

/** The template; `given` is the need's route when the caller already read it (null: none). */
export async function buildBrief(need: Need, given?: Route | null): Promise<Brief> {
  const route = given !== undefined ? given : need.route_id ? ((await getRoute(need.route_id)) ?? null) : null;
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

  const values = need.place_terc ? (indicatorSet().values[need.place_terc] ?? {}) : {};
  const indicators = SCALE_INDICATORS.flatMap((key) => {
    const entry = values[key];
    const { median } = indicatorFacts(key);
    return entry && median !== null ? [{ key, value: entry.value, year: entry.year, median }] : [];
  });

  const repo = repository();
  const similarNeeds = (await repo.listNeeds({ places: [need.place_terc] }))
    .filter(
      (other) =>
        other.id !== need.id &&
        other.place_terc === need.place_terc &&
        other.target_groups.some((group) => groups.includes(group)),
    )
    .map((other) => ({ summary: other.summary_pl ?? firstSentence(other.problem_text), createdAt: other.created_at }));

  const readinessCount = (await repo.listReadiness(need.place_terc === null ? {} : { places: [need.place_terc] })).filter(
    (entry) => entry.verification.status !== "odrzucone" && entry.topics.some((topic) => groups.includes(topic)),
  ).length;

  const paths: ImplementationPath[] = BRIEF_PATHS.flatMap((ids) => ids.map(getPath).find((path) => path !== undefined) ?? []);
  const sources = [
    ...matches.flatMap((match) => (match.sourceUrl ? [{ title: match.title, url: match.sourceUrl }] : [])),
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
    gapText: null,
    direction: null,
    helplines: null,
    generation: null,
  };
}
