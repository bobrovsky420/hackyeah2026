# data/: the files the app serves

For the two developers of the loader and the API. `data/` holds only what the
app reads at run time; the pipeline's working files stay in `.local/pipeline/`.
Contracts: [docs/innovation-record.md](../docs/innovation-record.md) for the
records, sections 8.1 to 8.9 of the
[specification](../docs/functional-specification.md) for the rest. Types:
[src/lib/data/types.ts](../src/lib/data/types.ts), with the record shapes
generated from `schemas/` by `node scripts/build-data-types.mjs`;
`node scripts/build-data-types.mjs --check` type-checks every file present in
`data/` against them. Figures are of a build of 381 records.

## The files

Two folders. `curated/` holds what people write by hand; `built/` holds
every build output of the scripts below. Paths in the table are relative to
`data/`.

| File | Holds | Written by | Type |
|---|---|---|---|
| `curated/taxonomies.json` | Closed lists and mapping rules of the record (8.2), `tax-v3` | hand | `TaxonomiesFile` |
| `curated/duplicates-decisions.json` | A person's decision on each duplicate pair the build flags (FR-1.4) | hand | `DuplicateDecisionsFile` |
| `curated/advisors.yaml` | One contact row per target group (8.6, FR-6.2) | hand | `AdvisorsFile` |
| `curated/implementations.yaml` | Seeded implementations with sources (8.6, FR-6.3) | hand | `ImplementationsFile` |
| `curated/knowledge.yaml` | Fixed links of the route's knowledge block and the model per target group (FR-4.3) | hand | `KnowledgeFile` |
| `curated/helplines.yaml` | Free helplines of S10 and Zasady, checked against the operators (12.6) | hand | `HelplinesFile` |
| `curated/lexicon-pl.yaml` | The crisis lexicon of the pre-checks (FR-12.1) | hand | - |
| `curated/banned-words-pl.yaml` | The banned words checked in every model text a reader sees (FR-12.10) | hand | - |
| `built/incubators.json` | The 34 incubator profiles of the national base | `parse-catalogues.py` | `IncubatorsFile` |
| `built/innovations/<id>.json` | One built record per innovation (381) | `derive-records.py build` | `BuiltInnovation` |
| `built/index-cards.json` | One line per record for stage 1 (FR-3.1) | `derive-records.py build` | `IndexCard[]` |
| `built/data-version.json` | The data version (FR-1.7) | `derive-records.py build` | `DataVersion` |
| `built/index-vectors.json` | One embedding per record for the retriever (FR-3.7) | `build-index-vectors.py` | `IndexVectorsFile` |
| `built/places/pl-register.json` | Voivodeships, powiats and gminas of Poland (8.9) | `build-static-data.py`, step `places` | `PlacesRegister` |
| `built/places/malopolska-localities.json` | Villages and Kraków delegatury of Małopolska, each with its gmina (FR-2.2) | `build-static-data.py`, step `places` | `LocalitiesFile` |
| `built/map/malopolska-gminy.geojson` | The 183 gmina boundaries of Małopolska (8.8, FR-7.1) | `build-static-data.py`, step `map` | `GminaBoundaries` |
| `built/indicators.json` | Four GUS BDL indicators per gmina (8.8, FR-7.2) | `build-static-data.py`, step `indicators` | `IndicatorsFile` |
| `built/implementations-derived.json` | The place of origin of every built record as an implementation (8.6) | `build-static-data.py`, step `origins` | `ImplementationsDerivedFile` |
| `built/organisations.json` | Innovator organisations and seed implementers, natural persons by id only (8.6, FR-6.1) | `build-static-data.py`, step `organisations` | `OrganisationsFile` |
| `built/implementations-merged.json` | Seeds plus origins with `organisation_id` (8.6, FR-6.3); the map and the route read this file | `build-static-data.py`, step `organisations` | `ImplementationsMergedFile` |
| `built/paths/<id>.yaml` | One YAML per legal or funding path, 30 files, researched from primary sources without legal review (8.7); the research runs behind them (saved sources, evidence, drafts, report) stay in `.local/paths-research/<date>/` and are not packed | the skill `/research-paths`, after the user approves its report | `Path` |

The git rule: git carries only what cannot be recreated. `data/curated/` is
committed; `data/built/` is in `.gitignore` as a whole and is rebuilt with
the commands below or arrives as a bundle of the whole folder. The paths of
`data/built/paths/` are recreated by the skill `/research-paths` (with the
user's approval), so they travel only in bundles. `data/` holds only what
the app reads: research and other working files belong in `.local/`. On a fresh
clone the loader names each missing file and the command that builds it.

To move the data to another machine, make a data release:
`.venv/Scripts/python scripts/pack-data.py --release X.Y.Z` writes
`.local/bundles/data-X.Y.Z.zip` (every file of `data/`,
`.local/pipeline/{sources,derived,manifest.json,duplicates.json,link-check.json}`
and the replay files of `.local/route-cache/` and `.local/llm-replay/`, with
a sha256 manifest and a note `data-X.Y.Z.md`; it type-checks the data first
and refuses an inconsistent set or a label that is not above the last
release; `--rebuild` runs steps 4 to 7 below first) and
`scripts/unpack-data.py <zip>` verifies and restores it without touching
the files git tracks; see [docs/data-setup.md](../docs/data-setup.md).
Bundles of format 4 carry the `curated/` and `built/` paths, with the
legal and funding paths in `built/paths/`; a bundle of format 3 still
unpacks, its `curated/paths/` moved to `built/paths/` and its
`curated/safety/` files to `curated/`, and one of format 1
or 2 too, its flat `data/` paths moved to the new places; `--prune`
deletes the old flat build outputs left in `data/`.

A partner hand-over (FR-1.6) enters the pipeline beside the two
catalogues: save the file under `.local/raw/partner/`, copy
`tests/fixtures/partner/mapping.yaml`, put the partner's column headers into
it, and run `scripts/ingest-partner.py --dry-run`, then without it. The
adapter writes `inn-partner-<slug>` source records, which the extraction skill
and `derive-records.py build` treat like the catalogue records. A row that
repeats a catalogue title is listed as a possible duplicate and decided in
`duplicates-decisions.json`. Nothing in `data/` changes until the next build.
The app reads `data/` through `src/lib/data/load.ts`, which runs the checks
below and maps the files onto the app's contracts (`docs/data-to-contracts.md`).

## Rebuild order

From the repository root, with `.venv` as in `AGENTS.md`:

1. `.venv/Scripts/python scripts/crawl-catalogues.py s1 s1-files s2 s2-files`:
   snapshots into `.local/raw/`.
2. `.venv/Scripts/python scripts/parse-catalogues.py`: source records into
   `.local/pipeline/sources/`, and `data/built/incubators.json`.
3. `/extract-innovations` in Claude Code: derived records into
   `.local/pipeline/derived/`, each validated by `derive-records.py validate`.
4. `.venv/Scripts/python scripts/derive-records.py build`: into `data/built/`
   `innovations/`, `index-cards.json`, `data-version.json`; applies
   `data/curated/duplicates-decisions.json`.
5. `.venv/Scripts/python scripts/fetch-static-data.py` (once; BDL needs
   `BDL_CLIENT_ID`), then `.venv/Scripts/python scripts/build-static-data.py`:
   into `data/built/` `places/`, `map/`, `indicators.json`, `implementations-derived.json`,
   `organisations.json` and `implementations-merged.json`
   (`--only places,map,indicators,origins,organisations`; `origins` needs
   step 4, `organisations` needs `origins`).
6. `.venv/Scripts/python scripts/build-index-vectors.py`:
   `data/built/index-vectors.json`.
7. `.venv/Scripts/python scripts/check-links.py` writes
   `.local/pipeline/link-check.json`; `derive-records.py build` again copies
   `link_status` and `link_checked_at` onto every material and link.

The data version is the build date plus a hash of the record ids, their
source fingerprints, the taxonomy version and the prompt version. The second
build keeps it on the same day over the same records; otherwise rerun
`build-static-data.py --only origins` and step 6 so that the stamps agree.

## Version stamps and load-time checks

`data-version.json` holds `version` (the build date and a content hash, `2026-10-03-f3d93b5c`) and `records`;
`index-vectors.json` repeats them as `data_version` and `records_count`, with
`model` and `dims`; `implementations-derived.json` carries `data_version`;
`index-cards.json` and `innovations/` come from the same build as
`data-version.json`. At load time the app checks, and on a failure refuses to
serve matching (or to start) with a message naming the stale file:

- the number of `innovations/*.json` equals `records`, and the ids of
  `index-cards.json` are exactly the record ids;
- `index-vectors.json`: `data_version` equals `version`, `records_count` equals
  `records`, the keys of `vectors` are the record ids;
- `index-vectors.json`: `model` equals the model of the embedding service
  (`GET /health` of `scripts/embedding-service.py`; `EMBEDDING_MODEL`, default
  `OPI-PIB/PolDense-400M`). Vectors of one model are useless with queries of
  another (FR-3.7); the service itself refuses to start on a mismatch;
- `implementations-derived.json`: `data_version` equals `version`, and every
  `innovation_id` of both implementation files is a record id.

`version` is what "Jak to działa" shows (FR-1.7), what `/api/health` returns
and part of the replay-cache key (FR-3.5).

## Display and privacy (FR-1.8, FR-1.9, innovation-record.md section 8)

- Attribution: every displayed innovation (S2, S3, S5) carries one line per
  entry of `sources[]`, "Źródło: {tytuł}, {organizacja}. {nazwa źródła},
  {licencja}. Pobrano {data}.", from `title`, `organisation.name`,
  `sources[].name`, `sources[].licence` and `sources[].retrieved_at`, linked to
  `sources[].url`; for `CC BY 4.0` the licence links `licence_url` (the deed).
  It is always followed by the prototype note, verbatim: "Prototyp z
  hackathonu HackYeah 2026: treści pochodzą z publicznych katalogów innowacji
  społecznych na licencjach podanych przy wpisie i nie były weryfikowane
  prawnie. Sprawdź źródło przed użyciem."
- Licence per source: a national-base record shows title, organisation,
  codes, our own `derived` summaries, the "Problem" and "Jak działa" passages
  of at most 60 words each, and links; software is never copied. A ROPS record
  under `CC BY 4.0` may be shown in full. A record whose ROPS source is
  `MIIS-agreement` (15) is displayed exactly like the other ROPS records
  (decided: the app is built for ROPS, the licensor of these items, so no separate licence applies); the licence value stays in the data as provenance only.
- `source_fields`, `source_fields_secondary` and `text_pl` serve matching and
  short quotes; they are rendered in full only for ROPS `CC BY 4.0` records.
- `persons_public`: names exactly as the source publishes them, as authors of
  a public work; nothing else about a person is stored or added.
- `contact_in_source: true`: the entry publishes contact details, which were
  not copied (R6); link the entry instead. Only organisations have a website.
- `link_status` (`ok`, `dead`, `unknown`) and `link_checked_at` on
  `materials[]` and `links[]`: never present a `dead` link as working. Both
  fields are absent until a link check has run.
- `raw_path` and `local_path` point into `.local/` of the machine that built
  the data and are never served. `review_flags`, `derived.evidence`,
  `derived.confidence` and `derived.notes_pl` are for the reviewers.
- `sources[].url` is the entry itself (`https://innowacjespoleczne.pl/innowacja/<slug>`
  or the ROPS library page). Parse-v2 had overwritten it
  in 265 national-base entries with the last link of the page; parse-v3
  fixed it and every record was rebuilt (the check that found
  it: every national `sources[0].url` must match that pattern).

## Hand-written files

In `data/curated/`.

`taxonomies.json`: `version`, `note`, then per closed list an array of
`{code, label_pl}`: `target_groups` (plus `rops_category_slug`), `domains`
(plus `hint_pl`), `implementer_types` (plus `national_base_value`,
`paths_applicant_type`), `cost_bands`, `time_to_implement`,
`evidence_levels`, `settings`, `scales`; the last three keys hold the parser's
mapping rules. The unions of `types.ts` mirror the lists (`--check` fails when
they differ); a change of a closed list is a new version and a rerun of the
extraction. Excerpt:
`{"code": "seniorzy", "label_pl": "Dla seniorów", "rops_category_slug": "dla-seniorow"}`.

`duplicates-decisions.json`: `{note, decisions[]}`; a decision has `ids` (two
record ids), `title`, `decision` (`keep-both`, or `merge` with `primary` and
`secondary`), `reason`, `decided_by`, `decided_on`. Every build applies it;
the pairs still to decide are in `.local/pipeline/duplicates.json`.

```json
{"ids": ["inn-rops-dialog-ponad-kulturami-1", "inn-rops-dialog-ponad-kulturami"], "title": "Dialog ponad kulturami", "decision": "keep-both", "reason": "Two innovations with the same title for different target groups.", "decided_by": "the team", "decided_on": "2026-10-03"}
```

`advisors.yaml`: `version`, `source_url`, `verified_on`, `department` (name,
address, hours, e-mail, phones), `programme_contacts` (`usluga-wrazliwa`) and
`advisors[]`, one row per target-group code: `category`, `name` (null until
ROPS publishes one), `role`, `email`, `phone`, `source_url`.

```yaml
  - category: seniorzy
    name: null
    role: Dział Innowacji Społecznych ROPS Kraków
```

`implementations.yaml`: `version`, `sources` (key to `url` and
`results_on`) and `implementations[]`: `id`, `innovation_id`, `place_terc`,
`place_name`, `organisation` (nested `name_pl`, `type`, optional
`source_url`; spec 8.6 names an `organisation_id`, but there is no
organisation table yet), `year`, `status` (`running`, `planned`), `source`
(`usluga-wrazliwa`, `regional-model`), `source_url`, `project_title_pl`,
`note_pl`. The nine `regional-model` rows have `place_terc: null`
(voivodeship-wide) and no place name, organisation, year or project title. A
row with `source: demo` is labelled "dane demonstracyjne" on screen (FR-6.3).
Quote TERC codes and dates, or YAML reads them as numbers and dates.

```yaml
  - id: impl-uw1-02
    innovation_id: inn-rops-straznik
    place_terc: "1261011"
    place_name: Kraków
    organisation:
      name_pl: Polski Związek Głuchych Oddział Małopolski w Krakowie
      type: ngo
```

`knowledge.yaml`: per item `id`, `title_pl`, `description_pl`, `url`, `type`,
`target_groups`, `always_show`, `source_url`, `verified_on`; the top-level
`model_by_target_group` maps each target-group code to the model or page the
composer adds. `helplines.yaml`: per number `id`, `order`, `group` (alarm or
support), `name_pl`, `number`, `hours_pl`, `who_for_pl`, `free`, `url`,
`source_url`, `verified_on`; top-level `note_pl` and `reviewer` (null until
the lawyer confirms).

`built/paths/<id>.yaml`: id equal to the file name; `name_pl`, `legal_basis_pl`;
`applicant_types` (jst, ngo, pes, mieszkancy); `decides` (jst, ngo,
mieszkancy, panstwo, operator-ue); `purposes`; `target_groups` (taxonomy codes
or `[any]`); `scope` (lokalna, malopolska, krakow, krajowa, ue);
`amount_min_pln`, `amount_max_pln` (PLN or null; EUR only in
`amount_note_pl`); `timing` with `kind` (rolling, annual, fixed, closed,
per-call), `note_pl` and `calls[]` (`label_pl`, `applicant_types`,
`opens_on`, `closes_on`; for `annual` the app rolls a passed `closes_on`
forward by a year); `decision_maker_pl`; `steps_pl` (three imperative
sentences, at most 12 words each); `fit` (`cost_bands`, `roles`,
`boost_when_implementer_types`); `source_url`; `verified_on`;
`reviewer: null`; `notes_pl`, opening with the prototype note of FR-1.8 and
"Sprawdź u źródła.". Validated by `scripts/check-paths.py`; re-verified
or added with the skill `/research-paths` in Claude Code.

## Built files

In `data/built/`.

`organisations.json`: `note`, `data_version`, `privacy`, `type_rules`,
`grouping`, `reasons`, `counts`, then `organisations[]` with `id`
(`org-<ascii slug>`), `name`, `type` (implementer-type code or null with
`type_note`), `website`, `place_terc`, `place_name`, `place_match`,
`innovation_ids`, `implementation_ids`, `source` (`catalogue`, `seed`),
`source_urls`, `contact_opt_out` (false). Then `natural_person_innovations[]`
(`innovation_id`, `reason`, no names), `without_organisation[]` and
`review`. No e-mail, phone or postal address; the app links the source entry.
`implementations-merged.json`: `note`, `data_version`, `seeds_version`,
`sources`, `counts`, then `implementations[]` with every field of both
inputs plus `organisation_id` (null for natural persons and the regional
models) and `origin_file` (`data/curated/implementations.yaml` or
`data/built/implementations-derived.json`), and `deduplicated[]`. Load-time check for both:
`data_version` equals `version`, every `innovation_id` is a record id and
every `organisation_id` is a row of `organisations.json`.

`innovations/<id>.json` (innovation-record.md sections 3, 4 and 7): the
source record without `parsed_at`, plus `derived` (the derived record without
`id` and `source_fingerprint`), `status: "active"`, and on the 34 merged
records `merged_from` and `source_fields_secondary` (the national entry's
fields). ROPS records may carry the source field `oznaczenie` (the library's
dissemination label), which the contract's key list does not name. Excerpt of
`inn-rops-merkury.json`, shortened at `...`:

```json
{"id": "inn-rops-merkury", "source": "rops-biblioteka", "title": "Merkury", "sources": [{"name": "rops-biblioteka", "url": "https://rops.krakow.pl/innowacje-spoleczne/biblioteka-innowacji-spolecznych/dla-seniorow,merkury", "category_slug": "dla-seniorow", "retrieved_at": "2026-10-03", "licence": "CC BY 4.0", "licence_url": "https://creativecommons.org/licenses/by/4.0/deed.pl", ...}, ...],
 "organisation": {"name": "Stowarzyszenie Edukacji Pozaformalnej „Meritum”", "website": null},
 "persons_public": ["Bartosz Kosiński", "Mirosław Bohatkiewicz"], "contact_in_source": true, "materials": [{"type": "zip", "title": "Materiały do pobrania", "url": "https://rops.krakow.pl/pliki/IS/bibloteka/merkury.zip", "licence": "CC BY 4.0", "local_path": null, "link_status": "ok", "link_checked_at": "2026-10-03T12:07:43"}, ...],
 "merged_from": ["inn-nat-merkury-symulator-kioskow-samoobslugowych"], "derived": {"prompt_version": "extract-v4", "generated_by": "claude-sonnet-5", "target_groups": ["seniorzy"], "cost_band": "low", "evidence_level": "selected-for-dissemination", ...},
 "status": "active"}
```

`index-cards.json`: an array, one object per record: `id`, `title`, `card`
(the index card, prefixed with the title), `target_groups`, `domains`,
`implementer_types`, `cost_band`, `evidence_level`.

```json
{"id": "inn-rops-merkury", "title": "Merkury", "card": "Merkury: symulator bankomatu, parkomatu, paczkomatu i kasy samoobsługowej dla seniorów; organizacje pozarządowe, dzienne domy pomocy, kluby seniora; niski koszt.", "target_groups": ["seniorzy"], "domains": ["kompetencje-cyfrowe", "samodzielnosc"], "implementer_types": ["ngo", "placowka"], "cost_band": "low", "evidence_level": "selected-for-dissemination"}
```

`data-version.json`, in full:
`{"version": "2026-10-03-f3d93b5c", "records": 381, "merged": 34, "skipped_without_valid_derived": 0, "prompt_version": "extract-v4", "parser_version": "parse-v3", "built_at": "2026-10-03T12:46:52"}`.

`index-vectors.json` (3.3 MB): a header, then `vectors`, record id to 1 024
unit-length numbers, so cosine is a dot product. Queries take `query_prefix`,
records `passage_prefix`; a record's document is its title, summary, problem,
mechanism and keywords.

```json
{"model": "OPI-PIB/PolDense-400M", "dims": 1024, "normalized": true, "query_prefix": "[query]: ", "passage_prefix": "", "document": "title, summary_pl, problem_pl, mechanism_pl, keywords_pl", "data_version": "2026-10-03-f3d93b5c", "records_count": 381, "licence": "PolDense: Gemma Terms of Use; cite Dadas et al. 2026, Parameter-Efficient Retrievers for Polish and European Languages", "vectors": {"inn-nat-1032": [-0.00926, -0.01217, ...], ...}}
```

`incubators.json`: `{source, retrieved_at, incubators[]}`; an incubator has
`uuid`, `name`, `years`, `programme` (`POWER 4.1`, `FERS` or null), `url`,
`website`, `innovation_slugs` (the record id without `inn-nat-`) and `rops`
(true for the four ROPS incubators). Excerpt:
`{"uuid": "6f4243fd-c133-4c85-a72a-9aabd3ea658b", "name": "Inkubator Dostępności", "years": "2019-2022", "programme": "POWER 4.1", "url": "https://innowacjespoleczne.pl/profil/6f4243fd-c133-4c85-a72a-9aabd3ea658b/", "website": "https://rops.krakow.pl/", "innovation_slugs": ["blueseaeye", "cold-box", ...], "rops": true}`.

`places/pl-register.json`: a header (`source`, `stan_na`, `retrieved_at`,
`centroids`, `codes`, `counts`) and `places[]` on three levels:
`wojewodztwo` (16), `powiat` (380), `gmina` (2 479). A gmina carries the
picker `label` and its `centroid` `[lon, lat]`; `terc` is the seven-digit
TERC used everywhere else. The picker passes on gminas only and resolves the
districts of Kraków to `1261011`.

```json
{"code": "PL-12-61-011", "terc": "1261011", "level": "gmina", "name": "Kraków", "kind": "gmina miejska", "parent": "PL-12-61", "powiat": "Kraków", "wojewodztwo": "małopolskie", "label": "Kraków (miasto na prawach powiatu)", "centroid": [19.985, 50.0532]}
```

`places/malopolska-localities.json` (125 KB): a header (`source`, `stan_na`,
`retrieved_at`, `scope`, `counts`) and `localities[]` from the GUS SIMC
register (the step needs `.local/teryt/SIMC_Urzedowy`): the villages (1 730)
and the four delegatury of Kraków, without parts of localities, hamlets and
settlements, and without a locality named like its own gmina (all 64 towns),
which the gmina already covers. `terc` is the gmina the locality belongs to:
the picker finds the gmina by the locality's name and passes on only that
TERC. The fixtures carry a copy as `src/lib/mock/localities.json`.

```json
{"simc": "0453492", "name": "Mszana Górna", "kind": "wieś", "terc": "1207092"}
```

`map/malopolska-gminy.geojson` (85 KB): a FeatureCollection with a `source`
line and 183 Polygon or MultiPolygon features in WGS 84; join on
`JPT_KOD_JE`, the TERC. Properties of a feature:
`{"JPT_KOD_JE": "1201011", "JPT_NAZWA_": "Bochnia", "kind": "gmina miejska", "powiat": "bocheński"}`.

`indicators.json`: `source` (GUS BDL, CC BY 4.0), `note`, `indicators[]`
(`key`, `variable_id`, `name_pl`, `unit_pl`, `year`, `gminas_with_value`,
Małopolska `median`, `min`, `max`), `need_by_target_group` (indicator keys per
target group, `default` for the rest), `gminas` keyed by TERC, and `missing`
(Szczawa, `1207132`, has no value yet: "brak danych"). A value carries `flag`
and `flag_pl` when BDL marks it (none in this build).

```json
"1261011": {"terc": "1261011", "name": "Kraków", "kind": "gmina miejska", "powiat": "Kraków", "values": {"social-assistance": {"value": 178, "year": 2024}, "ageing": {"value": 19.9, "year": 2024}, "unemployment": {"value": 2.2, "year": 2024}, "civic-density": {"value": 70, "year": 2024}}}
```

`implementations-derived.json`: `note`, `data_version`, `matching`,
`implementations[]` (104 rows with the fields of `implementations.yaml`
except organisation and project title, plus `match`, how the place was
resolved; always `source: catalogue-origin` and `status: completed`) and
`unmatched[]` (`innovation_id`, `place`, `reason`). The map and the route
read both implementation files together (FR-6.3).

```json
{"id": "impl-origin-inn-nat-glucha-mama-na-rynku-pracy-2-1", "innovation_id": "inn-nat-glucha-mama-na-rynku-pracy-2", "place_terc": "1261011", "place_name": "Kraków", "match": "gmina", "year": 2019, "status": "completed", "source": "catalogue-origin", "source_url": "https://miedzyuszami.pl/m107-GLUCHA-MAMA", "note_pl": "Miejsce pochodzenia innowacji według katalogu: siedziba innowatora w czasie testowania."}
```
