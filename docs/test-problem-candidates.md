**Szkic pomocniczy przygotowany przez asystenta AI; nie jest zestawem testowym. Właściwe problemy pisze prawniczka lub prawnik w tests/problems/ (13.1).**

# Test problem candidates

A working sheet for the lawyer, who writes the ten test problems of
specification 13.1 in their own words. Nothing here is a test problem: an
AI assistant wrote these texts, and the model must not be tested against
its own writing. Use the sheet to see where the catalogue can carry a
route, which records a need can reach, and which paths the rules of 8.7
would pick; then write the YAML files yourself.

Data: the built catalogue (381 records: 266 from the national base, 115 from
the ROPS library), `data/curated/implementations.yaml` (24 seeded
implementations) and `data/built/implementations-derived.json` (104 places of
origin).

## 1. Catalogue coverage by target group

Per target-group code of `data/curated/taxonomies.json`: the built records whose
`derived.target_groups` contains the code (a record can carry several
codes, so the rows add up to more than 381), split by `derived.setting`,
and the records with at least one implementation in Małopolska (a TERC
starting with `12`, or a voivodeship-wide regional model in
`implementations.yaml`).

| Target group | Records | rural | urban | any | ROPS records | With an implementation in Małopolska |
|---|---:|---:|---:|---:|---:|---:|
| seniorzy | 103 | 5 | 8 | 90 | 26 | 12 |
| dzieci-mlodziez-rodziny | 157 | 4 | 6 | 147 | 32 | 5 |
| ograniczona-mobilnosc | 56 | 1 | 6 | 49 | 29 | 2 |
| niepelnosprawnosc-sensoryczna | 46 | 0 | 6 | 40 | 24 | 5 |
| zdrowie | 40 | 2 | 1 | 37 | 15 | 4 |
| rynek-pracy | 65 | 3 | 1 | 61 | 6 | 2 |
| cudzoziemcy | 15 | 0 | 0 | 15 | 8 | 0 |
| bezdomnosc | 8 | 1 | 0 | 7 | 3 | 0 |
| niepelnosprawnosc-intelektualna | 42 | 0 | 4 | 38 | 17 | 2 |
| spektrum-autyzmu | 21 | 0 | 1 | 20 | 10 | 1 |
| inne | 30 | 0 | 3 | 27 | 2 | 1 |

What this means for the ten problems:

- Only 11 records are marked rural and 24 urban; 346 are `any`. A rural
  or urban case therefore rests mostly on the place and the text, not on
  the setting field. The rural records that exist are strong anchors:
  seniors (`inn-rops-mobilne-centrum-pomocy-dla-osob-starszych`,
  `inn-rops-centrum-antydepresyjne`), the labour market for rural women
  (`inn-rops-mobilna-gielda-pracy`), homelessness
  (`inn-rops-wiejski-program-pomocy-osobom-w-kryzysie-bezdomnosci-sciezka-feniksa`)
  and families in crisis (`inn-rops-mobilna-pomoc-terapeutyczna`).
- 23 innovations have an implementation in Małopolska: 9 from the
  "Usługa wrażliwa" grants, 9 regional models of ROPS, 9 places of origin
  (some overlap). Seniors carry 12 of them; cudzoziemcy and bezdomnosc
  have none, so a route there can show no implementer nearby.
- Thin groups: bezdomnosc (8 records) and cudzoziemcy (15). They can
  carry one route each, but not a fairness pair at "comparable coverage"
  (F01c compares cudzoziemcy with seniorzy, 15 against 103 records).
- A route with a nearby implementer (people role `implementer_nearby`)
  is realistic in: Kraków (himalaje-autyzmu, straznik,
  rodzina-adopcyjna-dorasta, komix-zyciowy), around Nowy Sącz
  (bez-presji-z-depresji in Kamionka Wielka), Limanowa and Nowy Targ
  (gluchy-czytelnik-w-bibliotece), the north of the voivodeship
  (Miechów, Charsznica, Pałecznica, Proszowice: places of origin of four
  rural ROPS innovations) and the four planned bathroom sites (Kłaj,
  Bystra-Sidzina, Podegrodzie, Liszki).

## 2. The twelve candidates at a glance

Composition of 13.1: C01 to C07 are the seven route cases (seven target
groups; rural C01, C05, C07; urban C02, C03, C04, C06), C08 the partial
case, C09 the none case, C10 the clarification case. C11 and C12 are
spare route cases, for a group the lawyer prefers or for a route case
that fails the calibration.

| Cand. | Working title | Role | Place (TERC) | Main target group | Mode | Retrieval rank of the expected innovations (of 381) |
|---|---|---|---|---|---|---|
| C01 | Samotni seniorzy w przygnębieniu na wsi | pracownik-instytucji | Radziemice (1214062), rural | seniorzy | route | mobilne-centrum 1, centrum-antydepresyjne 3, senior-cuder 28 |
| C02 | Samotni seniorzy po wypisie ze szpitala | pracownik-instytucji | Tarnów (1263011), urban | zdrowie, seniorzy | route | organizator-kompleksowej-opieki 1, 844 7, terapeuta-przestrzeni 10 |
| C03 | Uczniowie wracający po leczeniu psychiatrycznym | pracownik-instytucji | Nowy Sącz (1262011), urban | dzieci-mlodziez-rodziny | route | bez-presji-z-depresji 1, eduwaznosc 9 |
| C04 | Biblioteka, do której nie przychodzą rodziny g/Głuchych | pracownik-instytucji | Zakopane (1217011), urban | niepelnosprawnosc-sensoryczna | route | gluchy-czytelnik (ROPS) 1, gluchy-czytelnik (national) 2 |
| C05 | Kobiety ze wsi chcą wrócić do pracy | urzad-gminy | Gołcza (1208022), rural | rynek-pracy | route | mobilna-gielda-pracy 1, wiory-leca 2, zagraj-o-przyszlosc 15 |
| C06 | Dzieci z autyzmem u lekarza i dentysty | organizacja-spoleczna | Kraków (1261011), urban | spektrum-autyzmu | route | stomatologia-bez-barier 1, himalaje-autyzmu 2 |
| C07 | Bezdomni mężczyźni w gminie wiejskiej | urzad-gminy | Łukowica (1207082), rural | bezdomnosc | route | sciezka-feniksa 1, szlakiem-ludzi-bezdomnych 2 |
| C08 | Dojazd seniorów na dializy i rehabilitację | mieszkaniec | Uście Gorlickie (1205102), rural | seniorzy | partial | mobilne-centrum 1, aplikobus 3, rowerowe-riksze 8, lokalna-siec-samopomocy 11 |
| C09 | Rodziny po podtopieniach, pomoc się rozpadła | urzad-gminy | Zakliczyn (1216143), rural | inne | none | no fitting record; best cosine 0.335 |
| C10 | Chcę pomóc, ale nie wiem komu | mieszkaniec | none | none | clarification | not applicable; best cosine 0.336 |
| C11 (spare) | Dzieci z Ukrainy w świetlicy | organizacja-spoleczna | Bochnia (1201011), urban | cudzoziemcy | route | moj-pomocny-virtual-world 1, romski-w-obrazkach 11 |
| C12 (spare) | Mieszkania bez łazienki | urzad-gminy | Nowy Targ (1211011), urban | inne | route | plusk 1, przenosne-modularne-lazienki 2 |

No candidate is flagged: every expected innovation ranks within the top
40 of the retriever (details in section 4).

## 3. The candidates

Each sketch is written as a person in that role might write it, in lay
words and without the catalogue's titles or keywords. Rewrite it in your
own words before it goes into `tests/problems/`. Paths follow the rules
of 8.7 (applicant type from the role, then the target group, deadlines
and the regional bonus, and a non-monetary vehicle for `jst` when the best
solution is a service model) with the facts of 14.4; `data/built/paths/` is not
built yet, so the choice was made by hand.

### C01 Samotni seniorzy w przygnębieniu na wsi (route, rural)

- Role and place: pracownik-instytucji (ośrodek pomocy społecznej);
  Radziemice, TERC `1214062`, gmina wiejska, powiat proszowicki.
- Sketch: "Pracuję w ośrodku pomocy społecznej w małej gminie. W naszych
  wioskach mieszka sporo starszych ludzi, którzy zostali sami, bo dzieci
  wyjechały do miasta albo za granicę. Coraz częściej widzimy, że nie
  wychodzą z domu, przestają jeść i płaczą przy naszych wizytach, a do
  najbliższego psychologa jest ponad godzina drogi."
- Expected innovations:
  - `inn-rops-mobilne-centrum-pomocy-dla-osob-starszych`: `derived.problem_pl`
    names older people in the countryside who withdraw, feel low and
    lonely; `derived.mechanism_pl` brings the service to the senior's
    home; `derived.setting` rural. Place of origin Pałecznica, 7 km.
  - `inn-rops-centrum-antydepresyjne`: `derived.problem_pl` names lonely
    rural seniors at risk of depression with low access to help;
    `derived.mechanism_pl` works in the home. Place of origin Miechów,
    15 km.
  - `inn-rops-senior-cuder` (weaker, rank 28): `derived.problem_pl`
    names loneliness and weak resistance to hard emotions; a low-cost
    card game, a regional model of ROPS.
- Target groups: seniorzy. Mode: route.
- Paths (applicant `jst`): `korpus-wsparcia-seniorow` (gminy, names
  seniors; 2027 edition expected January to February 2027),
  `cus-program-uslug` (the non-monetary vehicle for a service model),
  `usluga-wrazliwa-b` (ROPS advice; both innovations are regional models).
  `asy-priorytet-v` only if the text asks for a club or a day centre.
- People roles: advisor, implementer_nearby.

### C02 Samotni seniorzy po wypisie ze szpitala (route, urban)

- Role and place: pracownik-instytucji (MOPS); Tarnów, TERC `1263011`,
  miasto na prawach powiatu.
- Sketch: "W MOPS-ie co tydzień odbieramy telefony ze szpitala, że
  wypisują do domu starszą, schorowaną osobę, która mieszka sama. Rodzina
  jest daleko, opiekunka może zacząć przychodzić dopiero za kilka
  tygodni, a w mieszkaniu jest wysoki próg do wanny i nie ma się czego
  złapać. Część tych ludzi po miesiącu wraca do szpitala w gorszym
  stanie."
- Expected innovations:
  - `inn-rops-organizator-kompleksowej-opieki-w-miejscu-zamieszkania`:
    `derived.mechanism_pl` organises urgent help for a dependent person
    after leaving hospital, at home; `derived.target_groups` seniorzy and
    zdrowie. Planned in Wieliczka (65 km) and a regional model.
  - `inn-rops-terapeuta-przestrzeni`: `derived.mechanism_pl` adapts the
    flat (removing thresholds, changing furniture); regional model,
    planned in Spytkowice.
  - `inn-nat-844` (Aranżacja przestrzeni domowej dla seniorów):
    `derived.problem_pl` names architectural barriers at home and
    unprepared carers.
- Target groups: zdrowie, seniorzy. Mode: route.
- Paths (`jst`): `cus-program-uslug`, `korpus-wsparcia-seniorow`
  (module II, remote care), `usluga-wrazliwa-b`. `opieka-wytchnieniowa`
  fits only if the text speaks of the family carers.
- People roles: advisor (no implementer within 50 km).

### C03 Uczniowie wracający po leczeniu psychiatrycznym (route, urban)

- Role and place: pracownik-instytucji (pedagożka w liceum); Nowy Sącz,
  TERC `1262011`, miasto na prawach powiatu.
- Sketch: "Jestem pedagożką w liceum. W tym roku kilkoro uczniów wróciło
  do nas po kilku tygodniach leczenia na oddziale psychiatrycznym i nie
  bardzo wiemy, jak ich przyjąć. Koledzy plotkują, nauczyciele albo
  udają, że nic się nie stało, albo za bardzo ich oszczędzają, a rodzice
  pytają nas, co mają robić."
- Expected innovations:
  - `inn-rops-bez-presji-z-depresji`: `derived.problem_pl` names children
    and young people returning after psychiatric treatment;
    `derived.mechanism_pl` supports the child, the family, the teachers
    and the class. Running in Kamionka Wielka (10 km), "Usługa wrażliwa"
    round I.
  - `inn-nat-eduwaznosc` (weaker): `derived.index_card_pl` describes
    mindfulness lessons for young people, school staff and parents.
- Target groups: dzieci-mlodziez-rodziny (zdrowie as the second). Mode:
  route.
- Paths (`jst`, the school belongs to the city): `usluga-wrazliwa-b`,
  `cus-program-uslug`. The cost band is low and the materials are
  CC BY 4.0, so a path is secondary here.
- People roles: advisor, implementer_nearby.
- Note: the screening may raise the crisis banner (8.10) on this text;
  that is correct and not a decline. The case stays apart from S01
  (suicide attempts), which belongs to the sensitive set.

### C04 Biblioteka, do której nie przychodzą rodziny g/Głuchych (route, urban)

- Role and place: pracownik-instytucji (biblioteka miejska); Zakopane,
  TERC `1217011`, gmina miejska.
- Sketch: "Prowadzę dział dla dzieci w bibliotece miejskiej. Wiemy, że w
  mieście mieszka kilka rodzin, w których rodzice nie słyszą, ale oni do
  nas w ogóle nie przychodzą. Nikt z nas nie zna języka migowego, na
  zajęciach czytamy dzieciom na głos, a wszystkie nasze ogłoszenia są
  tylko napisane."
- Expected innovations:
  - `inn-rops-gluchy-czytelnik-w-bibliotece`: `derived.problem_pl` says
    g/Głusi people are not part of the library's readers;
    `derived.mechanism_pl` a publication in PJM and easy Polish for the
    Deaf parent or child. Running in Nowy Targ (about 25 km) and
    Limanowa.
  - `inn-nat-gluchy-czytelnik-w-bibliotece-przewodnik-w-pjm`:
    `derived.problem_pl` limited access of people with hearing loss to
    libraries; a guide in PJM. Probably a near duplicate of the first;
    the lawyer may list both in `any_of_innovations`.
- Target groups: niepelnosprawnosc-sensoryczna. Mode: route.
- Paths (`jst`): `usluga-wrazliwa-b`, `pfron-dostepna-przestrzen` (no 2026
  call found), `cus-program-uslug`.
- People roles: advisor, implementer_nearby.

### C05 Kobiety ze wsi chcą wrócić do pracy (route, rural)

- Role and place: urzad-gminy; Gołcza, TERC `1208022`, gmina wiejska,
  powiat miechowski.
- Sketch: "W naszej gminie jest dużo kobiet po czterdziestce, które
  wychowały dzieci albo pracowały w gospodarstwie i teraz chciałyby pójść
  do pracy. Do urzędu pracy w mieście jest daleko, autobus jeździ dwa
  razy dziennie, a one same mówią, że nie wiedzą, od czego zacząć i czy
  ktoś je jeszcze zatrudni."
- Expected innovations:
  - `inn-rops-mobilna-gielda-pracy`: `derived.problem_pl` names rural
    women's difficult access to the labour market; `derived.mechanism_pl`
    brings job events close to home in the gmina's own rooms;
    `derived.setting` rural. Place of origin Charsznica, 9 km.
  - `inn-nat-wiory-leca`: `derived.problem_pl` women from small places
    who need a change of occupation.
  - `inn-nat-zagraj-o-przyszlosc-3` (weaker, rank 15): `derived.setting`
    rural; career planning for adults 40+ (`derived.index_card_pl`).
- Target groups: rynek-pracy. Mode: route.
- Paths (`jst`): `cus-program-uslug` (the CUS act covers counteracting
  unemployment), `esf-social-innovation-plus` (only as a partner;
  deadline 15 October 2026). `konkursy-marszalka` if a local NGO applies.
- People roles: advisor, implementer_nearby.

### C06 Dzieci z autyzmem u lekarza i dentysty (route, urban)

- Role and place: organizacja-spoleczna (stowarzyszenie rodziców);
  Kraków, TERC `1261011`.
- Sketch: "Jesteśmy stowarzyszeniem rodziców dzieci z autyzmem. Każda
  wizyta u lekarza albo dentysty to dla nas koszmar: dziecko krzyczy już
  w poczekalni, nie da się go zbadać, a personel nie wie, jak się
  zachować, więc często wychodzimy bez pomocy. Niektóre rodziny latami
  odkładają leczenie zębów."
- Expected innovations:
  - `inn-rops-himalaje-autyzmu`: `derived.problem_pl` names people in
    the autism spectrum with difficult behaviour and poor access to
    medical care; `derived.mechanism_pl` prepares the patient for the
    visit. Running in Kraków ("Usługa wrażliwa" round I, Stowarzyszenie
    "Ognisko").
  - `inn-nat-stomatologia-bez-barier-adaptacja-i-kwalifikacja-pacjentow-z-niepelnosprawnoscia`:
    `derived.problem_pl` children with disabilities and limited access
    to dental care; `derived.mechanism_pl` adaptation to the examination
    at school. Its target groups are dzieci-mlodziez-rodziny and
    niepelnosprawnosc-intelektualna, not spektrum-autyzmu.
- Target groups: spektrum-autyzmu (zdrowie as the second). Mode: route.
- Paths (`ngo`): `krakow-male-granty` (window to 16 November 2026),
  `maly-grant-19a`, `pfron-czas-na-aktywnosc` (to 27 October 2026).
- People roles: advisor, implementer_nearby.

### C07 Bezdomni mężczyźni w gminie wiejskiej (route, rural)

- Role and place: urzad-gminy; Łukowica, TERC `1207082`, gmina wiejska,
  powiat limanowski.
- Sketch: "Mamy w gminie kilku mężczyzn, którzy nie mają gdzie mieszkać:
  jeden śpi w szopie u brata, drugi w starym samochodzie pod lasem. Gmina
  płaci za ich miejsce w schronisku w dużym mieście, ale oni nie chcą tam
  jechać albo po kilku dniach wracają. Nie wiemy, jak im pomóc tutaj, na
  miejscu."
- Expected innovations:
  - `inn-rops-wiejski-program-pomocy-osobom-w-kryzysie-bezdomnosci-sciezka-feniksa`:
    `derived.problem_pl` small rural gminas lack long-term solutions for
    homelessness; `derived.mechanism_pl` uses the gmina's own resources
    instead of shelters; `derived.setting` rural.
  - `inn-rops-szlakiem-ludzi-bezdomnych`: `derived.problem_pl` poor
    hygiene of homeless people; a heated sanitary trailer, implementer
    `jst`.
- Target groups: bezdomnosc. Mode: route.
- Paths (`jst`): `cus-program-uslug`. The path list has no homelessness
  programme and the gmina itself is not eligible for
  `konkurs-wojewody-pomoc-spoleczna` (that one is for a partner NGO), so
  expect a thin path block; "expected path among the paths" (13.2) holds
  only with `cus-program-uslug`.
- People roles: advisor (no implementation in Małopolska).

### C08 Dojazd seniorów na dializy i rehabilitację (partial, rural)

- Role and place: mieszkaniec (sołtys); Uście Gorlickie, TERC `1205102`,
  gmina wiejska, powiat gorlicki.
- Sketch: "Jestem sołtysem jednej z wiosek. Starsi ludzie muszą jeździć
  na dializy i na rehabilitację do szpitala w mieście powiatowym, a
  autobusu u nas już nie ma. Część prosi sąsiadów, część płaci za
  taksówkę, na którą ich nie stać, a niektórzy po prostu rezygnują z
  leczenia."
- Nearest partial matches:
  - `inn-rops-mobilne-centrum-pomocy-dla-osob-starszych`: brings
    specialists to the senior's home (`derived.mechanism_pl`), but not
    dialysis or hospital rehabilitation.
  - `inn-nat-aplikobus-3`: a bus with volunteers (`derived.mechanism_pl`
    "Bus służy do przewozu osób"), but its purpose is culture and
    company, not treatment.
  - `inn-nat-rowerowe-riksze`: volunteer rides for older people, but
    `derived.setting` urban and short trips.
  - `inn-nat-lokalna-siec-samopomocy-3`: mutual volunteer help that
    includes medical appointments (`derived.mechanism_pl`), but for
    people with disabilities and without a vehicle.
- What is missing: an organised, regular transport to treatment
  (door-to-door rides several times a week with a driver and a vehicle).
  No record describes it: "dowóz" has 0 hits in the records, and
  "transport" appears only as a cost item or in accessibility apps.
- Target groups: seniorzy (ograniczona-mobilnosc, zdrowie). Mode: partial.
- Paths (`mieszkancy`, then `ngo`): `fundusz-solecki` (the application
  for 2027 was due by 30 September 2026, so the next is for 2028),
  `inicjatywa-lokalna`, `malopolska-lokalnie` (informal group of three
  adults; next edition February 2027); `iws-2-inkubator` for the missing
  element.
- Risk: if the model rates the mobile centre at 70 or more, the case
  turns into a route. Keep the text on the ride itself.

### C09 Rodziny po podtopieniach, pomoc się rozpadła (none, rural)

- Role and place: urzad-gminy; Zakliczyn, TERC `1216143`, gmina
  miejsko-wiejska on the Dunajec, powiat tarnowski.
- Sketch: "Po lipcowej ulewie woda weszła do kilkudziesięciu domów w
  dolinie, niektórym już drugi raz w ciągu trzech lat. Ludzie suszą
  ściany, dzieci śpią u krewnych, a wiele osób nie śpi po nocach przy
  każdym deszczu. Na początku była zbiórka i pomoc sąsiadów, teraz każdy
  został z tym sam i nikt tego nie koordynuje."
- Why no record fits: a regular-expression search over the title,
  intro, derived texts, keywords, requirements, source fields and full
  text of all 381 records finds 0 records for "powódź", "powodzi",
  "podtopi", "zalan" and "żywioł"; the one hit for "ewakuac" is the
  evacuation from Afghanistan (`inn-rops-dialog-ponad-kulturami-1`). The
  retriever's top three are unrelated: energy-poverty advice
  (`inn-nat-opracowanie-standaryzowanego-modelu-wsparcia-doradczego-dla-osob-z-grupy-ubostwa-energetycznego`,
  cosine 0.335), a telecare wristband (`inn-nat-synergia-przeciw-alienacji-3`,
  0.325) and a stair climber (`inn-nat-853`, 0.323), against 0.38 to
  0.46 for the best record of the route cases.
- Target groups: inne (the text names no group; the model may detect
  dzieci-mlodziez-rodziny). Mode: none; the route ends in the brief.
- Paths: `iws-2-inkubator` (a new innovation), `esf-social-innovation-plus`
  as a partner.
- Backup none case, if the lawyer prefers: teenagers betting on
  matches in phone apps. 0 hits for "hazard", "bukmacher" and
  sports-betting phrases; best cosine 0.348 (`inn-rops-go-ahead-mow-smialo`,
  unrelated). Addiction is a sensitive topic of 8.10, so it would carry
  the crisis banner.

### C10 Chcę pomóc, ale nie wiem komu (clarification)

- Role and place: mieszkaniec; no place (`place_terc: null`).
- Sketch: "Chciałbym zrobić coś dobrego dla ludzi w swojej okolicy, bo
  widzę, że wiele osób sobie nie radzi. Mam trochę wolnego czasu i
  znajomych, którzy też chętnie pomogą. Od czego zacząć?"
- Expected: neither a target group nor a place, so FR-2.3 shows the one
  question "Kogo najbardziej dotyczy ten problem?" and matching reruns on
  the answer. No innovations, no paths.
- Open point for the lawyer and Developer 1: the stage 2 modes are
  route, partial and none (8.3) and the app's `RouteMode` has no
  clarification value, so the YAML needs an agreed value for this case,
  for example `mode: clarification`.

### C11 (spare) Dzieci z Ukrainy w świetlicy (route, urban)

- Role and place: organizacja-spoleczna (stowarzyszenie prowadzące
  świetlicę); Bochnia, TERC `1201011`, gmina miejska.
- Sketch: "Prowadzimy w stowarzyszeniu świetlicę dla dzieci po lekcjach.
  Przychodzi do nas coraz więcej dzieci z Ukrainy, które prawie nie
  mówią po polsku: przy odrabianiu lekcji siedzą cicho, a w zabawach
  trzymają się tylko razem. Ich rodzice pracują na zmiany i nie
  przychodzą na spotkania, bo boją się, że nic nie zrozumieją."
- Expected innovations:
  - `inn-rops-moj-pomocny-virtual-world`: `derived.problem_pl` Ukrainian
    school children's difficult adaptation in Poland;
    `derived.mechanism_pl` a Ukrainian-speaking companion and useful
    Polish phrases.
  - `inn-nat-romski-w-obrazkach` (weaker, rank 11): Polish-learning
    materials for children who do not speak Polish
    (`derived.index_card_pl`), target group cudzoziemcy.
- Target groups: cudzoziemcy, dzieci-mlodziez-rodziny. Mode: route.
- Paths (`ngo`): `maly-grant-19a`, `proo` (PROO 5 up to 10 000 zł, rolling
  to 30 November 2026), `otwarty-konkurs-ofert`.
- People roles: advisor (no implementation in Małopolska).

### C12 (spare) Mieszkania bez łazienki (route, urban)

- Role and place: urzad-gminy; Nowy Targ, TERC `1211011`, gmina miejska.
- Sketch: "W starych kamienicach i domach w naszym mieście wciąż mieszkają
  ludzie bez łazienki: myją się w misce, a toaleta jest na podwórku. To
  często starsze osoby i rodziny z małymi dziećmi, których nie stać na
  remont, a budynek nie ma podłączenia do kanalizacji."
- Expected innovations:
  - `inn-rops-przenosne-modularne-lazienki`: `derived.problem_pl` poor
    people in flats without a bathroom; `derived.mechanism_pl` modules
    mounted in rooms not built for sanitation. Planned in Bystra-Sidzina
    (27 km) and Podegrodzie (40 km), "Usługa wrażliwa" round II.
  - `inn-nat-plusk-przenosny-zestaw-prysznicowy`: a portable shower for
    places without an adapted bathroom (`derived.mechanism_pl`).
- Target groups: inne (seniorzy as the second). Mode: route.
- Paths (`jst`): `usluga-wrazliwa-b`, `cus-program-uslug`.
- People roles: advisor, implementer_nearby.

## 4. Retrieval sanity check

Method: each sketch above, prefixed with `[query]: `, was encoded with
PolDense-400M (`OPI-PIB/PolDense-400M` through sentence-transformers in
`.venv`, `normalize_embeddings=True`, `HF_HUB_OFFLINE=1`) and
compared by dot product with the 381 unit vectors of
`data/built/index-vectors.json`. The rank
is the position of the expected innovation in that list. A throwaway
script outside the repository did it; nothing under `scripts/` changed.

| Cand. | Expected innovation | Rank | Cosine | Best record (cosine) |
|---|---|---:|---:|---|
| C01 | inn-rops-mobilne-centrum-pomocy-dla-osob-starszych | 1 | 0.463 | same |
| C01 | inn-rops-centrum-antydepresyjne | 3 | 0.382 | |
| C01 | inn-rops-senior-cuder | 28 | 0.346 | |
| C02 | inn-rops-organizator-kompleksowej-opieki-w-miejscu-zamieszkania | 1 | 0.424 | same |
| C02 | inn-nat-844 | 7 | 0.361 | |
| C02 | inn-rops-terapeuta-przestrzeni | 10 | 0.356 | |
| C03 | inn-rops-bez-presji-z-depresji | 1 | 0.421 | same |
| C03 | inn-nat-eduwaznosc | 9 | 0.349 | |
| C04 | inn-rops-gluchy-czytelnik-w-bibliotece | 1 | 0.444 | same |
| C04 | inn-nat-gluchy-czytelnik-w-bibliotece-przewodnik-w-pjm | 2 | 0.420 | |
| C05 | inn-rops-mobilna-gielda-pracy | 1 | 0.419 | same |
| C05 | inn-nat-wiory-leca | 2 | 0.390 | |
| C05 | inn-nat-zagraj-o-przyszlosc-3 | 15 | 0.336 | |
| C06 | inn-nat-stomatologia-bez-barier-adaptacja-i-kwalifikacja-pacjentow-z-niepelnosprawnoscia | 1 | 0.410 | same |
| C06 | inn-rops-himalaje-autyzmu | 2 | 0.384 | |
| C07 | inn-rops-wiejski-program-pomocy-osobom-w-kryzysie-bezdomnosci-sciezka-feniksa | 1 | 0.391 | same |
| C07 | inn-rops-szlakiem-ludzi-bezdomnych | 2 | 0.386 | |
| C08 | inn-rops-mobilne-centrum-pomocy-dla-osob-starszych | 1 | 0.381 | same |
| C08 | inn-nat-aplikobus-3 | 3 | 0.350 | |
| C08 | inn-nat-rowerowe-riksze | 8 | 0.325 | |
| C08 | inn-nat-lokalna-siec-samopomocy-3 | 11 | 0.319 | |
| C09 | none expected | - | - | energy-poverty advice (0.335) |
| C10 | none expected | - | - | inn-nat-lokalna-siec-samopomocy-3 (0.336) |
| C11 | inn-rops-moj-pomocny-virtual-world | 1 | 0.438 | same |
| C11 | inn-nat-romski-w-obrazkach | 11 | 0.362 | |
| C12 | inn-nat-plusk-przenosny-zestaw-prysznicowy | 1 | 0.388 | same |
| C12 | inn-rops-przenosne-modularne-lazienki | 2 | 0.381 | |

Flags: none. Every expected innovation is within the top 40 (the worst
is `inn-rops-senior-cuder` at 28 in C01; drop it from
`any_of_innovations` if the text does not speak of relationships and
motivation). The core innovation of each route case is at rank 1 or 2.

Reading the numbers:

- The ranks belong to these sketches. The lawyer's own text will rank
  differently; ask Developer 1 to run it through the embedding service
  (`scripts/embedding-service.py`) before the calibration.
  A rank above 40 for the expectation you chose means either the
  expectation or the retriever is wrong, and the report should say
  which.
- The none and clarification texts reach a best cosine of about 0.34;
  the route cases reach 0.38 to 0.46 and the partial case 0.38. The gap
  is small, so the mode must come from stage 2, not from the retriever's
  score.
- In C01 and C08 the same record (`inn-rops-mobilne-centrum-pomocy-dla-osob-starszych`)
  ranks first; the two texts must differ clearly (low mood at home
  against the ride to treatment), or C08 turns into a route.

## 5. Checklist for the lawyer

1. One file per problem, `tests/problems/P01.yaml` to `P10.yaml`, in the
   format of 13.1: `id`, `title`, `author: lawyer`, `written_on`, `role`
   (one of `pracownik-instytucji`, `organizacja-spoleczna`,
   `mieszkaniec`, `urzad-gminy`), `place_terc` as a quoted seven-digit
   string (null only for the clarification case), `problem_text_pl`,
   `expected` (`mode`, `any_of_innovations`, `none_of_innovations`,
   `target_groups`, `paths_any_of`, `people_roles`,
   `summary_must_mention_pl`) and `notes`.
2. Write the title and the whole `problem_text_pl` yourself. Do not paste
   or lightly edit the sketches above: change the voice, the details and
   the order, keep only the core need. Avoid the words of the catalogue
   (record titles, `keywords_pl`), so that the retriever has to earn the
   match.
3. Choose the expected innovations yourself by reading the record in
   `data/built/innovations/<id>.json` (`derived.problem_pl`,
   `derived.mechanism_pl`, `source_fields`), and name the fields in
   `notes`. Add to `none_of_innovations` a record that would be a wrong
   answer.
4. `summary_must_mention_pl`: a word stem from your own text, such as
   "świetlic" in the example of 13.1.
5. Check every TERC in `data/built/places/pl-register.json`. The example in 8.4
   pairs Kamienica with `1206072`, which is Liszki; Kamienica is
   `1207052`, and the example `1207062` in 13.1 is Laskowa.
6. Agree with Developer 1 on the `mode` value of the clarification case
   (see C10) and on the people roles the harness checks.
7. Hashes: the harness of 13.2 (`pnpm eval`) prints a hash of each
   problem file in the evaluation report. Any later change to a file,
   including one by an AI assistant, changes its hash. After you commit
   the ten files, keep the output of `sha256sum tests/problems/*.yaml`
   (or `git log` of the commit) so that the printed hashes can be
   checked against your version.
8. The sets R01-R12, S01-S04 and F01-F03 of 13.1 are separate from the
   ten; they are written with Developer 1 in the same YAML shape with
   `expected.outcome`.
