# Challenge selection: HubMI.pl at HackYeah 2026

## The event

HackYeah 2026 runs on 3 and 4 October 2026 at TAURON Arena Kraków, for 24
hours, with teams of one to six people. Each team may enter one project per
category. Entering one project in two categories is strongly discouraged,
because a partner may take over the rights to the winning solution.

## Why this challenge

We choose the partner task **HubMI.pl**, with a prize pool of 15 000 PLN.
Projects may be submitted in Polish or English.

| Task | Prize pool | Why not, or why |
|---|---|---|
| **HubMI.pl** | 15 000 PLN | Chosen. Large pool, a partner with real data and a real follow-up path, a brief that rewards thinking over hardware or platform lock-in |
| Smart City (open) | 5 000 PLN | Broad, crowded, a third of the prize |
| Cracow without barriers | 5 000 PLN | Polish only, accessibility of routes, narrow |
| IMAGINE WHAT'S NEXT | 25 000 PLN | Tied to HarmonyOS |
| Finance Without Intermediaries | 11 300 PLN | Tied to blockchain |

## The task

English abstract, verbatim:

> How can we ensure that good ideas for solving social problems do not go
> unnoticed? Use technology to connect residents' needs more effectively
> with knowledge, proven solutions, and people ready to take action. Create
> a concept that will help valuable initiatives reach the places where they
> are needed most and facilitate cooperation between residents,
> institutions, and social organizations.

The teaser talk on the conference track says more. Its core sentence,
verbatim:

> Nie chcemy kolejnego portalu, katalogu ani wyszukiwarki. Chcemy
> narzędzia, które potrafi połączyć problem z istniejącym rozwiązaniem,
> wskazać właściwą wiedzę i ludzi, a gdy rozwiązania jeszcze nie ma - pomóc
> znaleźć drogę do jego stworzenia.

In English: we do not want another portal, catalogue or search engine. We
want a tool that connects a problem with an existing solution, points to the
right knowledge and people, and, where no solution exists yet, helps find
the way to create one.

The talk also says that close to 200 social innovations were created in
Małopolska over the last ten years, and that the knowledge about them exists
but is scattered.

## Who the partner is

HubMI.pl is not a company. It is the working name of the digital core of a
planned **Małopolski Hub Innowacji Społecznych**, brought by the Regional
Social Policy Centre in Kraków (Regionalny Ośrodek Polityki Społecznej,
ROPS), under the "Małopolska Innowacyjna" brand of the Marshal's Office. The
teaser talk is given by the head of the ROPS social-innovation department
and by the ROPS director, on Saturday 3 October at 12:00.

The domain hubmi.pl is a parked page offered for sale by a private person.
It is not the partner's site, and we do not build on it.

What ROPS already has:

- **Four incubators since 2016.** The current one, Inkubator Włączenia
  Społecznego 2.0, runs until June 2028 with EU funding. It will test 32
  innovations and recommend 9 for national roll-out.
- **A regional innovation library** in nine target-group categories. Each
  entry has a PDF folder, a video and a download package. The newer entries
  are under CC BY 4.0. The site is marked as under reconstruction.
- **A dissemination project, "Usługa wrażliwa"**, which pays grants of up
  to 600 000 PLN to local bodies that implement at least ten of these
  innovations.
- **Regional service models** that already include nine senior-care
  innovations.
- **A statistics observatory** with social indicators per municipality, and
  a practical guide for municipal needs diagnoses.

## What already exists, so we do not repeat it

| Product | What it does | What it lacks against the brief |
|---|---|---|
| innowacjespoleczne.pl, national base run by Fundacja Stocznia | Over 150 innovations from all EU-funded incubators, each with problem, method, target group, who can implement, contact; files CC BY 4.0 | Browse and filter only. No search by problem, no matching, no people network, no API |
| ROPS innovation library | The regional catalogue | Static, no adoption status |
| Social Innovation Match, EU | European examples with filters and partner search | Not Polish, no local adoption data |
| Participation knowledge bases (Stocznia, cities' association, urban institute) | Libraries of methods and cases for officials | PDFs and narratives, no routing to people |
| Volunteering boards (Korpus Solidarności, Ochotnicy Warszawscy, e-wolontariat) | Organisations post offers, individuals apply | Low use: the national system had about 3 500 users after six years |
| Issue-reporting and city apps (mKraków, Warszawa 19115, eCityUp) | Reports to the city office | Saturated; the national NaprawmyTo shut down in March 2026 |
| Participatory budgets | Annual vote on money | Kraków turnout 12 %, many duplicate or rejected ideas |
| Crowdfunding and NGO directories | Money; registries | Not matching |

Conclusion: the catalogue exists twice, nationally and regionally. The open
ground is matching and routing on top of the existing catalogues, with
people and unmet needs as first-class data.

## Evidence of the need

| Documented gap | Value | Source |
|---|---|---|
| Adults who cannot name any organisation offering volunteering | 44 % | NIW-CRSO synthesis, May 2026 |
| Kraków residents who cannot name a single local NGO | 42 % | Kraków study cited in the same synthesis |
| NGOs lacking people ready to engage | 61 % | Klon/Jawor, Kondycja 2024 |
| NGOs lacking successors for their leaders | 58 % | Klon/Jawor, Kondycja 2024 |
| Kraków NGOs wanting meetings with peers in the same field | 76 % | KraFOS survey for the city, second half of 2025 |
| Kraków NGOs who do not believe consultations change city action | 45 % | 2021 city evaluation, cited by NIW 2026 |
| Polish municipalities where anyone filed a local-initiative application in 2022 | under 7 % | GUS data in the Batory Foundation report, 2024 |

## Four candidate apps

### 1. Problem router

A social worker, an NGO leader, a district councillor or a resident
describes a problem in plain Polish, for example isolated seniors in a
village without a day centre. The tool does not return a list. It returns a
route: the two or three closest proven innovations with the reason they fit,
the person behind each one and any implementer nearby, the ROPS advisor for
that category, and the funding path.

When nothing fits well enough, it switches mode. It files the problem in a
needs bank, shows the nearest partial matches, and drafts an incubator brief
that already contains the duplicate check incubators must do anyway. The
needs bank becomes the demand signal for the next incubator call.

Data on day one: the national base, the ROPS library, contacts already on
the entries. The engine can run on a Polish open language model such as
Bielik, self-hosted, or on the government PLLuM service.

### 2. Adoption map with peer matching

Each innovation gets a living record of where it runs, who runs it and with
what result. A map of Małopolska overlays adoption with municipal need
indicators from the ROPS observatory and shows where an innovation is
needed but absent. A button connects a municipality that considers an
innovation with one that already runs it. Nobody tracks adoption today.

### 3. Expert network with knowledge capture

A question is routed to two or three people who have done the thing. Their
answers, and short recorded conversations with consent, are transcribed and
attached to the innovation, so the knowledge stays when the person leaves.
This addresses the leadership and succession gap the sector reports.

### 4. Implementation and funding pathfinder

For a chosen innovation and place, the tool produces a local plan: partners,
resources, budget frame, legal vehicle, and the matching funding call with
dates. It uses the small-grant route that the amendment in force since
1 September 2026 doubled, the ROPS dissemination grants, the regional
micro-grants and the national programmes. It drafts application text from
the innovation's own manuals.

## Recommendation

Build **app 1, the problem router**, with the adoption map of app 2 as its
second screen. It answers every clause of the brief, including the case
where no solution exists yet, and it has real data from the first hour.
Apps 3 and 4 go on the roadmap slide as later modules.

What the 24-hour demo should show:

1. Ingest the national base and the ROPS library.
2. Ten test problems, taken from real survey categories, each answered with
   a route rather than a list.
3. One problem with no good match, landing in the needs bank and producing
   an incubator brief.
4. A map of Małopolska with three indicators and ten innovations with
   seeded adoption.

## Risks and open questions

- **The jury reads it as a search engine.** Never show a result list. Show a
  route with names and a next step, and show what happens when nothing
  matches.
- **Rights transfer.** The HackYeah rules allow a partner to acquire the
  economic copyright of a winning solution by public promise.
- **Licences.** National base materials are CC BY 4.0 and its code GPL-3.
  Newer ROPS entries are CC BY 4.0, older ones have their own terms. We
  credit both in the repository and the presentation.
- **Prior work.** Allowed, but must be cited. The core idea and final
  solution must be the team's own work. AI tools must be credited.
- **Personal data.** Contacts on innovation entries are public, but a
  people network needs opt-in and data minimisation from the start.
- **Unknown criteria.** Partner criteria are not published. The default
  HackYeah criteria weigh idea and innovation 30 %, relation to the category
  20 %, practical applicability 20 %, design 20 %, completeness 10 %.

## Before the coding

- Attend the teaser talk on Saturday 3 October at 12:00; its speakers are
  likely the partner jury.
- Download and index the two catalogues ahead of time, within their
  licences.
- Prepare ten test problems in Polish.
- Decide on the language model and hosting.

## Sources

- HackYeah task list and conference programme: server function behind
  https://hackyeah.pl/tasks-prizes
- HackYeah rules: https://hackyeah.pl/rules
- ROPS Inkubator Włączenia Społecznego 2.0:
  https://rops.krakow.pl/realizowane-projekty-i-zadania/inkubator-wlaczenia-spolecznego-20,o-projekcie
- ROPS Usługa wrażliwa:
  https://rops.krakow.pl/realizowane-projekty-i-zadania/usluga-wrazliwa-upowszechnianie-innowacji-spolecznych-w-srodowiskach-lokalnych,o-projekcie
- ROPS innovation library:
  https://rops.krakow.pl/innowacje-spoleczne/biblioteka-innowacji-spolecznych/kategorie
- National innovation base: https://innowacjespoleczne.pl/lista-innowacji/
- Minimum requirements for the national base:
  https://www.power.gov.pl/media/90890/Zal_1_Minimalne_wymagania_dotyczace_internetowej_bazy_innowacji.pdf
- Social Innovation Match:
  https://european-social-fund-plus.ec.europa.eu/en/social-innovation-match
- NIW-CRSO, Wolontariat i aktywność społeczna w Polsce 2020-2024:
  https://niw.gov.pl/wp-content/uploads/2026/05/Wolontariat-i-aktywnosc-spoleczna-w-Polsce-2020-2024.pdf
- Klon/Jawor, Kondycja organizacji pozarządowych 2024:
  https://api.ngo.pl/media/get/271556
- Batory Foundation, Narzędzia partycypacji lokalnej w Polsce w 2023 roku:
  https://www.batory.org.pl/wp-content/uploads/2024/04/A.Dabrowska_Narzedzia.partycypacji.lokalnej.w.Polsce.w.2023.rok_raport.pdf
- Kraków NGO needs surveys (KraFOS):
  https://ngo.krakow.pl/ngos/239743,artykul,wewnetrzne-badania-i-raporty.html
