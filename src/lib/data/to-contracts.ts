/*
 * The one place that maps the real data (types.ts, the files of data/) to
 * the app's contracts (src/lib/contracts/). Pure functions: no file I/O and
 * no Node APIs, so server code and tests can both use them; the loader
 * (load.ts) reads the files and calls mapDataset(). The field-by-field
 * table, the gaps and the defaults are in docs/data-to-contracts.md.
 *
 * Display rules of data/README.md applied here:
 * - no name, website or channel of a natural person: the organisation of a
 *   record comes from data/organisations.json (people removed from the
 *   name), and the records of natural_person_innovations get none;
 * - a material or link with link_status "dead" is dropped (the contracts
 *   cannot mark it); "unknown" and an absent status pass as they are;
 * - contact_in_source: the contact details were not copied, so the entry
 *   itself is offered as the channel;
 * - paths keep notes_pl, which opens with the prototype note of FR-1.8.
 */
import type { Gmina, Implementation, Innovation, Material } from "@/lib/contracts/catalogue";
import type { ImplementationPath } from "@/lib/contracts/path";
import type { Channel, Route, RouteSolution } from "@/lib/contracts/route";
import type {
  Advisor,
  AdvisorsFile,
  BuiltInnovation,
  BuiltMaterial,
  DataVersion,
  GminaPlace,
  HelplinesFile,
  IncubatorsFile,
  IndexCard,
  IndexVectorsFile,
  IndicatorsFile,
  KnowledgeFile,
  KnowledgeItem,
  MergedImplementation,
  Organisation,
  OrganisationsFile,
  Path,
  PathTimingKind,
  PlacesRegister,
  GminaBoundaries,
  TargetGroup,
  TaxonomiesFile,
} from "./types";

/** The prototype note of FR-1.8, verbatim from data/README.md. */
export const PROTOTYPE_NOTE =
  "Prototyp z hackathonu HackYeah 2026: treści pochodzą z publicznych katalogów innowacji społecznych na licencjach podanych przy wpisie i nie były weryfikowane prawnie. Sprawdź źródło przed użyciem.";

// ------------------------------------------------------------------ context

/** What the record mappers need from data/organisations.json. */
export interface OrganisationIndex {
  byId: Map<string, Organisation>;
  /** The organisation that authored a record (organisations[].innovation_ids). */
  byInnovation: Map<string, Organisation>;
  /** Records of natural persons (natural_person_innovations): no name, website or channel. */
  naturalPersons: Set<string>;
}

export function indexOrganisations(file: OrganisationsFile): OrganisationIndex {
  const byInnovation = new Map<string, Organisation>();
  for (const row of file.organisations) {
    for (const id of row.innovation_ids) if (!byInnovation.has(id)) byInnovation.set(id, row);
  }
  return {
    byId: new Map(file.organisations.map((row) => [row.id, row])),
    byInnovation,
    naturalPersons: new Set(file.natural_person_innovations.map((entry) => entry.innovation_id)),
  };
}

// ------------------------------------------------------------- innovations

/** The source entry the record is shown under: the one named like the record, else the first. */
export function primarySource(record: BuiltInnovation): BuiltInnovation["sources"][number] {
  return record.sources.find((entry) => entry.name === record.source) ?? record.sources[0];
}

/** Organisation name for display and attribution: the cleaned row of organisations.json; null for natural persons. */
export function organisationName(record: BuiltInnovation, orgs: OrganisationIndex): string | null {
  if (orgs.naturalPersons.has(record.id)) return null;
  return orgs.byInnovation.get(record.id)?.name ?? record.organisation?.name ?? null;
}

function organisationWebsite(record: BuiltInnovation, orgs: OrganisationIndex): string | null {
  if (orgs.naturalPersons.has(record.id)) return null;
  return orgs.byInnovation.get(record.id)?.website ?? record.organisation?.website ?? null;
}

/** A material is shown unless the link check found it dead (README: never present a dead link as working). */
export function isShownMaterial(material: BuiltMaterial): boolean {
  return material.link_status !== "dead";
}

export function toMaterial(material: BuiltMaterial): Material {
  return { type: material.type, title: material.title, url: material.url };
}

/** data/innovations/<id>.json to the catalogue contract (S2, S3, S5). */
export function toInnovation(record: BuiltInnovation, orgs: OrganisationIndex): Innovation {
  const source = primarySource(record);
  const derived = record.derived;
  return {
    id: record.id,
    title: record.title,
    organisation: organisationName(record, orgs),
    website: organisationWebsite(record, orgs),
    // The contract knows two catalogues; a partner hand-over (FR-1.6) comes from ROPS,
    // so it is shown as ROPS until the contract gets its own source (docs/data-to-contracts.md).
    source: record.source === "partner-rops" ? "rops-biblioteka" : record.source,
    sourceUrl: source.url ?? "",
    licence: source.licence,
    retrievedAt: source.retrieved_at,
    summary: derived.summary_pl,
    problem: derived.problem_pl,
    mechanism: derived.mechanism_pl,
    requires: derived.requires_pl,
    targetGroups: derived.target_groups,
    implementerTypes: derived.implementer_types,
    costBand: derived.cost_band,
    timeToImplement: derived.time_to_implement,
    evidenceLevel: derived.evidence_level,
    originPlace: derived.origin_place_pl,
    incubator: {
      name: record.origin.incubator_name,
      years: record.origin.incubator_years,
      programme: record.origin.programme,
    },
    materials: record.materials.filter(isShownMaterial).map(toMaterial),
  };
}

// ---------------------------------------------------- route: solution facts

export function toWhatItTakes(record: BuiltInnovation): RouteSolution["what_it_takes"] {
  return {
    implementer_types: record.derived.implementer_types,
    cost_band: record.derived.cost_band,
    time_to_implement: record.derived.time_to_implement,
    evidence_level: record.derived.evidence_level,
  };
}

/**
 * The channels of an innovator: the organisation's website, and the source
 * entry when it publishes contact details that were not copied
 * (contact_in_source). None for natural persons.
 */
export function toChannels(record: BuiltInnovation, orgs: OrganisationIndex): Channel[] {
  if (orgs.naturalPersons.has(record.id)) return [];
  const channels: Channel[] = [];
  const website = organisationWebsite(record, orgs);
  if (website) channels.push({ type: "www", value: website });
  const entryUrl = primarySource(record).url;
  if (record.contact_in_source && entryUrl) channels.push({ type: "www", value: entryUrl });
  return channels;
}

export function toContact(record: BuiltInnovation, orgs: OrganisationIndex): RouteSolution["contact"] {
  return { organisation: organisationName(record, orgs), channels: toChannels(record, orgs) };
}

type Innovator = Route["people"]["innovators"][number];

/** people.innovators of 8.4; null when the record names no organisation (natural persons, 5 without any). */
export function toInnovator(record: BuiltInnovation, orgs: OrganisationIndex): Innovator | null {
  const organisation = organisationName(record, orgs);
  if (!organisation) return null;
  return {
    organisation,
    channels: toChannels(record, orgs),
    persons_public: record.persons_public,
    innovation_id: record.id,
  };
}

type KnowledgeLink = Route["knowledge"][number];

/** A knowledge.yaml item as a link of the route's knowledge block. */
export function toKnowledgeLink(item: KnowledgeItem, forInnovationId: string | null = null): KnowledgeLink {
  return { title: item.title_pl, url: item.url, type: item.type, for_innovation_id: forInnovationId };
}

/** A material of a solution as a knowledge link (the mock routes list them there too). */
export function materialToKnowledgeLink(material: BuiltMaterial, innovationId: string): KnowledgeLink {
  return { title: material.title, url: material.url, type: material.type, for_innovation_id: innovationId };
}

type AdvisorContact = Route["people"]["advisor"];

export function toAdvisor(advisor: Advisor): AdvisorContact {
  return { category: advisor.category, name: advisor.name, role: advisor.role, email: advisor.email, phone: advisor.phone };
}

// ------------------------------------------------------ places, implementations

/** A gmina of the register (8.9); the register gives every gmina a centroid, [0, 0] is the documented fallback. */
export function toGmina(place: GminaPlace): Gmina {
  return { terc: place.terc, name: place.name, powiat: place.powiat, kind: place.kind, centroid: place.centroid ?? [0, 0] };
}

export function gminasOf(register: PlacesRegister): GminaPlace[] {
  return register.places.filter((place): place is GminaPlace => place.level === "gmina");
}

/**
 * A row of implementations-merged.json to the catalogue contract; null for
 * the voivodeship-wide regional-model rows (place_terc null), which the
 * contract cannot place.
 */
export function toImplementation(row: MergedImplementation, orgs: OrganisationIndex): Implementation | null {
  if (row.place_terc === null) return null;
  const seeded = row.origin_file === "data/implementations.yaml" ? row.organisation?.name_pl : undefined;
  return {
    id: row.id,
    innovation_id: row.innovation_id,
    place_terc: row.place_terc,
    place_name: row.place_name ?? null,
    organisation: (row.organisation_id ? orgs.byId.get(row.organisation_id)?.name : undefined) ?? seeded ?? null,
    year: row.year ?? null,
    status: row.status,
    source: row.source,
    source_url: row.source_url,
    note_pl: row.note_pl,
  };
}

/** The shape of LocatedImplementation in src/lib/mock/implementations.ts: an implementation with its gmina's centroid. */
export type LocatedImplementation = Implementation & { centroid: [number, number] };

export function locate(item: Implementation, gminaByTerc: Map<string, Gmina>): LocatedImplementation | null {
  const gmina = gminaByTerc.get(item.place_terc);
  return gmina ? { ...item, centroid: gmina.centroid } : null;
}

// ------------------------------------------------------------------- paths

/**
 * data/paths timing kinds to the contract's four. `today` (YYYY-MM-DD)
 * refines "fixed": when every call closed before it, the path shows as
 * "none-open". Without `today`, the kind alone decides.
 */
export function toTimingKind(timing: Path["timing"], today?: string): ImplementationPath["timing"]["kind"] {
  const byKind: Record<PathTimingKind, ImplementationPath["timing"]["kind"]> = {
    rolling: "rolling",
    annual: "fixed",
    fixed: "fixed",
    "per-call": "resolution",
    closed: "none-open",
  };
  const kind = byKind[timing.kind];
  if (kind === "fixed" && timing.kind === "fixed" && today && timing.calls.length > 0) {
    if (timing.calls.every((call) => call.closes_on < today)) return "none-open";
  }
  return kind;
}

/** data/paths/<id>.yaml to the path contract (8.7). */
export function toImplementationPath(path: Path, today?: string): ImplementationPath {
  return {
    id: path.id,
    name_pl: path.name_pl,
    legal_basis_pl: path.legal_basis_pl,
    applicant_types: path.applicant_types,
    amount_note_pl: path.amount_note_pl,
    timing: { kind: toTimingKind(path.timing, today), note_pl: path.timing.note_pl },
    decision_maker_pl: path.decision_maker_pl,
    steps_pl: path.steps_pl,
    source_url: path.source_url,
    verified_on: path.verified_on,
    reviewer: path.reviewer,
    notes_pl: path.notes_pl.startsWith(PROTOTYPE_NOTE) ? path.notes_pl : `${PROTOTYPE_NOTE} ${path.notes_pl}`,
  };
}

// ----------------------------------------------------------------- dataset

/** Every file of data/ as parsed, before mapping; load.ts fills it. */
export interface RawData {
  dataVersion: DataVersion;
  records: BuiltInnovation[];
  indexCards: IndexCard[];
  vectors: IndexVectorsFile;
  taxonomies: TaxonomiesFile;
  incubators: IncubatorsFile;
  organisations: OrganisationsFile;
  implementations: MergedImplementation[];
  places: PlacesRegister;
  boundaries: GminaBoundaries;
  indicators: IndicatorsFile;
  advisors: AdvisorsFile;
  knowledge: KnowledgeFile;
  helplines: HelplinesFile;
  paths: Path[];
}

/** The whole dataset in the app's contracts, plus what has no contract yet (see the gaps in docs/data-to-contracts.md). */
export interface Dataset {
  /** data-version.json `version`: Route.engine.data_version, /api/health, "Jak to działa". */
  version: string;
  innovations: Innovation[];
  innovationById: Map<string, Innovation>;
  /** Every gmina of Poland (2 479), for the place picker and distances. */
  gminy: Gmina[];
  /** The 183 gminas of Małopolska (TERC 12...), the set of the map (S4) and of the mock gminy.json. */
  gminyMalopolska: Gmina[];
  gminaByTerc: Map<string, Gmina>;
  /** Rows with a gmina; the regional-model rows without a place are left out. */
  implementations: Implementation[];
  locatedImplementations: LocatedImplementation[];
  paths: ImplementationPath[];
  pathById: Map<string, ImplementationPath>;
  /** people.advisor per target-group code. */
  advisorByCategory: Map<TargetGroup, AdvisorContact>;
  /** people.innovators per record id; records without an organisation are absent. */
  innovatorByInnovation: Map<string, Innovator>;
  knowledge: {
    /** Items with always_show: on every route. */
    always: KnowledgeLink[];
    byId: Map<string, KnowledgeLink>;
    /** model_by_target_group resolved to links. */
    byTargetGroup: Map<TargetGroup, KnowledgeLink[]>;
  };
  /** No contract: index cards, vectors, indicators, boundaries, helplines, taxonomies and the built records stay in their data types. */
  raw: RawData;
}

export function mapDataset(raw: RawData, options: { today?: string } = {}): Dataset {
  const orgs = indexOrganisations(raw.organisations);
  const innovations = raw.records.map((record) => toInnovation(record, orgs));
  const gminy = gminasOf(raw.places).map(toGmina);
  const gminaByTerc = new Map(gminy.map((gmina) => [gmina.terc, gmina]));
  const implementations = raw.implementations
    .map((row) => toImplementation(row, orgs))
    .filter((item): item is Implementation => item !== null);
  const paths = raw.paths.map((path) => toImplementationPath(path, options.today));
  const knowledgeById = new Map(raw.knowledge.items.map((item) => [item.id, toKnowledgeLink(item)]));
  const innovatorByInnovation = new Map<string, Innovator>();
  for (const record of raw.records) {
    const innovator = toInnovator(record, orgs);
    if (innovator) innovatorByInnovation.set(record.id, innovator);
  }
  return {
    version: raw.dataVersion.version,
    innovations,
    innovationById: new Map(innovations.map((item) => [item.id, item])),
    gminy,
    gminyMalopolska: gminy.filter((gmina) => gmina.terc.startsWith("12")),
    gminaByTerc,
    implementations,
    locatedImplementations: implementations
      .map((item) => locate(item, gminaByTerc))
      .filter((item): item is LocatedImplementation => item !== null),
    paths,
    pathById: new Map(paths.map((path) => [path.id, path])),
    advisorByCategory: new Map(raw.advisors.advisors.map((advisor) => [advisor.category, toAdvisor(advisor)])),
    innovatorByInnovation,
    knowledge: {
      always: raw.knowledge.items.filter((item) => item.always_show).map((item) => toKnowledgeLink(item)),
      byId: knowledgeById,
      byTargetGroup: new Map(
        (Object.entries(raw.knowledge.model_by_target_group) as [TargetGroup, string[]][]).map(([group, ids]) => [
          group,
          ids.flatMap((id) => knowledgeById.get(id) ?? []),
        ]),
      ),
    },
    raw,
  };
}
