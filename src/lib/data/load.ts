import fs from "node:fs";
import path from "node:path";
import { mapDataset, type Dataset, type RawData } from "./to-contracts";
import type {
  AdvisorsFile,
  BuiltInnovation,
  DataVersion,
  GminaBoundaries,
  HelplinesFile,
  ImplementationsDerivedFile,
  ImplementationsMergedFile,
  IncubatorsFile,
  IndexCard,
  IndexVectorsFile,
  IndicatorsFile,
  KnowledgeFile,
  LocalitiesFile,
  OrganisationsFile,
  Path,
  PlacesRegister,
  TaxonomiesFile,
} from "./types";
import { parseYaml } from "./yaml";

/*
 * The server-side loader of data/ (data/README.md): reads every file the
 * app serves, runs the load-time checks of "Version stamps and load-time
 * checks" and maps the result through to-contracts.ts. A missing file or a
 * failed check throws one DataLoadError that lists every problem with the
 * file and the command that rebuilds it; the app then refuses to start (or
 * to serve matching). Commands run from the repository root.
 */

const PY = ".venv/Scripts/python";
const DERIVE = `${PY} scripts/derive-records.py build`;
const STATIC = (step: string) => `${PY} scripts/build-static-data.py --only ${step}`;
const VECTORS = `${PY} scripts/build-index-vectors.py`;
const HAND = (file: string) => `hand-written and committed: git checkout -- data/${file}`;

/** The command that builds each file; a bundle restores all of them: `${PY} scripts/unpack-data.py <zip>`. */
const BUILT_BY: Record<string, string> = {
  "data-version.json": DERIVE,
  "innovations/": DERIVE,
  "index-cards.json": DERIVE,
  "index-vectors.json": VECTORS,
  "incubators.json": `${PY} scripts/parse-catalogues.py`,
  "places/pl-register.json": STATIC("places"),
  "places/malopolska-localities.json": STATIC("places"),
  "map/malopolska-gminy.geojson": STATIC("map"),
  "indicators.json": STATIC("indicators"),
  "implementations-derived.json": STATIC("origins"),
  "organisations.json": STATIC("organisations"),
  "implementations-merged.json": STATIC("organisations"),
  "taxonomies.json": HAND("taxonomies.json"),
  "advisors.yaml": HAND("advisors.yaml"),
  "knowledge.yaml": HAND("knowledge.yaml"),
  "helplines.yaml": HAND("helplines.yaml"),
  "paths/": HAND("paths/"),
};

/** The embedding model the vectors must come from (FR-3.7); the service reads the same variable. */
export const DEFAULT_EMBEDDING_MODEL = "OPI-PIB/PolDense-400M";

export class DataLoadError extends Error {
  constructor(readonly problems: string[]) {
    super(
      `data/ cannot be served (${problems.length} problem${problems.length === 1 ? "" : "s"}):\n` +
        problems.map((problem) => `- ${problem}`).join("\n") +
        `\nSee data/README.md "Rebuild order", or restore a bundle: ${PY} scripts/unpack-data.py <zip>.`,
    );
    this.name = "DataLoadError";
  }
}

export interface LoadOptions {
  /** Default: <cwd>/data. */
  dataDir?: string;
  /** Default: process.env.EMBEDDING_MODEL, else OPI-PIB/PolDense-400M. */
  embeddingModel?: string;
  /** YYYY-MM-DD for the timing of fixed paths; default: today. */
  today?: string;
}

/** Reads, checks and parses data/ without mapping; throws DataLoadError. */
export function loadRawData(options: LoadOptions = {}): RawData {
  const dir = options.dataDir ?? path.join(process.cwd(), "data");
  const problems: string[] = [];
  const rebuild = (key: string) => `rebuild: ${BUILT_BY[key] ?? DERIVE}`;

  function missing(rel: string, key = rel): undefined {
    problems.push(`data/${rel} is missing; ${rebuild(key)}`);
    return undefined;
  }
  function read(rel: string, key = rel): string | undefined {
    const file = path.join(dir, rel);
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : missing(rel, key);
  }
  function json<T>(rel: string, key = rel): T | undefined {
    const text = read(rel, key);
    if (text === undefined) return undefined;
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      problems.push(`data/${rel} is not valid JSON (${(error as Error).message}); ${rebuild(key)}`);
      return undefined;
    }
  }
  function yaml<T>(rel: string, key = rel): T | undefined {
    const text = read(rel, key);
    if (text === undefined) return undefined;
    try {
      return parseYaml(text, `data/${rel}`) as T;
    } catch (error) {
      problems.push(`${(error as Error).message}; ${rebuild(key)}`);
      return undefined;
    }
  }
  function folder<T extends { id: string }>(rel: string, ext: string, parse: (file: string) => T | undefined): T[] | undefined {
    const full = path.join(dir, rel);
    const files = fs.existsSync(full) ? fs.readdirSync(full).filter((name) => name.endsWith(ext)).sort() : [];
    if (files.length === 0) return missing(`${rel}/*${ext}`, `${rel}/`);
    const items: T[] = [];
    for (const name of files) {
      const item = parse(`${rel}/${name}`);
      if (!item) continue;
      if (item.id !== name.slice(0, -ext.length)) problems.push(`data/${rel}/${name} has id ${item.id}, not its file name; ${rebuild(`${rel}/`)}`);
      items.push(item);
    }
    return items;
  }

  const dataVersion = json<DataVersion>("data-version.json");
  const records = folder<BuiltInnovation>("innovations", ".json", (rel) => json(rel, "innovations/"));
  const indexCards = json<IndexCard[]>("index-cards.json");
  const vectors = json<IndexVectorsFile>("index-vectors.json");
  const taxonomies = json<TaxonomiesFile>("taxonomies.json");
  const incubators = json<IncubatorsFile>("incubators.json");
  const places = json<PlacesRegister>("places/pl-register.json");
  const localities = json<LocalitiesFile>("places/malopolska-localities.json");
  const boundaries = json<GminaBoundaries>("map/malopolska-gminy.geojson");
  const indicators = json<IndicatorsFile>("indicators.json");
  const derived = json<ImplementationsDerivedFile>("implementations-derived.json");
  const organisations = json<OrganisationsFile>("organisations.json");
  const merged = json<ImplementationsMergedFile>("implementations-merged.json");
  const advisors = yaml<AdvisorsFile>("advisors.yaml");
  const knowledge = yaml<KnowledgeFile>("knowledge.yaml");
  const helplines = yaml<HelplinesFile>("helplines.yaml");
  const paths = folder<Path>("paths", ".yaml", (rel) => yaml(rel, "paths/"));

  // ---------------------------------------------------------- consistency
  if (dataVersion && records) {
    const version = dataVersion.version;
    const ids = new Set(records.map((record) => record.id));
    const stale = (rel: string, what: string) => problems.push(`data/${rel} is stale: ${what}; ${rebuild(rel)}`);

    if (records.length !== dataVersion.records) {
      stale("innovations/", `${records.length} records, data-version.json says ${dataVersion.records}`);
    }
    if (indexCards) {
      const cardIds = new Set(indexCards.map((card) => card.id));
      const extra = [...cardIds].filter((id) => !ids.has(id));
      const lacking = [...ids].filter((id) => !cardIds.has(id));
      if (extra.length || lacking.length || cardIds.size !== indexCards.length) {
        stale("index-cards.json", `ids differ from innovations/ (${extra.length} unknown, ${lacking.length} missing, ${indexCards.length - cardIds.size} repeated)`);
      }
    }
    if (vectors) {
      const model = options.embeddingModel ?? process.env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
      if (vectors.data_version !== version) stale("index-vectors.json", `data_version ${vectors.data_version}, data-version.json says ${version}`);
      if (vectors.records_count !== dataVersion.records) stale("index-vectors.json", `records_count ${vectors.records_count}, data-version.json says ${dataVersion.records}`);
      const keys = Object.keys(vectors.vectors ?? {});
      const extra = keys.filter((id) => !ids.has(id));
      if (extra.length || keys.length !== ids.size) stale("index-vectors.json", `vector keys differ from the record ids (${keys.length} keys, ${extra.length} unknown)`);
      if (vectors.model !== model) {
        problems.push(`data/index-vectors.json was built with ${vectors.model}, but the embedding service uses ${model} (EMBEDDING_MODEL); vectors of one model are useless with queries of another (FR-3.7); ${rebuild("index-vectors.json")}, or set EMBEDDING_MODEL`);
      }
      const wrongDims = keys.filter((id) => vectors.vectors[id].length !== vectors.dims).length;
      if (wrongDims) stale("index-vectors.json", `${wrongDims} vectors are not ${vectors.dims} long`);
    }
    const checkImplementations = (rel: string, file: { data_version: string | null; implementations: { innovation_id: string }[] } | undefined) => {
      if (!file) return;
      if (file.data_version !== version) stale(rel, `data_version ${file.data_version}, data-version.json says ${version}`);
      const unknown = file.implementations.filter((row) => !ids.has(row.innovation_id)).length;
      if (unknown) stale(rel, `${unknown} rows name an innovation_id that is not a record`);
    };
    checkImplementations("implementations-derived.json", derived);
    checkImplementations("implementations-merged.json", merged);
    if (organisations) {
      if (organisations.data_version !== version) stale("organisations.json", `data_version ${organisations.data_version}, data-version.json says ${version}`);
      const unknown = [
        ...organisations.organisations.flatMap((row) => row.innovation_ids),
        ...organisations.natural_person_innovations.map((entry) => entry.innovation_id),
      ].filter((id) => !ids.has(id)).length;
      if (unknown) stale("organisations.json", `${unknown} innovation ids are not records`);
      if (merged) {
        const orgIds = new Set(organisations.organisations.map((row) => row.id));
        const orphans = merged.implementations.filter((row) => row.organisation_id !== null && !orgIds.has(row.organisation_id)).length;
        if (orphans) stale("implementations-merged.json", `${orphans} rows name an organisation_id that is not a row of organisations.json`);
      }
    }
    if (knowledge) {
      const itemIds = new Set(knowledge.items.map((item) => item.id));
      const unknown = Object.values(knowledge.model_by_target_group).flat().filter((id) => !itemIds.has(id));
      if (unknown.length) problems.push(`data/knowledge.yaml: model_by_target_group names unknown items ${unknown.join(", ")}; fix the file`);
    }
  }

  if (problems.length > 0) throw new DataLoadError(problems);
  // Every value is defined here: each undefined added a problem above.
  return {
    dataVersion: dataVersion!,
    records: records!,
    indexCards: indexCards!,
    vectors: vectors!,
    taxonomies: taxonomies!,
    incubators: incubators!,
    organisations: organisations!,
    implementations: merged!.implementations,
    places: places!,
    localities: localities!,
    boundaries: boundaries!,
    indicators: indicators!,
    advisors: advisors!,
    knowledge: knowledge!,
    helplines: helplines!,
    paths: paths!,
  };
}

/** The whole of data/, checked and mapped to the app's contracts. Throws DataLoadError. */
export function loadDataset(options: LoadOptions = {}): Dataset {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  return mapDataset(loadRawData(options), { today });
}

let cached: Dataset | undefined;

/** loadDataset() once per server process. */
export function getDataset(): Dataset {
  cached ??= loadDataset();
  return cached;
}
