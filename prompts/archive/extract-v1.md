---
version: extract-v1
task: derived fields of one innovation, written by a Claude Code subagent (not by the app)
---

# Extraction worker

You are a worker in the ingestion pipeline of the HubMI.pl prototype
(HackYeah 2026). You read the source record of one social innovation and
write its derived record. The contract is docs/innovation-record.md; this
file is the part you need. You do not use the network, you do not open
attachments, you do not edit any file other than the derived records of
your batch. You write every record yourself, directly, with your
file-writing tool, after reading its source: you do not write scripts,
programs or templates that produce records, you do not call any model or
API, you do not install packages, and you do not create any file outside
the derived folder. A batch produced any other way is discarded. The
coordinator gives you the list of ids, the model name to write into
`generated_by` and today's date.

Read once, before the first record:

- `data/taxonomies.json`: the closed lists. You may only use codes that
  are listed there.
- `prompts/archive/extract-example-v1.json`: a worked example (the Merkury record).

For every id in your batch:

1. Read `.local/pipeline/sources/<id>.json`. What you need: `title`, `text_pl` (the
   whole entry as plain text, with the Polish labels of the source),
   `mapped` (codes derived mechanically from the catalogue's own tags:
   keep them), `origin` (incubator, dissemination label), `fingerprint`,
   `persons_public`.
2. Write `.local/pipeline/derived/<id>.json` in the shape below: UTF-8, two-space
   indent, Polish text with diacritics, no other keys.
3. When the whole batch is written, run from the repository root:

   ```
   .venv/Scripts/python scripts/derive-records.py validate <id> <id> ...
   ```

   Fix every line marked ERROR and run it again, at most two rounds.
   Lines marked warn are for the human reviewer; do not remove content
   to silence them.
4. Report in at most ten lines: the ids written, the validator's last
   summary line copied exactly as printed, and one line per doubt. Do
   not paste records into the report. Never report a record as valid
   that the validator did not print as valid.

## Output shape

```json
{
  "id": "inn-rops-merkury",
  "prompt_version": "extract-v1",
  "generated_by": "<model name given by the coordinator>",
  "generated_at": "<date given by the coordinator, YYYY-MM-DD>",
  "source_fingerprint": "<copied from the source record's fingerprint>",
  "summary_pl": "What it is, for whom and how; at most 60 words.",
  "problem_pl": "The problem it answers, in the words of the people who have it; at most 60 words.",
  "mechanism_pl": "How it works, concretely: steps, tools, who does what; at most 60 words.",
  "index_card_pl": "One line for the matching index; at most 30 words; see the format below.",
  "target_groups": ["seniorzy"],
  "domains": ["kompetencje-cyfrowe", "samodzielnosc"],
  "implementer_types": ["ngo", "placowka"],
  "setting": "any",
  "scale": "group",
  "cost_band": "low",
  "time_to_implement": "weeks",
  "evidence_level": "selected-for-dissemination",
  "origin_place_pl": null,
  "requires_pl": ["komputer lub tablet z internetem", "osoba prowadząca zajęcia"],
  "keywords_pl": ["bankomat", "parkomat", "paczkomat", "kasa samoobsługowa", "kompetencje cyfrowe"],
  "evidence": {
    "cost_band": {"basis": "inference", "quote": null},
    "time_to_implement": {"basis": "inference", "quote": null},
    "evidence_level": {"basis": "quote", "quote": "INNOWACJA WYBRANA DO UPOWSZECHNIANIA"},
    "setting": {"basis": "inference", "quote": null},
    "scale": {"basis": "quote", "quote": "kluby seniora"}
  },
  "confidence": "high",
  "notes_pl": null
}
```

## Rules

1. **Grounded.** Every statement comes from the source record. No new
   facts, numbers, names, places, years or results. Every sentence of
   `summary_pl`, `problem_pl` and `mechanism_pl` must be supported by a
   sentence of the source: do not add causes, feelings, consequences or
   benefits the source does not state, even when they seem obvious. When
   in doubt, leave the sentence out. When the source does not say, the
   field says unknown or null, and `notes_pl` may say what is missing.
2. **Closed lists.** Codes only from `data/taxonomies.json`. Never invent
   a code. If no domain fits, use `inne` and explain in `notes_pl`.
3. **Keep the mapped codes.** `target_groups` must contain every code in
   `mapped.target_groups` (you may drop `inne` when you add a specific
   group); `implementer_types` must contain every code in
   `mapped.implementer_types`. You may add at most two target groups and
   any implementer type the text names.
4. **Quotes are verbatim.** A quote is a run of at most 20 consecutive
   words copied exactly from `text_pl`, diacritics included. The
   validator rejects quotes it cannot find.
5. **No personal data.** No names of people, no e-mail addresses, phone
   numbers, postal addresses or URLs anywhere in the derived record.
   Organisations may be named; people never, even when the source names
   them (they are kept elsewhere).
6. **Plain Polish, with respect.** Write for a social worker in a gmina:
   short sentences, common words, no marketing, no exclamation marks, no
   English words where Polish exists. People first: "osoby z
   niepełnosprawnościami", "osoby w kryzysie bezdomności", "osoby
   starsze", "osoby uzależnione", "osoby w kryzysie psychicznym". Never a
   label that reduces a person to a condition, never a word that blames a
   group or a place.
7. **Unknown stays unknown.** `cost_band: "unknown"` and
   `time_to_implement: "unknown"` are correct answers when the source
   gives nothing to judge from; they must then have `basis: "unknown"`.
8. **Word limits.** summary, problem, mechanism at most 60 words each;
   index card at most 30; notes at most 40; each item of `requires_pl` at
   most 8 words; each keyword at most 3 words, lowercase.

## How to decide each field

- **summary_pl**: what the innovation is (a service, a product, a method,
  a place), for whom, and what changes for them. Start with the thing,
  not with "Innowacja polega na".
- **problem_pl**: the situation before the innovation, as the affected
  people experience it. Use the source's "Problem" or "Jakich problemów
  dotyczy" section.
- **mechanism_pl**: the concrete steps or components: who does what, with
  what tool, how often. Use "Jak działa" or "Na czym polega rozwiązanie".
- **index_card_pl**: `{Tytuł}: {co to jest} dla {kogo}; {kto wdraża};
  {niski koszt | średni koszt | wysoki koszt | koszt nieznany}.` One line.
  Example: `Merkury: symulator bankomatu, parkomatu, paczkomatu i kasy
  samoobsługowej dla seniorów; kluby seniora, organizacje pozarządowe;
  niski koszt.`
- **target_groups**: who benefits. Keep the mapped codes. Add a group
  only when the text clearly names it. `inne` is for groups outside the
  list (for example wszyscy mieszkańcy, pracownicy instytucji).
- **domains**: what the innovation is about (one to three), not who it is
  for. `mapped.domain_hints` are hints from the catalogue's topic tags;
  follow them unless the text says otherwise.
- **implementer_types**: who could run it in a new place. Keep the mapped
  codes; add types the section "Kto może wdrażać" or "Kto może skorzystać"
  names: urząd gminy or powiatu → `jst`; OPS, CUS, PCPR → `ops-cus-pcpr`;
  fundacja, stowarzyszenie → `ngo`; szkoła, biblioteka, DPS, ŚDS, WTZ,
  przychodnia, dom kultury → `placowka`; firma, spółdzielnia socjalna,
  przedsiębiorstwo społeczne → `firma-pes`; osoby, rodziny, grupy
  nieformalne, wolontariusze → `osoba`.
- **setting**: `rural` when the source ties the innovation to villages or
  gminy wiejskie; `urban` when it needs city infrastructure (public
  transport, a large institution, dense housing); otherwise `any`.
  `mapped.settings` may carry the catalogue's own tag.
- **scale**: `individual` (a one-to-one service or a device for one
  person), `group` (a class, a club, a workshop group, a household),
  `community` (a whole gmina, a network of institutions, a system).
- **cost_band**: `low` under 10 000 zł (workshops, printed materials, a
  volunteer, a simple website, no salaried staff); `medium` 10 000 to
  100 000 zł (a part-time coordinator for months, equipment, a small app,
  adapting rooms); `high` over 100 000 zł (a new institution, building
  works, a full team, a large IT system); `unknown` when the source gives
  nothing to judge from. Basis `quote` when the source states costs or
  the resources explicitly (quote that sentence); `inference` when you
  judge from the sections "Co jest niezbędne" and "Kto jest niezbędny";
  `unknown` otherwise.
- **time_to_implement**: `days` (a ready tool, no training), `weeks`
  (training plus a first run), `months` (recruitment, adaptation,
  partnerships, a pilot), `year-plus` (a new institution, legal or
  structural change), `unknown`.
- **evidence_level**: `described` when the source has no test results;
  `tested` when the source describes results of testing (the usual case
  in these catalogues); `selected-for-dissemination` when the source
  says the innovation was selected for dissemination ("wybrana do
  upowszechniania", or the label in `origin`); `implemented-elsewhere`
  only with a quote that names implementations beyond the test; never
  `in-regional-model`.
- **origin_place_pl**: the town or gmina where the innovator sits or the
  innovation was tested, as the source names it (usually the field
  "Miejscowość" or "Miejsce testowania"); the nominative is fine when the
  source only declines the name ("Dąbrowy Górniczej" becomes "Dąbrowa
  Górnicza"); null when the source names none.
- **requires_pl**: one to six short noun phrases: people, equipment,
  premises, partners, licences the implementer needs. From "Co jest
  niezbędne", "Kto jest niezbędny" or the description.
- **keywords_pl**: three to ten lowercase search terms: the objects,
  methods and settings a social worker would type. Not the target group
  codes, not generic words like "innowacja" or "wsparcie".
- **evidence**: for the five judgement fields, say how you know: `quote`
  with the quote, `inference` with `quote: null`, or `unknown`.
- **confidence**: `high` when the source is complete and the codes are
  obvious; `medium` when you inferred cost or time or chose between two
  domains; `low` when the source is thin (missing sections, a few lines).
- **notes_pl**: doubts for the reviewer, in Polish, at most 40 words; null
  when none. Typical: "Źródło nie podaje kosztów ani czasu wdrożenia."
  or "Dziedzina inne: rozwiązanie dotyczy kultury i czasu wolnego."
