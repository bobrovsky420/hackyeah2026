import { z } from "zod";
import { catalogue as defaultCatalogue, getGmina, implementationsOf, type Catalogue } from "@/lib/catalogue";
import type { CostBand, EvidenceLevel, Innovation } from "@/lib/contracts";
import type { ImplementerType, Path } from "@/lib/data/types";
import { warsawDay } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { costLabel, evidenceLabel, implementerLabels, targetGroupLabel, timeLabel } from "@/lib/labels";
import { getLlm } from "@/lib/llm";
import { loadPrompt } from "@/lib/llm/prompts";
import { LlmError, type Llm } from "@/lib/llm/types";
import { CONSTRAINTS, INSTITUTIONS, SCALES, type AdaptInput, type Constraint, type ServicePlan } from "@/lib/middleman";
import { clean, knownText, proseProblem, redactPatterns, SINGULAR_ADDRESS, type KnownText } from "@/server/needs/checks";
import { routeEngine } from "@/server/route-service";
import { applicantTypesForRole, selectPaths } from "@/server/route/paths";
import { bannedWords, type BannedWords } from "@/server/route/safety";

/*
 * The Middleman of module VII ("Dostosuj do mojej instytucji"): a service
 * plan for one innovation in one institution, with the prompt adapt.md.
 * The model writes only how the service would run there, the roles, one
 * adaptation per constraint and three first steps, each checked like the
 * brief (no new names or numbers, no banned words); a part that fails
 * takes its template. Everything that states a fact stays with the data:
 * what the innovation needs, its cost, time and evidence, the funding
 * paths (the route's own selector of 8.7 for the institution's role and
 * gmina, or the catalogue's paths without a dataset) and who already runs
 * it, nearest first. The plan is not stored; it downloads and prints.
 */

const MAX_PATHS = 3;
const MAX_IMPLEMENTERS = 3;
const LIMITS = { service: { min: 60, max: 900 }, role: { min: 5, max: 140 }, adaptation: { min: 20, max: 320 }, step: { min: 15, max: 220 } };

export const adaptSchema = z.object({
  service_pl: z.string(),
  roles: z.array(z.string()).max(8),
  // A missing constraint is a general adaptation, not a broken answer.
  adaptations: z.array(z.object({ constraint: z.string().nullish(), text_pl: z.string() })).max(8),
  first_steps: z.array(z.string()).max(6),
});
export type AdaptOutput = z.infer<typeof adaptSchema>;

export interface MiddlemanDeps {
  llm: Llm;
  catalogue: Pick<Catalogue, "innovationById" | "paths" | "dataset">;
  banned: BannedWords;
  engine: "live" | "canned";
  today: () => string;
}

function resolve(given: Partial<MiddlemanDeps> = {}): MiddlemanDeps {
  return {
    llm: given.llm ?? getLlm(),
    catalogue: given.catalogue ?? defaultCatalogue(),
    banned: given.banned ?? bannedWords(),
    engine: given.engine ?? routeEngine(),
    today: given.today ?? (() => warsawDay(new Date().toISOString())),
  };
}

/**
 * The plan puts a service into an institution that exists: a programme for
 * new care places (a nursery, a day home or club) funds the facility, and
 * its group alone would put it under every family or senior service. The
 * route of a need still offers it.
 */
export function fundsTheService(path: Pick<Path, "purposes">): boolean {
  return !path.purposes.includes("tworzenie-miejsc");
}

/** The funding paths for the institution's role and gmina: the route's selector with a dataset, else the catalogue's paths of its applicant type. */
export function planPaths(item: Innovation, input: AdaptInput, deps: Pick<MiddlemanDeps, "catalogue" | "today">): ServicePlan["paths"] {
  const role = INSTITUTIONS[input.institution].role;
  const dataset = deps.catalogue.dataset;
  const chosen = dataset
    ? selectPaths(dataset.raw.paths.filter(fundsTheService), {
        role,
        today: deps.today(),
        placeTerc: input.place_terc,
        targetGroups: input.target_group ? [input.target_group] : item.targetGroups,
        mode: "route",
        best: { costBand: (item.costBand ?? "unknown") as CostBand, implementerTypes: item.implementerTypes as ImplementerType[], evidenceLevel: (item.evidenceLevel ?? "unknown") as EvidenceLevel },
      }).paths.flatMap(({ path }) => deps.catalogue.paths.find((shown) => shown.id === path.id) ?? [])
    : deps.catalogue.paths.filter((path) => path.applicant_types.includes(applicantTypesForRole(role)[0]));
  return chosen.slice(0, MAX_PATHS).map((path) => ({
    name: path.name_pl,
    decision_maker: path.decision_maker_pl,
    amount: path.amount_note_pl,
    timing: path.timing.note_pl,
    source_url: path.source_url,
  }));
}

/** Who already runs it, nearest to the institution's gmina first. */
export function planImplementers(item: Innovation, placeTerc: string | null): ServicePlan["implementers"] {
  const centroid = getGmina(placeTerc)?.centroid;
  const distance = (point: [number, number]) => (centroid ? Math.hypot(point[0] - centroid[0], point[1] - centroid[1]) : 0);
  return implementationsOf(item.id)
    .slice()
    .sort((a, b) => distance(a.centroid) - distance(b.centroid))
    .slice(0, MAX_IMPLEMENTERS)
    .map((row) => ({ organisation: row.organisation, place: row.place_name, year: row.year }));
}

const CONSTRAINT_TEMPLATE: Record<Constraint, Parameters<typeof t>[0]> = {
  budzet: "adapt.template.constraint.budzet",
  etat: "adapt.template.constraint.etat",
  lokal: "adapt.template.constraint.lokal",
  dojazd: "adapt.template.constraint.dojazd",
  szybko: "adapt.template.constraint.szybko",
  cyfrowe: "adapt.template.constraint.cyfrowe",
};

/** The plan's written parts without a model: the record's summary, fixed roles, one fixed adaptation per constraint, three fixed steps. */
export function templateParts(item: Innovation, input: AdaptInput): Pick<ServicePlan, "service" | "roles" | "adaptations" | "first_steps"> {
  return {
    service: t("adapt.template.service", { title: item.title, summary: clean(item.summary) }),
    roles: [t("adapt.template.role.coordinator"), t("adapt.template.role.partners")],
    adaptations: input.constraints.map((code) => ({ constraint: t(CONSTRAINTS[code]), text: t(CONSTRAINT_TEMPLATE[code]) })),
    first_steps: [t("adapt.template.step.read", { title: item.title }), t("adapt.template.step.ask"), t("adapt.template.step.path")],
  };
}

export interface AdaptFacts {
  innowacja: { tytul: string; streszczenie: string; mechanizm: string; wymaga: string[]; kto_wdraza: string; koszt: string; czas: string; dowody: string; grupy: string[] };
  instytucja: { rodzaj: string; gmina: string | null; ograniczenia: { kod: Constraint; opis: string }[]; skala: string; dla_kogo: string | null };
}

/** The facts of the call; the institution's note goes inside its tags, never the facts. */
export function adaptFacts(item: Innovation, input: AdaptInput): AdaptFacts {
  return {
    innowacja: {
      tytul: item.title,
      streszczenie: item.summary,
      mechanizm: item.mechanism,
      wymaga: item.requires,
      kto_wdraza: implementerLabels(item.implementerTypes),
      koszt: costLabel(item.costBand),
      czas: timeLabel(item.timeToImplement),
      dowody: evidenceLabel(item.evidenceLevel),
      grupy: item.targetGroups.map(targetGroupLabel),
    },
    instytucja: {
      rodzaj: t(INSTITUTIONS[input.institution].label),
      gmina: getGmina(input.place_terc)?.name ?? null,
      ograniczenia: input.constraints.map((code) => ({ kod: code, opis: t(CONSTRAINTS[code]) })),
      skala: t(SCALES[input.scale]),
      dla_kogo: input.target_group ? targetGroupLabel(input.target_group) : null,
    },
  };
}

export function adaptUserPart(facts: AdaptFacts, note: string | null): string {
  const json = JSON.stringify(facts, null, 1);
  if (!note) return json;
  return `${json}\n<instytucja>\n${redactPatterns(note).replace(/[<>]/g, " ").trim()}\n</instytucja>`;
}

/** The model's parts that pass; each part that does not takes the template's. The notes say what fell. */
export function finishParts(
  output: AdaptOutput,
  template: ReturnType<typeof templateParts>,
  input: AdaptInput,
  known: KnownText,
  banned?: BannedWords,
): { parts: ReturnType<typeof templateParts>; fromModel: number; notes: string[] } {
  const notes: string[] = [];
  const passes = (text: string, limits: { min: number; max: number }, part: string) => {
    const problem = proseProblem(text, limits, known, banned);
    if (problem) notes.push(`${part}: ${problem}`);
    return !problem;
  };
  let fromModel = 0;

  const service = clean(output.service_pl);
  const serviceOk = passes(service, LIMITS.service, "service");

  const roles = output.roles.map(clean).filter((role) => passes(role, LIMITS.role, "role")).slice(0, 4);
  const rolesOk = roles.length >= 2;

  // One adaptation per constraint given, in the form's order: the model's when it passes, else the template's.
  const byConstraint = new Map<Constraint, string>();
  const general: string[] = [];
  for (const item of output.adaptations) {
    const code = input.constraints.find((given) => given === item.constraint) ?? null;
    if (item.constraint && !code) {
      notes.push(`adaptation: unknown constraint ${item.constraint}`);
      continue;
    }
    const text = clean(item.text_pl);
    if ((code && byConstraint.has(code)) || !passes(text, LIMITS.adaptation, "adaptation")) continue;
    if (code) byConstraint.set(code, text);
    else general.push(text);
  }
  const adaptations: ServicePlan["adaptations"] = input.constraints.map((code, index) => ({
    constraint: t(CONSTRAINTS[code]),
    text: byConstraint.get(code) ?? template.adaptations[index].text,
  }));
  for (const text of general) if (adaptations.length < 4) adaptations.push({ constraint: null, text });
  const adaptationsOk = byConstraint.size > 0 || general.length > 0;

  const steps = output.first_steps.map(clean).filter((step) => passes(step, LIMITS.step, "step")).slice(0, 3);
  const stepsOk = steps.length === 3;

  for (const ok of [serviceOk, rolesOk, adaptationsOk, stepsOk]) if (ok) fromModel += 1;
  return {
    parts: {
      service: serviceOk ? service : template.service,
      roles: rolesOk ? roles : template.roles,
      adaptations: adaptationsOk ? adaptations : template.adaptations,
      first_steps: stepsOk ? steps : template.first_steps,
    },
    fromModel,
    notes,
  };
}

/** The service plan of one innovation for one institution; null for an unknown innovation. */
export async function servicePlan(innovationId: string, input: AdaptInput, given?: Partial<MiddlemanDeps>): Promise<ServicePlan | null> {
  const deps = resolve(given);
  const item = deps.catalogue.innovationById.get(innovationId);
  if (!item) return null;
  const template = templateParts(item, input);
  const base: Omit<ServicePlan, "service" | "roles" | "adaptations" | "first_steps" | "source" | "prompt_version"> = {
    innovation_id: item.id,
    title: item.title,
    institution_label: t(INSTITUTIONS[input.institution].label),
    place_name: getGmina(input.place_terc)?.name ?? null,
    scale_label: t(SCALES[input.scale]),
    group_label: input.target_group ? targetGroupLabel(input.target_group) : null,
    needs: { requires: item.requires, cost: costLabel(item.costBand), time: timeLabel(item.timeToImplement), evidence: evidenceLabel(item.evidenceLevel) },
    paths: planPaths(item, input, deps),
    implementers: planImplementers(item, input.place_terc),
  };
  const fromTemplate: ServicePlan = { ...base, ...template, source: "template", prompt_version: null };
  if (deps.engine === "canned") return fromTemplate;

  const prompt = loadPrompt("adapt");
  const facts = adaptFacts(item, input);
  try {
    const result = await deps.llm({
      task: "adapt",
      system: prompt.body,
      promptVersion: prompt.version,
      user: adaptUserPart(facts, input.note),
      schema: adaptSchema,
      effort: "medium",
      maxTokens: 2_500,
      temperature: 0.4,
    });
    const known = knownText(JSON.stringify(facts), input.note, SINGULAR_ADDRESS);
    const { parts, fromModel, notes } = finishParts(result.parsed, template, input, known, deps.banned);
    if (notes.length > 0) console.info(JSON.stringify({ event: "middleman_dropped", notes }));
    return fromModel > 0 ? { ...base, ...parts, source: "model", prompt_version: prompt.version } : fromTemplate;
  } catch (error) {
    if (!(error instanceof LlmError)) throw error;
    console.warn(JSON.stringify({ event: "middleman_model_failed", kind: error.kind }));
    return fromTemplate;
  }
}

/** The plan as a Markdown file for "Pobierz", in the order of the page. */
export function planMarkdown(plan: ServicePlan): string {
  const lines = [
    `# ${t("adapt.plan.title", { title: plan.title })}`,
    "",
    [plan.institution_label, plan.place_name, plan.scale_label, plan.group_label].filter(Boolean).join(" · "),
    "",
    `## ${t("adapt.plan.service")}`,
    "",
    plan.service,
    "",
    `## ${t("adapt.plan.roles")}`,
    "",
    ...plan.roles.map((role) => `- ${role}`),
  ];
  if (plan.adaptations.length > 0) {
    lines.push("", `## ${t("adapt.plan.adaptations")}`, "", ...plan.adaptations.map((item) => `- ${item.constraint ? `**${item.constraint}:** ` : ""}${item.text}`));
  }
  lines.push("", `## ${t("adapt.plan.steps")}`, "", ...plan.first_steps.map((step, index) => `${index + 1}. ${step}`));
  lines.push(
    "",
    `## ${t("adapt.plan.needs")}`,
    "",
    ...(plan.needs.requires.length > 0 ? [`- ${t("adapt.plan.requires")} ${plan.needs.requires.join(", ")}`] : []),
    `- ${t("adapt.plan.cost")} ${plan.needs.cost}`,
    `- ${t("adapt.plan.time")} ${plan.needs.time}`,
    `- ${t("adapt.plan.evidence")} ${plan.needs.evidence}`,
  );
  if (plan.paths.length > 0) {
    lines.push("", `## ${t("adapt.plan.paths")}`, "");
    for (const path of plan.paths) lines.push(`- **${path.name}**: ${path.decision_maker}. ${path.amount} ${path.timing} ${path.source_url}`);
  }
  if (plan.implementers.length > 0) {
    lines.push("", `## ${t("adapt.plan.implementers")}`, "");
    for (const row of plan.implementers) lines.push(`- ${[row.organisation, row.place, row.year].filter(Boolean).join(", ")}`);
  }
  lines.push("", t(plan.source === "model" ? "adapt.plan.model" : "adapt.plan.template"));
  return `${lines.join("\n")}\n`;
}
