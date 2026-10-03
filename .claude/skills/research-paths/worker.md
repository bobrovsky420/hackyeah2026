# Research one legal or funding path

You check one path of `data/built/paths/` against its sources, or draft a
new one, and write a draft for a person to approve. You are a researcher,
not a lawyer: the draft keeps `reviewer: null` and the prototype note.

You get: the path id (or, for a new path, its name and any URL the user
gave), the run folder `.local/paths-research/<date>/` (`<run>` below) and
today's date.

You write only these files, nothing else in the repository:

- `<run>/<id>/sources/` (through `scripts/fetch-sources.py` only)
- `<run>/<id>/evidence.md`
- `<run>/drafts/<id>.yaml`

The run's report is built from your evidence by
`scripts/build-paths-report.py`; your final reply is five lines (step 5).
Do not write a summary or report file.

## Read first

- Section 8.7 of `docs/functional-specification.md` (the format and the
  selection rules) and the row of your path in the table of section 14.4,
  with the list "Not verified" below the table.
- `data/built/paths/<id>.yaml`, and two other path files for the style.
- `scripts/check-paths.py` and `scripts/check-evidence.py`: the closed
  lists and every rule the validators enforce.
- Section 11 of the specification, points 2 to 5, and the checklist in
  step 4 below.
- `<run>/hints.md`, if it exists: what other workers noticed about your
  path. A hint is a lead, never evidence: confirm it in your own copies
  or leave it out, and say which under "Not verified".

## 1. Save the sources

List the URLs: the file's `source_url`, the URLs of the 14.4 row, the act
named in `legal_basis_pl`, the programme document or the rules
(regulamin), the current or latest call notice (ogłoszenie) and the
body's news or "komunikaty" list for the last twelve months. Save them,
from the repository root, then write the index:

```
PYTHONPATH=<scratchpad>/pylib .venv/Scripts/python scripts/fetch-sources.py --into <run>/<id>/sources --path <id> [--follow] [--hosts h1,h2] <url> ...
PYTHONPATH=<scratchpad>/pylib .venv/Scripts/python scripts/fetch-sources.py --into <run>/<id>/sources --index
```

`--follow` also saves the documents a page links (rules, regulamin,
ogłoszenie, attachments without a file extension, documents on the file
hosts the script knows and on the hosts of `--hosts`). `--index` writes
`<run>/<id>/sources/index.md`: every copy with its title, its first date
and the lines that hold dates, amounts, calls, suspensions, extensions,
rules and eligibility lists. Read the index before the copies. Every call
window, suspension, extension, rule and eligibility list the index shows
ends up in the draft (`timing.calls`, `timing.note_pl`, `applicant_types`,
`amount_note_pl`, `notes_pl`) or in the evidence under "Not used" with its
reason (another body, another strand, superseded by a newer document).

A line of the script that starts with `THIN` names a copy that is not a
real copy (a bot check, a script shell, a PDF without a text layer): it
counts as a failed source. A `HINT` line names the better address the
script fetched as well (the ELI page for ISAP, the API record for a BIP
Małopolska article); use that copy. `--refresh` saves a URL again that the
folder already holds and keeps the old copy under a dated name.

Read the `.txt` beside each copy; in PDF text, words broken at a line end
carry a hyphen ("nastę-pujące") and spaces may be doubled, so search for a
short stem, not a whole phrase.

- **Acts:** read the law in force today. The Sejm ELI API
  (`https://api.sejm.gov.pl/eli/acts/DU/<year>/<pos>`, JSON) gives
  `status`, `inForce`, the amending acts under
  `references["Akty zmieniające"]` and the repealing acts under
  `references["Akty uchylające"]`. Save the act and every amendment that
  touches your provisions
  (`https://api.sejm.gov.pl/eli/acts/DU/<year>/<pos>/text.pdf`). The
  JSON gives an amending act one entry-into-force date, although parts
  may enter into force on other dates: quote the amendment's own article
  "Ustawa wchodzi w życie" for the provision you use. Its `texts` list may
  hold a file of type `U`, the Kancelaria Sejmu's unofficial consolidated
  text (`https://eli.gov.pl/api/acts/DU/<year>/<pos>/text/U/<fileName>`):
  save it to cross-check your reading, but quote the act and the
  amendments (P), not it (S). The act's ELI page
  (`https://eli.gov.pl/eli/DU/<year>/<pos>/ogl/pol`) is the
  `source_url` for an act: it links the text, the amendments and the
  consolidated text. ISAP answers scripts with a bot check.
- **Calls and programmes:** the announcing body's own page and its
  documents: the programme resolution or document, the rules, the call
  notice, the change notices, the results. A moved page: find the new one
  with WebSearch, on the body's own domain where possible, then save it
  with the script.
- **Primary (P)** is the act in Dziennik Ustaw or Monitor Polski, or the
  announcing body's own page or document. Everything else (news, another
  operator, an aggregator, a FAQ) is **secondary (S)**: it may explain a
  fact, never set an amount, a date, a condition or an applicant type.
- A search snippet, a summary of WebFetch or your own memory is never
  evidence. Only a saved copy is.

Alarms. Each one means: find the primary document before you write a
value, and say in the evidence what you found.

- The `source_url` or a 14.4 URL is a home page (no path). Name the
  programme page, the call page or the ELI page instead.
- The page that calls a call "open", "ciągły" or "trwa" is older than
  six months, or older than the latest item of the body's news list. Look
  there for a suspension, extension or closing (wstrzymanie, zawieszenie,
  przedłużenie, zamknięcie, wyczerpanie środków).
- The document names a body other than the subject of the path (see
  "Subject and issuer"): a notice of the powiat on the city's portal, a
  provider's recruitment of participants, another operator's call.
- The programme has several strands (ścieżka A and B, an edition for JST
  and one for organisations, priorities I to V): a document proves only
  the strand it names.
- A sentence of the live file says "spodziewany", "zwykle",
  "expected" or gives a future month: it is an estimate; drop it unless a
  copy states the date.

## Subject and issuer

The subject of the path is the body in `decision_maker_pl` and, when the
programme has strands, the strand of this path. Write it in the header of
the evidence (`Subject:`). For every copy, write the issuer: the body the
document itself names (its header, first sentence or signature), not the
site that hosts it, in the same words as `Subject:` when it is the same
body. A copy whose issuer is not the subject (a reprint of another body's
notice, a provider's page, a news site, another strand's call or rules)
may explain the context and gets the role `other-body` or S; it never sets
an amount, a window, a step, a condition, an applicant type or a target
group of this path. `scripts/check-evidence.py` rejects a row for these
fields that cites only such copies, unless one of its copies is an act,
an amendment or the programme document.

## Applicant types

`applicant_types` holds the closed codes jst, ngo, pes and mieszkancy
(`paths_applicant_type` in `data/curated/taxonomies.json`). Map the
eligible entities of the act or the rules with this table, and write four
rows `applicant_types:jst`, `applicant_types:ngo`, `applicant_types:pes`
and `applicant_types:mieszkancy` in the Facts table, each with the value
`yes` or `no` and the quote that admits or excludes the entity (for `no`
with nothing to quote, a note in parentheses). A code with no quote
either way is `no` and goes under "Not verified". This table is the only
mapping: a hint or the coordinator's prompt never overrides it.

| Entity in the source | Code | Note |
|---|---|---|
| jednostki samorządu terytorialnego; gminy, powiaty, województwa; their units (OPS, CUS, PCPR, urząd, placówka) | jst | |
| organizacje pozarządowe (art. 3 ust. 2 u.d.p.p.w.): stowarzyszenia, fundacje | ngo | |
| "podmioty wymienione w art. 3 ust. 3" (all of them: the usual formula of art. 11, 12, 13, 16a, 19a) or art. 3 ust. 3 pkt 3 (spółdzielnie socjalne) | ngo and pes | spółdzielnie socjalne are podmioty ekonomii społecznej, the taxonomy's firma-pes. Exception: art. 3 ust. 3a excludes spółdzielnie socjalne from art. 19b-41i (inicjatywa lokalna and the chapters after it): no pes there |
| przedsiębiorcy, firmy, podmioty ekonomii społecznej, przedsiębiorstwa społeczne, osoby fizyczne prowadzące działalność gospodarczą | pes | |
| art. 3 ust. 3 pkt 4 alone: spółki non-profit, kluby sportowe non-profit | pes | a modelling choice, not the act's words; say so under "Not verified" |
| art. 3 ust. 3 pkt 1 or 2 alone: kościelne osoby prawne, stowarzyszenia jednostek samorządu terytorialnego | no code | name them in `notes_pl`; never pes; a path open only to them goes to "Decisions for a person" |
| koła gospodyń wiejskich | no code | not art. 3 ust. 3 entities; name them in `notes_pl`; whether they get a code is open |
| mieszkańcy, osoby fizyczne, grupy nieformalne, sołectwo, zebranie wiejskie | mieszkancy | |
| organy administracji rządowej, SP ZOZ and other public health-care entities, uczelnie, instytuty badawcze | no code | name them in `notes_pl`; never pes, never jst |

## 2. Write the evidence

`<run>/<id>/evidence.md`, in exactly this layout; `scripts/check-evidence.py`
reads it and the run's report is built from it.

```
# Evidence: <id> (checked <YYYY-MM-DD>)

Status: <unchanged | changed | new | not verified>
Subject: <body of decision_maker_pl> | <strand, or: cała ścieżka>

## Copies

| Key | Copy | URL | Issuer | Date | Role | P/S |
|---|---|---|---|---|---|---|
| A | <run>/<id>/sources/<host>/<file> | <url> | <body the document names> | <YYYY-MM-DD or null> | <role> | P |

## Facts

| Field | Value | Quote | Copy | P/S |
|---|---|---|---|---|
| amount_max_pln | 20000 | "nie może przekraczać kwoty 20 000 zł" | C | P |

## Changes

| Field | Old value | New value | Kind | Quote | Copy | P/S |
|---|---|---|---|---|---|---|

## Not used
## Not verified
## Sources failed
## Contradictions
## Outside this path
## 14.4 row
```

Rules:

- Key: one or two capital letters. Copy: the copy file (not its `.txt`),
  from the repository root or relative to your `sources/` folder, and
  always inside it: a copy of another path's folder is not evidence; save
  it again into yours. Role: act, amendment, consolidated, programme,
  rules, call, change, results, page, news, api, other-body, cross-check.
- Field: the path of the value in the draft (`amount_max_pln`,
  `timing.calls[1].closes_on`, `steps_pl[2]`, `notes_pl`), one field per
  row. Every field of the draft needs at least one row, except `id`,
  `fit`, `reviewer`, null values and empty lists; every call needs a row
  for `closes_on` and, when not null, `opens_on`; `applicant_types` needs
  the four rows of "Applicant types"; `timing.kind`, `timing.note_pl`,
  `source_url` and `verified_on` need a row (`verified_on` with the
  quote `-`).
- Quote: verbatim from the copy's `.txt`, at most 40 words, line-break
  hyphens joined; several fragments separated by ` [...] `, each at least
  three words. A pipe inside a cell is written `\|`. A copy whose text is
  jumbled (a table PDF) gets `!` after its key (`E!`): the script skips
  its quotes and the checker reads them by eye. A note in parentheses
  instead of a quote is allowed only where no sentence can be quoted (an
  absence, a derived value); the script lists it as a warning.
- Changes: one row per field that differs from the live file (for a
  new path: every field), the old and the new value, Kind one of `error`
  (the old value contradicts a source that was already valid on the date
  of the live file), `outdated` (true then, changed since: an
  amendment, a new call, a new deadline), `imprecise` (a missing
  condition, a loose word, a wrong term), `added` (a fact the old file
  lacked), `unverifiable` (the old value has no source today), `derived`
  (fit fields that follow from other fields). When two kinds fit, take
  the first in this order: error, outdated, unverifiable, imprecise,
  added. `verified_on` needs no row. The script compares the draft with
  the live file and reports a changed field without a row.
- Not used: every call, window, rule or eligibility list that the index
  shows and the draft does not state, one line each with the reason.
- Not verified: the facts you could not verify, the hints you could not
  confirm, the modelling choices, and why `verified_on` keeps an old date,
  if it does.
- Sources failed: the URLs that failed or were thin, and what you used
  instead.
- Contradictions: between sources (P wins over S; a newer document over an
  older one; say which won).
- Outside this path: one line per finding about another path, the
  specification or the app, starting with the path id or the section
  (`- maly-grant-19a: ...`, `- spec 14.4: ...`, `- app: ...`). Nothing
  else about other paths anywhere.
- 14.4 row: the cells of the path's row that should change, in English,
  and for a new path its whole row. Write "none" under a heading that has
  nothing.

## 3. Write the draft

`<run>/drafts/<id>.yaml`. Start from a copy of the live file (for a
new path, from the most similar one) and change a value only when the
evidence differs or the old value has no evidence. Keep the old wording
where the fact is unchanged, so the diff shows only real changes.

- Layout of the existing files: the fields in their order, every string
  in double quotes, dates quoted as `"YYYY-MM-DD"`, lists in flow style
  (`[ngo, jst]`), no comments, the ASCII hyphen only (no en or em dash).
- `id`: never change the id of an existing path; the app and the test
  problems refer to it. A new id is lowercase ASCII words joined by
  hyphens, named after the path.
- Amounts: whole PLN or `null`. EUR amounts go into `amount_note_pl` with
  both amounts `null`, and `fit.cost_bands` is then set by hand.
- `timing.kind`, by these rules in this order, as of today:
  1. `rolling`: the act or the rules take applications at any time or
     until the money runs out, with no closing date; `calls` is empty. A
     closing date, even "do wyczerpania środków, nie dłużej niż do
     <date>", makes it `fixed`.
  2. `fixed`: a call that closes today or later is open or announced;
     `calls` holds it.
  3. `annual`: the yearly window is set by an act or by the programme
     document itself (the village fund's 30 September, the participatory
     budget's yearly vote) and the quote of the `timing.kind` row comes
     from that act or document. A programme that has merely run every
     year so far is not `annual`: the app rolls the latest call forward a
     year and shows a date no source gives.
  4. `per-call`: each operator, voivode or round announces its own window
     and at least one current or next call is known; otherwise `closed`.
  5. `closed`: calls are known, none open or announced. `timing.note_pl`
     gives the rhythm and the last window ("Nabory ogłaszano w
     październiku 2024 i 2025 r.; naboru na 2027 r. nie ogłoszono."),
     never an expected month.

  These rules hold until the product decides whether the app may roll an
  annual call forward (a decision of an earlier run's report). A date the
  sources do not give is `null`; never estimate a date or an amount.
- `steps_pl`: three imperative sentences in the second person singular,
  at most 12 words, no parentheses, each ending with a full stop.
- Polish: plain sentences, legal terms as the act names them, full names
  on first use ("ośrodek pomocy społecznej").
- `verified_on`: today, when the legal basis, the amounts and the timing
  were read in copies saved today; otherwise keep the old date and say
  why under "Not verified".
- `reviewer: null`. `notes_pl` opens with the prototype note and "Sprawdź
  u źródła." exactly as in the other files, then names what is not
  verified, what rests only on S, and what changed recently (for example
  an office that still publishes an old limit), as facts for the user,
  not as remarks about the sources.

## 4. Validate

```
.venv/Scripts/python scripts/check-paths.py --dir <run>/drafts
.venv/Scripts/python scripts/check-evidence.py --run <run> <id>
```

Fix every error line of your path (lines of other paths are not yours).
A warning you keep on purpose (an approximate pool written "około 73 mln
zł", a note instead of a quote) gets one line under "Not verified" saying
why. At most three rounds; then report what is left.

Then read the Polish of the draft once against this list (spec 11,
points 2 to 5):

- the steps in the second person singular;
- "gmina", "powiat", "województwo" or "jednostka samorządu
  terytorialnego", never "samorząd" alone;
- "organizacja pozarządowa", never "NGO" (except in a proper name such as
  "NGO Generator");
- amounts "20 000 zł", dates "30 września 2026 r.", ranges "10 000 do
  100 000 zł", percentages "12,5 %";
- the act's own term: "wniosek" in art. 12, "oferta" in art. 14 and 19a,
  "zadanie" where a regulation says "zadanie", "dotacja" rather than
  "grant" unless the rules say "grant";
- no sentence about the sources, this research or the app's model in
  `notes_pl`, `amount_note_pl` or `timing.note_pl` ("ogłoszenie nie
  podaje ..."): they belong in the evidence; say to the user what is not
  known ("Limitu na jedną ofertę nie ustalono.");
- no parentheses in steps, no English word where a Polish one exists.

## 5. Final reply

Your final reply is these five lines and nothing else:

```
<id>: <status>
changes: error <n>, outdated <n>, imprecise <n>, added <n>, unverifiable <n>
selection: <selection fields that changed, or none>
open: <points a person must decide, or none>
outside: <n> lines under "Outside this path"
```
