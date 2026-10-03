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

A working pilot of the end-user side of HubMI.pl, the digital core ROPS
Krakow plans for the Malopolska Social Innovation Hub: a person with a
need finds a solution. The service around it is a proposed roadmap, not
yet built.

**A route, not a catalogue.** A resident, a social worker, an NGO leader
or a municipal official describes a need in plain Polish and picks their
municipality. It returns a route in four blocks:

- **Solutions:** up to three proven innovations that fit, each with why it
  fits, quoted from its source entry, and what it takes: implementer, cost
  band and time.
- **Knowledge:** the manuals, models and videos that come with them.
- **People:** the innovator, implementers nearby, the ROPS category
  advisor, and residents and organisations who offered to help. Contact
  requests are stored, with consent, for ROPS to relay.
- **Implementation path:** the legal vehicle, the funding calls and three
  next steps.

**Not a search engine, not a chatbot over documents.** Search returns
links and a RAG chatbot returns a fluent paragraph; both answer every
question. HubMI composes a route by rules from curated data, and it can
say no. The Polish open model Bielik only selects and explains: every
identifier it returns is checked against the catalogue, every quote
against its source field, and code, not the model, decides whether the
fit is good enough. Amounts, deadlines and legal bases come from a
curated table of 30 funding and legal paths the model never sees.

**When nothing fits, it says so.** The need goes into a needs bank, and
the tool drafts a brief for the next incubator call with the nearest
existing innovations. Needs become the demand signal the incubators lack
today.

**Where it is needed most.** For any innovation, a map of the 183 gminas
shows where it runs and where it is needed but missing.

**Real data.** 381 innovations from the national base
innowacjespoleczne.pl and the ROPS library, each linked to its source.

**Ethics first.** A screening gate reads every text before any matching.
A person in crisis gets helplines and the local social assistance
centre, not innovations. A discriminatory request is declined with
respect. Personal data is removed before storage and before any prompt.
The tool sends nothing to anyone and decides nothing about an individual.

**A pilot now, a service next.** The roadmap, proposed and not yet
implemented: ROPS runs HubMI as a service with three roles (category
advisor, catalogue editor, needs-bank coordinator) and a console where
every contact, need and registration waits for a person. It closes three
loops: need to implementation, need to new innovation, innovation to
places.

**Built for everyone.** Polish interface in Atkinson Hyperlegible, a
typeface for readers with low vision, full keyboard use and a phone
layout.

The AI coding agent Claude Code (Anthropic) was used; every human
decision, all data sources and licences are documented in the
repository.

**Team:** Alexander Bobrovsky (bobrovsky@seznam.cz), Anton Myshelov
(omgkennyno@gmail.com), Dmytro Chernikov (me41st0@gmail.com), Dmytro Ushakov (ushakov_d@hotmail.com),
Krzysztof Zajac (zajkrz@gmail.com).
