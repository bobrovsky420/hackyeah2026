# HubMI.pl: from need to solution

A working prototype of HubMI.pl, the digital core that ROPS Kraków plans
for the Małopolska Social Innovation Hub, built for the HubMI.pl partner
task of HackYeah 2026. It answers the partner's question: how do proven
solutions to social problems reach the places that need them?

## What it is

A social worker, an NGO leader, a municipal official or a resident
describes a need in plain Polish and picks their municipality (gmina).
The answer is a route, not a list:

- **Solutions**: up to three proven innovations that fit, each with why
  it fits, quoted from its source entry, and what it takes: implementer,
  cost band, time and where it already runs.
- **Knowledge**: the manuals, models and videos that come with them.
- **People**: the innovator, implementers nearby, the ROPS category
  advisor and people ready to act, with consent.
- **Implementation path**: the legal vehicle, the funding calls and three
  next steps.

When nothing fits well enough, the tool says so, files the need in a
needs bank and drafts the brief for the next incubator call, with a
duplicate check against the existing innovations. Needs become the
demand signal the incubators lack today.

The concept goes beyond the software: ROPS runs the service in three
roles (category advisor, catalogue editor, needs-bank coordinator) and
closes three loops: need to implementation, need to new innovation,
innovation to places. From day one the tool counts what ROPS would
report: routes, contact requests, needs turned into call topics, new
implementations.

Built for everyone: a Polish interface in Atkinson Hyperlegible, a
typeface designed for readers with low vision, 7:1 text contrast, three
display themes, full keyboard use, a phone layout and an axe check of
every screen.

## How a route is made

1. **The screening gate** reads every text before any matching: a
   deterministic pre-check, then the model. A community need is routed;
   signs of a crisis lead to the verified helplines and the local social
   assistance centre, not to innovations; a request meant to exclude or
   demean is declined, with a reason and a person to appeal to. Personal
   data of third parties is removed before storage and before any prompt.
2. **Retrieval**: the need is embedded with PolDense-400M and the forty
   nearest index cards of the 381 innovations are selected.
3. **Rerank and reasons**: Bielik 11B v3.0 (the Polish open model, on the
   Hugging Face router) picks the two or three that fit and explains why;
   Claude and Llama 3.3 70B are the fallbacks. Every identifier the model
   returns is checked against the catalogue, every reason quotes the
   source, and generated text is labelled. The model never creates a
   solution, an organisation, a person, an amount or a deadline.
4. **The composer** adds the knowledge, the people (innovators,
   implementers nearby, the ROPS advisor, people ready to act, shown only
   with consent and after ROPS verification), the implementation paths
   (legal vehicle, funding calls) and three next steps.
5. **The ROPS console** moderates everything that involves a person:
   published needs, relayed contact requests, verified registrations,
   declined texts and content reports, each action logged. The tool never
   decides anything about an individual.

The ten ethics principles behind this (dignity, do no harm, a person in
crisis gets a person, no decisions about individuals, privacy by design,
people in the loop, fairness, honesty about the machine, accessibility
and plain language, accountability) are section 3.6 of the
[specification](docs/functional-specification.md) and the "Zasady" page
of the app.

## Data, models and licences

| What | Source | Licence |
|---|---|---|
| 300 innovations | Baza innowacji społecznych, innowacjespoleczne.pl (Fundacja Stocznia) | CC BY 4.0 texts |
| 115 innovations | Biblioteka innowacji społecznych, ROPS Kraków | CC BY 4.0, or the MIIS terms of use, shown with attribution |
| The catalogue of the app | The two merged (34 duplicates joined) into 381 records with derived fields; the contract is [data/README.md](data/README.md) | as above; the catalogues stay the systems of record |
| Municipalities | The TERC register (GUS); indicators from the Local Data Bank (GUS BDL, 2024); boundaries from the PRG in the public-domain GeoJSON of waszkiewiczja | CC BY 4.0 (BDL, PRG) |
| Language models | Bielik 11B v3.0 (SpeakLeash) through the Hugging Face router; Claude (Anthropic) and Llama 3.3 70B (Meta) as fallbacks | The providers' terms |
| Retriever | PolDense-400M by OPI PIB (Dadas et al. 2026, "Parameter-Efficient Retrievers for Polish and European Languages") | Gemma Terms of Use |
| Software | Next.js 16, React, TypeScript, Tailwind CSS 4, MapLibre GL JS, Lucide; form patterns from the GOV.UK Design System; a Python data pipeline | Open-source licences of the packages |
| Typeface | Atkinson Hyperlegible Next, Braille Institute | SIL Open Font License |

## Run it

```
npx pnpm@12.6.0 install
npx pnpm@12.6.0 dev
```

Open http://localhost:3000. A fresh clone runs on the prototype's
fixtures without any key; the real data comes as a bundle and the model
as a Hugging Face token: [docs/quick-start.md](docs/quick-start.md) has
the four steps, [docs/local-stack.md](docs/local-stack.md) runs the whole
app in Docker. There is no database: the entries live in one JSON file
([docs/storage.md](docs/storage.md)). The ROPS console needs an access
code. The demo address will be added before the presentation.

## The repository

- `src/app/`: the pages (English folders, Polish URLs) and the API;
  `src/server/`: the gate, the matcher, the route composer, the needs
  bank and the store; `src/lib/`: the data facade, the model adapter,
  the contracts.
- `scripts/`: the data pipeline (crawl, parse, extract, build, pack) and
  the embedding service; `data/`: what the app serves; `prompts/`: the
  versioned prompts; `tests/`: Vitest and Playwright.
- `docs/`: the [functional specification](docs/functional-specification.md),
  the [decision log](docs/decision-log.md), the
  [challenge selection](docs/challenge-selection.md), the
  [model evaluation](docs/model-evaluation.md), the
  [record contract](docs/innovation-record.md) of the catalogue, the
  [quick start](docs/quick-start.md), [storage](docs/storage.md),
  [data setup](docs/data-setup.md) and the [Docker stack](docs/local-stack.md).
- [AGENTS.md](AGENTS.md): the rules every contributor and AI assistant
  follows here.

## Team, credits and licence

The team: Alexander Bobrovsky, Anton Myshelov, Dmytro Chernikov, Dmytro
Ushakov and Krzysztof Zając. AI coding assistants (Claude Code) wrote
code, texts and tests under the team's direction; every Polish text the
public sees is reviewed by the team's Polish speakers, and the idea and
the decisions are the team's own, recorded in the
[decision log](docs/decision-log.md).

The code is under the Apache License 2.0 ([LICENSE](LICENSE)); copyright
2026 the team members named above. The rules of the partner task may
provide for a transfer of economic rights to the partner; the team
accepts that if the rules say so.
