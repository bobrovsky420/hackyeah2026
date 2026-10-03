# The innovation record: contract of the ingestion pipeline

Status: contract. Written for the two developers, for
the reviewers of the human check, and for every AI assistant that parses,
extracts, validates or consumes the catalogue data. It implements section
7.1 (FR-1.1 to FR-1.9) and section 8.1 of
[functional-specification.md](functional-specification.md) and the
decision that the extraction step runs as Claude Code
subagents, not as API calls from the app ([decision-log.md](decision-log.md)).

## 1. The pipeline in one picture

```
.local/raw/                         raw pages and files (crawl-catalogues.py)
      |  scripts/parse-catalogues.py         deterministic, no model
      v
.local/pipeline/sources/<id>.json   source record: verbatim text, provenance, mechanical mappings
      |  .claude/skills/extract-innovations  coordinator + worker subagents, prompts/extract.md
      v
.local/pipeline/derived/<id>.json   derived record: summaries, codes, evidence, written by a model
      |  scripts/derive-records.py validate  schema, closed lists, grounding, personal data
      |  scripts/derive-records.py build     merge of duplicates, index cards, data version
      v
data/innovations/<id>.json          the record the app seeds (spec 8.1); data/index-cards.json; data/data-version.json
```

Two kinds of folders. `data/` holds only what
the app serves: `innovations/`, `index-cards.json`, `data-version.json`,
`taxonomies.json`, `incubators.json`, and later the paths, indicators and
map files. It is the set to copy to the machine that runs the app. Git
carries only what cannot be recreated: of
`data/`, the hand-written `taxonomies.json`; the parser's
`incubators.json` and the build's `innovations/`, `index-cards.json` and
`data-version.json` are git-ignored and rebuilt by the pipeline. A file
added later follows the same test: hand-written reference data is
committed, generated data is not. `.local/pipeline/` holds the working files of the pipeline
and is machine-local (git-ignored with `.local/`): the source records, the
derived records, `manifest.json` (state per id) and `duplicates.json`.
Another clone recreates them with a fresh crawl and a fresh extraction
run. The review sample (`derive-records.py sample`) is the exception: it
is written to `docs/review-sample.md` and committed, because the reviewer works on another machine and the marked-up
file is the record of the human check of FR-1.3.

Two hand-written inputs are versioned next to what uses them:
`prompts/extract-example.json`, the worked example every worker reads
(the Merkury record; checked with `derive-records.py validate --file`),
and `.claude/skills/extract-innovations/pilot.json`, the pilot set.

Three writers. The parser owns the source records; the workers own the
derived records; the build owns `data/innovations`. Nobody edits a file
another step owns.

Versions: the parser stamps `parser_version` (`parse-v4`: v2 pulled real URLs from the free text of "Strona internetowa", v3 fixed v2's overwriting of the entry URL in `sources[]`, v4 removes postal addresses, e-mail addresses and phone numbers from the text and changed the fingerprints of the 8 records that had one); the worker
prompt carries `version: extract-v1` in its header and every derived
record repeats it; the taxonomies carry `tax-v3` (section 4). A change of the prompt
or of the taxonomies' closed lists is a new version, and `derive-records.py status` then
shows every old record as invalid until it is regenerated. A change of
the taxonomies' mapping rules alone (tax-v3) changes the `mapped` fields
of the source records on the next parse and leaves the derived records
valid: the validator checks the prompt version and the closed lists, and
the data version of the build carries the taxonomy version. A change of
the source text changes the `fingerprint`, and the derived record becomes
stale.

## 2. Identifiers

`inn-nat-<slug>` for the national base (the slug of the entry URL, for
example `inn-nat-1032`, `inn-nat-doradztwo-edukacyjne-dla-seniorow-2`);
`inn-rops-<slug>` for the ROPS library (the part of the URL after the
comma, for example `inn-rops-merkury`). Slugs are unique within each
catalogue (300 and 115 entries, no
collisions). A merged duplicate keeps the ROPS id and lists the national
id under `merged_from`.

## 3. The source record (`.local/pipeline/sources/<id>.json`, parse-v4)

Schema: [schemas/source-record.schema.json](../schemas/source-record.schema.json).
Everything here is copied or computed mechanically.

| Field | Content | Rule |
|---|---|---|
| `title`, `intro_pl` | The entry's title and, for the national base, its one-line intro | verbatim |
| `sources[]` | `name` (`baza-krajowa` or `rops-biblioteka`), `url`, `category_slug` (ROPS), `retrieved_at`, `licence` (`CC BY 4.0`, or `MIIS-agreement` for the 15 ROPS items whose terms need an agreement), `licence_url`, `raw_path`, `raw_sha256` | provenance of FR-1.1 |
| `source_fields` | One key per section of the entry, text verbatim, list items as lines starting with `- ` | keys below |
| `tags` | The national base's advanced terms (taxonomy, path, English name) and simple facets (`dla_kogo`, `kto_moze_wdrazac`, `charakter`, `narzedzia`, `obszar_dzialan`) | as published |
| `mapped` | `target_groups` and `implementer_types` derived from the facets and the ROPS category by the rules of spec 8.2 (`data/taxonomies.json`); `character`, `tools`, `areas` as names; `settings` and `domain_hints` from the advanced tags | the worker keeps the first two |
| `innovator` | `type` (Podmiot prawny, Osoba fizyczna, Grupa nieformalna, or null), `place_name` | national base |
| `organisation` | `name` and `website` when the innovator is a legal entity (national base) or an organisation is named among the authors (ROPS) | FR-1.9 |
| `persons_public` | Names of people exactly as the source publishes them | nothing else about a person is stored (R6) |
| `contact_in_source` | True when the entry carries contact details | they are never copied; the app links the entry |
| `origin` | `incubator_name`, `incubator_years`, `incubator_profile_url`, `programme` (`POWER 4.1` for incubators that ended by 2023, `FERS` from 2024), `selected_for_dissemination` (the ROPS label, or the national base's assessment comment), `dissemination_label_pl`, `region`, `rops_incubated` | |
| `materials[]` | `type` (pdf, doc, sheet, slides, zip, video, image, audio, link), `title`, `url`, `licence`, `local_path` under `.local/raw` when downloaded, `status` (for example `dead-2026-10-03`) | FR-1.8 links |
| `links[]` | The innovator's website and the "Inne linki" of the entry | |
| `text_pl` | The whole entry as plain text with the Polish labels: what the workers read and the validator quotes against; also the text the app stores for matching (FR-1.9) | |
| `review_flags` | Parser doubts: `authors-heuristic`, `persons-unsplit`, `unknown-label:<label>`, `missing-section:<id>`, `incubator-mismatch:<name>`, `innovator-type-missing`, `has-gallery`, `has-video-section`, `no-implementer-facet` | for the human check |
| `fingerprint` | 16 hex characters over title, category and source fields | stale detection |

Keys of `source_fields`. National base: `charakter`, `problem`,
`jak_dziala`, `komu_sluzy`, `kto_moze_wdrazac`, `produkty_testowania`,
`rezultaty_testowania`, `komentarz_do_oceny`, `miejsce_testowania`,
`zrodlo_finansowania`, `strona_www`, `kto_niezbedny`, `co_niezbedne`,
`typ_innowatora`, `innowator` (legal entities only), `miejscowosc`,
`instytucja_wspierajaca`. ROPS library: `oznaczenie` (the incubator label, 27 entries), `wstep` (rare), `na_czym_polega`,
`jakich_problemow_dotyczy`, `grupa_docelowa`, `kto_moze_skorzystac`,
`czy_to_dziala`, `autorzy`. The section "Kontakt w sprawie innowacji" is
never stored (`contact_in_source` records that it exists).

Personal data, decided for the parser (no legal review in the hackathon; OP-09 closed):
names of people stay as published (they are the authors of a public
work); phone numbers, e-mail addresses and postal addresses are not
copied for anybody, organisations included; a website is kept for
organisations only. The route screen links the source entry for contact.
Since parse-v4 the parser enforces this in every source field and in
`text_pl`: a street with a house number (ul., al., os., pl., plac, rynek
and the like) and a postal code NN-NNN are dropped while the institution
and the town stay ("Muzeum Kaset; Piaseczno"); an e-mail address becomes
"(adres e-mail w źródle)" and a nine-digit phone number "(telefon w
źródle)".

## 4. The derived record (`.local/pipeline/derived/<id>.json`, extract-v1)

Schema: [schemas/derived-record.schema.json](../schemas/derived-record.schema.json).
Worker instructions, with the decision rules for every field:
[prompts/extract.md](../prompts/extract.md). Closed lists:
[data/taxonomies.json](../data/taxonomies.json).

| Field | Content | Limit |
|---|---|---|
| `id`, `prompt_version`, `generated_by`, `generated_at`, `source_fingerprint` | Provenance of FR-1.3: which model, which prompt, which source state | fingerprint must match |
| `summary_pl`, `problem_pl`, `mechanism_pl` | Plain Polish, grounded in the source | 60 words each |
| `index_card_pl` | One line for the stage 1 index: title, what, for whom, who implements, cost band | 30 words |
| `target_groups`, `domains`, `implementer_types` | Codes from the taxonomies; mapped codes kept | 1 to 3, 1 to 3, 1 to 5 |
| `setting`, `scale`, `cost_band`, `time_to_implement`, `evidence_level` | One code each | closed lists |
| `origin_place_pl` | A place named in the source, verbatim, or null | must appear in `text_pl` |
| `requires_pl` | What an implementer needs | 1 to 6 items of at most 8 words |
| `keywords_pl` | Search terms, lowercase | 3 to 10 of at most 3 words |
| `evidence` | For the five judgement fields: `basis` (`quote`, `inference`, `unknown`) and `quote` | quotes of at most 20 words, found in the source |
| `confidence`, `notes_pl` | For the reviewer | notes at most 40 words |

The taxonomies of spec 8.2 apply with two additions under domains,
`samodzielnosc` (the spec's own example uses it) and `inne` (with a note
for the reviewer). `tax-v2` with prompt extract-v4 (decided by the user after the ROPS run of extract-v3) adds:

- the target group `spektrum-autyzmu`. Autism is not an intellectual
  disability, but the ROPS catalogue files five autism innovations under
  its category for intellectual disability, and the national-base pattern
  mapped "autyz" and "spektrum" there too. The pattern now maps them to
  `spektrum-autyzmu`, and the worker drops a mapped
  `niepelnosprawnosc-intelektualna` with a note when the text names only
  autism;
- the domains `zdrowie-fizyczne`, `kultura-sport-i-czas-wolny` and
  `prawa-i-sprawy-urzedowe`, fed by the national base's topics "Zdrowie
  fizyczne", "Kultura", "Sport i turystyka" and "sprawy prawne". Of the
  ROPS records of extract-v3, oncology, obesity, dance, mountain
  tourism, inheritance, consumer law and parental abduction had no
  domain;
- the wording rule: the adjective in "wózek inwalidzki" names an object
  and is allowed; the noun "inwalida" is still rejected. Six ROPS records
  of extract-v3 had lost the term people search for.

`tax-v3` (decided by the user on the coordinator's
evidence) changes the mapping rules only. The families pattern no longer
matches `rodzin` and `opiekun`, and the simple tag "Rodziny i opiekunowie
osób wymagających wsparcia" maps to no target group, because the
catalogue's "Rodzina i opiekunowie" branch names carers of seniors and of
adults with disabilities. Workers had dropped the mechanical code in 48 of
185 records with a reason, and the reviewed sample confirmed their
choices. Simulated on the 300 national records before the change: 38 of
the 47 drops disappear, the 9 that remain are students and children tags
where the worker judged adults, and no record becomes invalid. The closed
lists are unchanged, so the derived records of extract-v4 stay valid.

Analyst 1 may still merge or split domains,
which is then `tax-v4` and a rerun.

## 5. What the validator rejects and what it flags

`scripts/derive-records.py validate` returns errors (the record is
invalid and goes back to the queue) and warnings (kept, shown in the
review sample).

Errors: schema violations; an id that differs from the file name; a
fingerprint that differs from the source (status `stale`); an old prompt
version; a code outside the closed lists; a mapped target group or
implementer type dropped; a word limit exceeded; a quote that is not
found in `text_pl` (normalised, fuzzy ratio 0.8) or is over 20 words;
`unknown` without `basis: unknown` and the reverse; `in-regional-model`;
`selected-for-dissemination` without the source label or a quote with
"upowszechni"; `implemented-elsewhere` without a quote; an e-mail, phone
number or URL in the text; the name of a person from `persons_public` in
the text; an `origin_place_pl` that is not in the source.

Warnings: cost or time inferred; a wording from the dignity list
(`bezdomni`, `niepełnosprawni` used as nouns, `upośledzeni`, `patologia`
and the like, with the preferred phrase); an English fragment; the
domain `inne`; domains that share nothing with the topic hints; a
dissemination label ignored; confidence low; a keyword not lowercase.

## 6. The manifest and the run

`.local/pipeline/manifest.json` records per id: source, status (`valid`,
`invalid`, `stale`, `missing`), errors, warnings, model, date, prompt
version, fingerprint, time of validation. `status` recomputes it from the
files; the files are the truth, the manifest is the view.

The run is described in the skill
[.claude/skills/extract-innovations/SKILL.md](../.claude/skills/extract-innovations/SKILL.md):
a pilot of ten records checked by people, then batches of twelve to
fifteen records per worker, up to six workers at a time, validation after
every batch, at most two retries per record, then `build`, `sample` and
the human check of twenty records (the acceptance of FR-1.3).

Worker configuration (measured on the pilot with
`scripts/derive-compare.py`; the sets are under `.local/pipeline/compare/`):
Sonnet at the session's default reasoning effort with prompt extract-v3,
kept for extract-v4 (section 4).
Haiku produced five valid records of ten and invented places and quotes;
Bielik through the router produced nine of ten with repair rounds; Sonnet
produced ten of ten under every prompt. The prompt, not the effort, made
the difference: v2 and v3 removed every wording fault, corrected a wrong
catalogue category with a stated reason and added the anchoring quotes,
while maximum effort changed the counts within the run-to-run variance
of two identical runs and cost about four minutes per record. Workers
inherit the coordinator session's effort, so the coordinator runs at the
default. Measured pace of a Sonnet worker at default effort: about two
minutes and 17 000 tokens per record (ten records in 20 minutes with
171 000 tokens), against four minutes and 24 000 tokens at maximum
effort. The full run of 405 records is therefore about 2.5 hours with six
workers and about 7 million tokens on the subscription; run the ROPS
catalogue first (`batches --source rops`, 110 records, about 40 minutes)
and check the plan's usage before the national base. The same skill ingests a partner
hand-over on 3 October once the parser has an adapter for it (FR-1.6).

## 7. The built record (`data/innovations/<id>.json`)

The source record without `parsed_at`, plus `derived` (the derived record
without `id` and `source_fingerprint`), plus `status: "active"`, plus
`merged_from` and `source_fields_secondary` when a national-base entry
was merged into a ROPS entry (same normalised title and the same or an
unknown organisation, FR-1.4; pairs with the same title and different
organisations are listed in `duplicates.json` for a person to decide; the decision, keep both or
merge, is written by hand into `data/duplicates-decisions.json`, which is
committed and applied by every build, and the pair then appears under
`decided`).
`data/index-cards.json` holds one line per record for stage 1 of the
matching engine; `data/data-version.json` holds the data version
the app shows on "Jak to działa" (FR-1.7). When `.local/pipeline/link-check.json`
exists (`scripts/check-links.py`, spec 12.13), every material and link of a
built record carries `link_status` (`ok`, `dead` or `unknown`) and
`link_checked_at`.

## 8. Licences and display (FR-1.8, FR-1.9)

Every record carries its licence per source. The app renders from the
national base: title, organisation, codes, our own summaries, the
"Problem" and "Jak działa" passages of at most 60 words with attribution,
and links; it never copies software. ROPS items under CC BY 4.0 may be
shown in full with attribution, and so are the 15 `MIIS-agreement` items
(the app is built for ROPS, the licensor of these items, so no separate licence applies; the licence value is kept as provenance). The attribution line is fixed in
FR-1.8 and is followed by the prototype note of FR-1.8. No lawyer
confirms the reading in the hackathon (OP-09 closed).
