# From data/ to the app's contracts

For the two developers. The app keeps its contracts in one file,
`src/lib/contracts.ts`; one module maps the real data (`data/`, types in
`src/lib/data/types.ts`) into them: `src/lib/data/to-contracts.ts` (pure
functions, no I/O). The server reads `data/` with `src/lib/data/load.ts`
(`getDataset()`, cached per process; `loadDataset()`, `loadRawData()`), which
checks the files and returns a `Dataset`. YAML is read with the `yaml`
package through `src/lib/data/yaml.ts` (YAML 1.2 core schema: plain dates
stay strings, a duplicate key is an error); a syntax error names the file
and the line. A contract change and a data change both land in
`to-contracts.ts`; nothing else converts.

Figures: build `2026-10-03-f3d93b5c` (381 records, 30 paths).

## Innovation (catalogue.ts) from `innovations/<id>.json`

| Contract | Data | Rule |
|---|---|---|
| `id`, `title`, `source` | same | |
| `organisation` | `organisations.json` row whose `innovation_ids` has the record, `.name`; else `organisation.name` | null for the 169 `natural_person_innovations`; the row's name has people removed (22 names differ) |
| `website` | org row `.website`, else `organisation.website` | null for natural persons |
| `sourceUrl`, `licence`, `retrievedAt` | the `sources[]` entry named like `source` (else the first): `url`, `licence`, `retrieved_at` | |
| `summary`, `problem`, `mechanism` | `derived.summary_pl`, `problem_pl`, `mechanism_pl` | our derived text, allowed for every licence |
| `requires` | `derived.requires_pl` | |
| `targetGroups`, `implementerTypes` | `derived.target_groups`, `implementer_types` | |
| `costBand`, `timeToImplement`, `evidenceLevel` | `derived.*` | never null in the data; `unknown` stays |
| `originPlace` | `derived.origin_place_pl` | |
| `incubator` | `origin.incubator_name`, `incubator_years`, `programme` | |
| `materials[]` | `materials[]` `type`, `title`, `url` | `link_status: dead` dropped (5 of 2 015) |

## Route parts (route.ts)

| Contract | Data | Rule |
|---|---|---|
| `RouteSolution.what_it_takes` | `derived.implementer_types`, `cost_band`, `time_to_implement`, `evidence_level` | `toWhatItTakes` |
| `RouteSolution.materials` | as `Innovation.materials` | |
| `RouteSolution.contact` | `organisation` as above; `channels` | `toContact` |
| `Channel[]` | org website as `www`; the source entry URL as `www` when `contact_in_source` | contacts were not copied (R6), so the entry is linked; none for natural persons |
| `people.innovators[]` | `organisation`, `channels`, `persons_public`, `innovation_id` | none for a record without an organisation (174: natural persons and 5 without any) |
| `people.advisor` | `advisors.yaml` row: `category`, `name` (null, OP-10), `role`, `email`, `phone` | institutional contacts only |
| `knowledge[]` | `knowledge.yaml` item: `title_pl`, `url`, `type`; `for_innovation_id: null` | `Dataset.knowledge.always` (always_show), `byTargetGroup` (model_by_target_group); `materialToKnowledgeLink` for a solution's material |
| `engine.data_version` | `data-version.json` `version` | `Dataset.version` |

## Gmina, Implementation (catalogue.ts)

| Contract | Data | Rule |
|---|---|---|
| `Gmina` `terc`, `name`, `powiat`, `kind`, `centroid` | `places/pl-register.json`, level `gmina` | all 2 479 in `gminy`, the 183 of Małopolska in `gminyMalopolska`; centroid default `[0, 0]` (none missing today) |
| `Implementation` `id`, `innovation_id`, `status`, `source`, `source_url`, `note_pl` | `implementations-merged.json` | |
| `place_terc`, `place_name` | same; `place_name` null when absent | rows with `place_terc: null` (9 regional models) dropped |
| `organisation` | `organisations.json` row of `organisation_id`, else the seed's `organisation.name_pl`, else null | |
| `year` | same, null when absent | |
| `LocatedImplementation` (shape of `src/lib/mock/implementations.ts`) | Implementation plus the gmina centroid | 119 rows |

## ImplementationPath (path.ts) from `paths/<id>.yaml`

Copied as they are: `id`, `name_pl`, `legal_basis_pl`, `applicant_types`,
`amount_note_pl`, `timing.note_pl`, `decision_maker_pl`, `steps_pl`,
`source_url`, `verified_on`, `reviewer`, `notes_pl` (the prototype note of
FR-1.8 is prepended if a file ever lacks it). `timing.kind`: `rolling` to
`rolling`; `annual` and `fixed` to `fixed`; `per-call` to `resolution` (each
call is set by the deciding body); `closed` to `none-open`; a `fixed` path
whose every `closes_on` lies before today becomes `none-open`. Today: 6
rolling, 7 fixed, 3 resolution, 14 none-open.

## Gaps: data the contracts cannot carry

Defaults are in the Rule columns above; the embedding model defaults to
`OPI-PIB/PolDense-400M` (`EMBEDDING_MODEL`), "today" to the server date.

- Innovation: the second `sources[]` entry of the 34 merged records (the
  second attribution line of FR-1.8), `licence_url`, `persons_public` (only
  via `people.innovators`), `contact_in_source` (only as a channel), `links[]`
  (577, 112 dead), `intro_pl`, `derived.domains`, `setting`, `scale`,
  `keywords_pl`, `origin.selected_for_dissemination`,
  `dissemination_label_pl`, `region`, `rops_incubated`,
  `incubator_profile_url`, `merged_from`, the ROPS `source_fields` full text,
  per-material `licence`; `link_status` `ok` and `unknown` look the same.
  Use `Dataset.raw.records` until the contract grows.
- Path: `decides`, `purposes`, `target_groups`, `scope`,
  `amount_min_pln`, `amount_max_pln`, `timing.calls[]` (labels, applicant
  types, `opens_on`, `closes_on`; the annual roll-forward), `fit`; the
  composer reads them from `Dataset.raw.paths` (`src/server/route/paths.ts`).
  The mock's `firmy` and `osoby` do not occur in the data.
- Implementation: the regional-model rows (no place), `project_title_pl`,
  `organisation_id`, the organisation `type`, `match`, `origin_file`.
- Gmina: `code`, `label` (the picker label), `wojewodztwo`, `parent`.
- Knowledge: `description_pl`, `target_groups`, `source_url`,
  `verified_on`. Advisor: `source_url`; the `programme_contacts` of
  `advisors.yaml`.
- Helplines, the ROPS department, indicators and boundaries have contracts (the fixed contacts and the map data of
  `src/lib/contracts.ts`, mapped in `to-contracts.ts` as `Dataset.helplines`, `department`,
  `indicators`, `boundaries`); the helplines' `short` and `forWhom` come
  from a table in `to-contracts.ts`, a BDL "no information" flag drops
  the value. No contract, kept in data types under `Dataset.raw`: index
  cards, vectors, organisations, incubators, taxonomies.

## Loader checks and errors

`loadRawData()` collects every problem and throws one `DataLoadError`
(`problems: string[]`), each line naming the file and the command that
builds it, ending with the bundle alternative
(`.venv/Scripts/python scripts/unpack-data.py <zip>`). The checks:

- every file present: missing, e.g. `data/index-vectors.json is missing;
  rebuild: .venv/Scripts/python scripts/build-index-vectors.py`;
  hand-written files point to `git checkout -- data/<file>`;
- valid JSON, YAML inside the subset, `id` equal to the file name
  (`innovations/`, `paths/`);
- `innovations/*.json` count equals `records`; `index-cards.json` ids are
  exactly the record ids;
- `index-vectors.json`: `data_version` equals `version`, `records_count`
  equals `records`, the keys of `vectors` are the record ids, every vector
  has `dims` numbers, and `model` equals `EMBEDDING_MODEL`;
- `implementations-derived.json`, `implementations-merged.json`,
  `organisations.json`: `data_version` equals `version`, every
  `innovation_id` is a record id; every `organisation_id` is a row of
  `organisations.json`;
- `knowledge.yaml`: `model_by_target_group` names only existing items.

A stale file reads `data/<file> is stale: <what differs>; rebuild: <command>`.
`load.ts` runs outside Next.js as it is, for example under `npx -y tsx@4`.

## Partner records (FR-1.6)

The schemas accept a third source, `partner-rops`, with ids `inn-partner-<slug>`
and a `sources[].url` that may be null (a spreadsheet row has no web page).
`SourceName` in `src/lib/contracts.ts` has `partner-rops` with its own
label; an empty `sourceUrl` means no link, so the innovation page shows no
"Pełny opis w źródle" link and `toChannels` adds no entry link.
