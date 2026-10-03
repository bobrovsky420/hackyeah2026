# HackTribe submission

The texts for the HackTribe form (limits in
[functional-specification.md](functional-specification.md), section 2).
Title at most 5 words, description at most 500 words, both in English.
The FAQ asks for the names and addresses of the team members in the
description; they count towards the 500 words. Recount the words after
every edit.

## Title

HubMI: From Need to Solution

## Description

Our solution is a working prototype of HubMI.pl, the digital core that ROPS Krakow
plans for the Malopolska Social Innovation Hub. It answers the partner's
question: how do proven solutions to social problems reach the places
that need them?

**A route, not a catalogue.** A social worker, an NGO leader, a municipal
official or a resident describes a need in plain Polish and picks their
municipality. The solution returns a route in four blocks:

- **Solutions:** up to three proven innovations that fit, each with why it
  fits, quoted from its source entry, and what it takes: implementer, cost
  band, time and where it already runs.
- **Knowledge:** the manuals, models and videos that come with them.
- **People:** the innovator, implementers nearby, the ROPS category
  advisor and people ready to act, with consent.
- **Implementation path:** the legal vehicle, the funding calls and three
  next steps.

**When nothing fits, it says so.** The need goes into a needs bank, and
the tool drafts a brief for the next incubator call, with a duplicate
check against existing innovations. Needs become the demand signal the
incubators lack today.

**Real data.** 381 innovations from the national base
innowacjespoleczne.pl and the ROPS library, each linked back with its licence and attribution.
The catalogues stay the systems of record.

**Nothing invented.** A language model, the Polish open model
Bielik, selects and explains; it never creates a solution, an
organisation, a person, an amount or a deadline. Every identifier it
returns is checked against the catalogue, every reason quotes the source,
and generated text is labelled.

**Ethics first.** A screening gate reads every text before any matching.
A community need is routed. A person in crisis gets helplines and the
local social assistance centre, not a list of innovations. A
discriminatory request is declined with respect. Personal data is removed
before storage and before any prompt. Nothing reaches a real person
without a ROPS moderator, and the tool never decides anything about an
individual.

**A concept, not only software.** ROPS runs the service with three roles:
category advisor, catalogue editor and needs-bank coordinator. It closes
three loops: need to implementation, need to new innovation, innovation to
places. From day one it counts what ROPS would report: routes, contact
requests, needs turned into call topics, new implementations.

**Built for everyone.** Polish interface in Atkinson Hyperlegible, a
typeface designed for readers with low vision, 7:1 text
contrast, three display themes, full keyboard use, a phone layout and an
axe check of every screen.

Built with Next.js, TypeScript, MapLibre and a Python data pipeline.
AI coding assistants were used and are credited in the repository, with
all data sources and licences.

**Team:** Alexander Bobrovsky (bobrovsky@seznam.cz), Anton Myshelov
([e-mail]), Dmytro Chernikov ([e-mail]), Dmytro Ushakov ([e-mail]),
Krzysztof Zajac (zajkrz@gmail.com).
