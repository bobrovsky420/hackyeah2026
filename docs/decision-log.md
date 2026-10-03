# Decision log

One entry per decision that changes the specification or the way of
working: date, decision, who decided, why, and where it is written down.
The log is also the evidence, required by the HackYeah rules, that the
core idea and the decisions are the team's own work. AI assistants append
entries for decisions people make; they never decide.

| Nr | Decision | Decided by | Why | Where |
|---|---|---|---|---|
| 1 | One task for the whole team: the HubMI.pl problem router; Swiss TIP for Poland only as a gated stretch entry | The team (user decision) | The 15 000 PLN pool, a partner brief that says what it wants, real data from the first hour; see the comparison in the selection document | [challenge-selection.md](challenge-selection.md) |
| 2 | The functional specification is the working brief for people and AI assistants; assumptions and open points are registers with owners, due dates and defaults | The team | The full task text arrives only on 3 October; the build cannot wait for it | [functional-specification.md](functional-specification.md), sections 15 and 16 |
| 3 | Ethics first: ten principles rank above every feature; a screening gate runs before matching; crisis texts go to human help; harmful requests are declined; people at ROPS moderate everything that reaches a real person | The team (user request) | The tool serves the people social policy exists to protect; the partner's own title is "Od empatii do technologii" | Specification 3.6, 7.12, 12.14 |
| 4 | No file, folder or package name contains "hubmi"; names describe the role | The user | The whole repository is the HubMI.pl project; the name adds nothing | Specification 3.5 |
| 5 | Pages have Polish, ASCII-only routes; the API has English routes | Kept as specified, questioned and explained, not yet confirmed as final | URLs are user-visible and the product is Polish-only; the API is for developers | Specification 9.5 |
| 6 | Every Python command in this repository runs in the project venv (`.venv`), with packages pinned in `requirements.txt` | The user | A clean, repeatable environment before the hackathon | `requirements.txt`, [model-evaluation.md](model-evaluation.md) section 6 |
| 7 | Bielik-11B v3.0 through the Hugging Face router (provider "publicai") is the live second model provider; the fallback order is Anthropic, Bielik, Llama 3.3 70B on OVHcloud, the replay cache; only Anthropic and Bielik may serve the screening gate | The team, on the probe results | Bielik passed every probe case; the EU-hosted generalists missed the off-topic case; reasoning models are too slow for the gate | [model-evaluation.md](model-evaluation.md); specification 9.3, OP-05 |
| 8 | Apertus is excluded from every future evaluation | The user | It failed two of four screening cases in the probe; the team wants no time spent on it | Specification OP-40, 14.5, 14.7.3 |
| 9 | Swiss references are recorded as references and borrowed patterns, not as dependencies; at most two sentences about them on the slides | The team (user request for the research) | The jury is Polish; the references support the concept, they are not the product | Specification 14.7, OP-39 |
| 10 | Mistral Small 3.2 on Scaleway joins evaluation if an account is opened within an hour; otherwise Bielik alone | The team | The only EU-origin model with documented Polish that is callable today | Specification OP-42 |
