import type { CostBand, EvidenceLevel, RoleCode } from "@/lib/contracts";
import type { ImplementerType, Path, PathApplicantType } from "@/lib/data/types";

/*
 * The path selection of FR-8.2 and 8.7, deterministic and pure: the
 * applicant type from the role (rule 1), the filters by applicant type, cost
 * band and target group (rule 2), the score (rule 3) and at most three paths
 * with the non-monetary vehicle for a gmina (rule 4). It reads the raw path
 * files, because the path contract lacks the fields the rules need
 * (docs/data-to-contracts.md, gaps). The model never sees amounts or
 * deadlines (FR-8.5): it gets the chosen ids and may only phrase why_pl.
 *
 * What the rules leave open, decided here:
 * - no role: "ngo" first, "jst" second, the applicant types most paths accept;
 * - the cost band of an unknown-cost or missing best solution filters nothing;
 *   a path without amount_max_pln (EUR amounts, a minimum only) is filtered by
 *   its fit.cost_bands, which check-paths.py derives or the author set by hand;
 * - the target groups are the reader's, else the detected ones, else the best
 *   solution's; with none known only paths for any group pass;
 * - scope: a Kraków path only for a route in Kraków, a Małopolska path not for
 *   a gmina outside Małopolska;
 * - ties: first-choice applicant type, then score, then a path with an open or
 *   upcoming call, then the nearest deadline, then a path whose
 *   boost_when_implementer_types meets the best solution, then the id;
 * - "service model" in rule 4: the best solution is run by an OPS, CUS or
 *   PCPR, or is part of a regional service model;
 * - partial and none (S3): the paths for creating something new, so the cost
 *   filter takes the low band of a pilot, not the band of a solution that
 *   does not fit, and the incubator call (purpose testowanie-innowacji) is
 *   always included, like the vehicle of rule 4.
 */

export const MAX_PATHS = 3;
/** Rule 3: a fixed deadline within 90 days scores +2. */
export const DEADLINE_WINDOW_DAYS = 90;
/** The TERC of Kraków, the only gmina of the scope "krakow". */
export const KRAKOW_TERC = "1261011";

/** Rule 1 of 8.7: the first choice, then the second choice. */
export function applicantTypesForRole(role: RoleCode | null): PathApplicantType[] {
  switch (role) {
    case "pracownik-instytucji":
    case "urzad-gminy":
      return ["jst"];
    case "organizacja-spoleczna":
      return ["ngo"];
    case "mieszkaniec":
      return ["mieszkancy", "ngo"];
    default:
      return ["ngo", "jst"];
  }
}

/** Lower bounds of the cost bands of data/taxonomies.json (low up to 10 000 zł, medium to 100 000 zł, high above). */
const BAND_LOWER_PLN: Record<Exclude<CostBand, "unknown">, number> = { low: 0, medium: 10_000, high: 100_000 };

export interface PathContext {
  role: RoleCode | null;
  /** YYYY-MM-DD. */
  today: string;
  placeTerc: string | null;
  /** The route's target groups, see the header. */
  targetGroups: string[];
  mode: "route" | "partial" | "none";
  /** The best solution, or null when there is none. */
  best: { costBand: CostBand; implementerTypes: ImplementerType[]; evidenceLevel: EvidenceLevel } | null;
}

/** Why a path was chosen: the facts behind the templated why_pl and the unknowns. */
export interface PathReasons {
  /** The target group the path names and the route has, or null. */
  targetGroup: string | null;
  deadlineSoon: boolean;
  rolling: boolean;
  regional: boolean;
  /** Included by rule 4 (the gmina's non-monetary vehicle). */
  vehicle: boolean;
  /** Included as the incubator call of S3. */
  createNew: boolean;
  /** Rolling, per call, or with a call that closes today or later. */
  open: boolean;
}

export interface SelectedPath {
  path: Path;
  score: number;
  reasons: PathReasons;
}

export interface PathSelection {
  /** The first-choice applicant type, shown as Route.path.applicant_type. */
  applicantType: PathApplicantType;
  /** The band the filter used: the best solution's ("unknown" without one), "low" for a pilot on S3. */
  costBand: CostBand;
  paths: SelectedPath[];
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addYear(day: string): string {
  return `${Number(day.slice(0, 4)) + 1}${day.slice(4)}`;
}

/** The earliest closing date on or after today of the calls open to `applicant`; an annual call that passed rolls forward a year (8.7). */
export function nextDeadline(path: Path, applicant: PathApplicantType, today: string): string | null {
  let nearest: string | null = null;
  for (const call of path.timing.calls) {
    if (!call.applicant_types.includes(applicant)) continue;
    let closes = call.closes_on;
    if (closes < today && path.timing.kind === "annual") closes = addYear(closes);
    if (closes < today) continue;
    if (nearest === null || closes < nearest) nearest = closes;
  }
  return nearest;
}

/** Rule 2, cost: a path whose maximum is below the band's lower bound is dropped. */
export function fitsCostBand(path: Path, band: CostBand): boolean {
  if (band === "unknown") return true;
  if (path.amount_max_pln === null) return path.fit.cost_bands.includes(band);
  return path.amount_max_pln >= BAND_LOWER_PLN[band];
}

/** Rule 2, target group: "any" always matches; returns the matching group, "any", or null. */
export function matchTargetGroup(path: Path, groups: string[]): string | null {
  const named = path.target_groups as string[];
  if (named.includes("any")) return "any";
  return groups.find((group) => named.includes(group)) ?? null;
}

function fitsScope(path: Path, placeTerc: string | null): boolean {
  if (path.scope === "krakow") return placeTerc === KRAKOW_TERC;
  if (path.scope === "malopolska") return placeTerc === null || placeTerc.startsWith("12");
  return true;
}

function isServiceModel(best: PathContext["best"]): boolean {
  return best !== null && (best.implementerTypes.includes("ops-cus-pcpr") || best.evidenceLevel === "in-regional-model");
}

/** Rule 4: the CUS social services programme or the local initiative, both decided by the gmina without a grant. */
function isVehicle(path: Path): boolean {
  return (
    path.decides === "jst" &&
    path.amount_max_pln === null &&
    (path.purposes.includes("program-uslug-spolecznych") || path.purposes.includes("inicjatywa-mieszkancow"))
  );
}

interface Candidate extends SelectedPath {
  tier: number;
  deadline: string | null;
  boosted: boolean;
}

function evaluate(path: Path, applicant: PathApplicantType, tier: number, ctx: PathContext): Candidate {
  const group = matchTargetGroup(path, ctx.targetGroups);
  const deadline = nextDeadline(path, applicant, ctx.today);
  const reasons: PathReasons = {
    targetGroup: group && group !== "any" ? group : null,
    deadlineSoon: deadline !== null && deadline <= addDays(ctx.today, DEADLINE_WINDOW_DAYS),
    rolling: path.timing.kind === "rolling",
    regional: path.scope === "malopolska" || path.scope === "krakow",
    vehicle: false,
    createNew: false,
    open: path.timing.kind === "rolling" || path.timing.kind === "per-call" || deadline !== null,
  };
  const score =
    (reasons.targetGroup ? 3 : 0) + (reasons.deadlineSoon ? 2 : 0) + (reasons.rolling ? 1 : 0) + (reasons.regional ? 1 : 0);
  const boosted = ctx.best !== null && ctx.best.implementerTypes.some((type) => path.fit.boost_when_implementer_types.includes(type));
  return { path, score, reasons, tier, deadline, boosted };
}

function compare(a: Candidate, b: Candidate): number {
  return (
    a.tier - b.tier ||
    b.score - a.score ||
    Number(b.reasons.open) - Number(a.reasons.open) ||
    (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
    Number(b.boosted) - Number(a.boosted) ||
    a.path.id.localeCompare(b.path.id)
  );
}

/** Puts `pick` into the list when it is missing, in place of the last path, and marks why. */
function ensure(list: Candidate[], pick: Candidate | undefined, mark: "vehicle" | "createNew"): Candidate[] {
  if (!pick) return list;
  const present = list.find((item) => item.path.id === pick.path.id);
  if (present) {
    present.reasons[mark] = true;
    return list;
  }
  pick.reasons[mark] = true;
  return [...list.slice(0, MAX_PATHS - 1), pick];
}

/** FR-8.2: at most three paths for the route, best first. */
export function selectPaths(paths: Path[], ctx: PathContext): PathSelection {
  const applicants = applicantTypesForRole(ctx.role);
  const createNew = ctx.mode !== "route";
  // Something new starts as a pilot, so S3 filters by the low band (this drops the EUR-only and minimum-only paths).
  const costBand: CostBand = createNew ? "low" : (ctx.best?.costBand ?? "unknown");

  const eligible = (path: Path) =>
    fitsScope(path, ctx.placeTerc) && matchTargetGroup(path, ctx.targetGroups) !== null && fitsCostBand(path, costBand);

  const candidates: Candidate[] = [];
  for (const path of paths) {
    const tier = applicants.findIndex((applicant) => path.applicant_types.includes(applicant));
    if (tier < 0 || !eligible(path)) continue;
    candidates.push(evaluate(path, applicants[tier], tier, ctx));
  }
  candidates.sort(compare);
  let chosen = candidates.slice(0, MAX_PATHS);

  if (createNew) {
    chosen = ensure(
      chosen,
      candidates.find((item) => item.path.purposes.includes("testowanie-innowacji")),
      "createNew",
    );
  } else if (applicants[0] === "jst" && isServiceModel(ctx.best)) {
    // The vehicle may lie outside the applicant filter (the local initiative is filed by residents, decided by the gmina).
    const vehicles = paths
      .filter((path) => isVehicle(path) && fitsScope(path, ctx.placeTerc) && matchTargetGroup(path, ctx.targetGroups) !== null)
      .map((path) => evaluate(path, "jst", 0, ctx))
      .sort((a, b) => Number(b.path.purposes.includes("program-uslug-spolecznych")) - Number(a.path.purposes.includes("program-uslug-spolecznych")) || compare(a, b));
    chosen = ensure(chosen, vehicles[0], "vehicle");
  }

  return {
    applicantType: applicants[0],
    costBand,
    paths: chosen.map(({ path, score, reasons }) => ({ path, score, reasons })),
  };
}
