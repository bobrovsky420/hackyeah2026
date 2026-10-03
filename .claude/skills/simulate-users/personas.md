# Personas: how to write requests.yaml

A persona is one fictional person who opens HubMI.pl, describes a need
in Polish and does something with the route. The set as a whole should
look like a morning of real traffic: mostly ordinary needs, a few unclear
or thin ones, and rarely something the gate must stop.

## The file

`.local/simulation/<run>/requests.yaml`:

```yaml
run: sim-2026-10-03-a
personas:
  - id: D01
    description_pl: Pracowniczka PCPR, przygotowuje usamodzielnienie wychowanków
    role: pracownik-instytucji
    place_query: Tarnów
    expected_terc: "1263011"
    intent: route
    text_pl: >
      Pracuję w powiatowym centrum pomocy rodzinie. Co roku kilkanaście
      osób kończy 18 lat i wychodzi z rodzin zastępczych...
    behaviour:
      think_s: [2, 5]
      dwell_s: [6, 15]
      open_solutions: 2
      feedback: tak
      download: true
```

| Field | Values |
|---|---|
| `id` | `D01`, `D02`... unique in the run |
| `description_pl` | who this is, one line; for the analysis, never sent to the app |
| `role` | `pracownik-instytucji`, `urzad-gminy`, `organizacja-spoleczna`, `mieszkaniec`, or `null` (the reader skips the question) |
| `place_query` | what the person types into "Miejscowość lub gmina": the gmina's name, or a village's name for some; `null` for no place |
| `expected_terc` | the TERC of the gmina the first suggestion should be, from `data/built/places/pl-register.json` (`level: gmina`); `null` with no place |
| `intent` | the mode the text is written to reach: `route`, `partial`, `none`, `clarification`, `redirected`, `declined`, `off_topic` |
| `text_pl` | 20 to 2000 characters, the need in the person's own words |
| `behaviour.think_s`, `dwell_s` | seconds, `[low, high]`: before typing and clicking, and on each page read |
| `behaviour.open_solutions` | how many solution cards to open (0 to 3) |
| `behaviour.clarify_group` | a target group code to answer the clarification question with (only for `clarification`) |
| `behaviour.feedback` | `tak`, `czesciowo`, `nie` or `null` |
| `behaviour.download`, `recompute`, `save_need`, `open_map` | `true` or `false` |

Target group codes: `seniorzy`, `dzieci-mlodziez-rodziny`,
`ograniczona-mobilnosc`, `niepelnosprawnosc-sensoryczna`, `zdrowie`,
`rynek-pracy`, `cudzoziemcy`, `bezdomnosc`,
`niepelnosprawnosc-intelektualna`, `spektrum-autyzmu`, `inne`.

## The mix

For ten personas, unless the user asks for another theme:

- six `route`: different target groups, at least three outside
  `seniorzy`; check the catalogue has two or three records whose
  `derived.problem_pl` fits the text (`data/built/innovations/*.json`),
  so the route can be found;
- one `partial` or `none`: a real need the catalogue covers only in part
  or not at all (transport, a local disaster, housing costs);
- one `clarification`: a vague text with no place and no group
  ("Chcę pomóc, ale nie wiem komu"), with `clarify_group` set;
- one with `role: null` and `place_query: null`: a hurried reader;
- at most one of `redirected`, `declined` or `off_topic` per run, and
  only when the user asks for safety cases. A crisis text names no method
  and stays short.

Roles: about half `pracownik-instytucji` and `urzad-gminy`, the rest
`organizacja-spoleczna` and `mieszkaniec`. Places: Małopolska only
(TERC starting with `12`), rural and urban, at least three powiats, not
all Kraków; one person may type a village instead of the gmina (the
picker resolves it, the runner records the gmina it got).

Avoid the topics of `tests/problems/` (lonely rural seniors, hospital
discharge, pupils after psychiatry, deaf parents and the library, rural
women and work, autism at the dentist, homeless men, dialysis transport,
floods, carers of dementia, foreigners at the office) unless the user
asks for them; the point is new traffic.

## The texts

Write as these people write, not as a specification:

- An official at a gmina or an institution writes full sentences, names
  numbers ("kilkanaście rodzin", "trzy razy w tygodniu") and what they
  have (a free room, a van, a volunteer group).
- A resident writes shorter, warmer and less exact; one or two may skip
  the Polish letters ("sasiad", "wozek") or make a small typo.
- An NGO writes about its members and what it already does.
- Lengths vary: two or three texts of one or two sentences, most of four
  to six, one long one (about 800 characters).
- People are described with respect (principle E1), even when the writer
  is tired or angry; the app must cope with everyday words, but the run
  is no place to test slurs.
- No real names, phones, e-mails or addresses. One text in a run may
  carry an obviously fictional phone number, such as `600 000 000`, to
  show the redaction in the log; say so in its `description_pl`.

## The behaviour

Make the visits differ, as real ones do:

- most open one or two solutions and stay 5 to 20 s on each;
- some vote (`tak` for a good fit, `czesciowo` or `nie` where the route
  will likely be thin), two or three download;
- a `none` or `partial` persona may `save_need` (it saves a need in the
  run's own store; the gate screens it, which costs one model call);
- `recompute` at most once per run: it reruns the whole pipeline;
- one or two `open_map`, only while the map is on (`MAP_ENABLED` in
  `src/lib/features.ts`); while it is off the runner records
  `map:unavailable`;
- a hurried reader: `think_s: [1, 2]`, `dwell_s: [2, 4]`, opens nothing.
