# Import: personas from the user's text file

The user gives a `.txt` or `.md` file with requests they wrote or
collected. Each request becomes one persona of `requests.yaml`; its text
is the request word for word, and what the file does not say is filled
in by the rules of [personas.md](personas.md).

## What the file may look like

Any of these, or a mix; ask the user only when the requests cannot be
told apart.

- **Sections**: a Markdown heading per request (`##`, `###`), the
  heading being its title.
- **A numbered or bulleted list**: one request per item; a request may
  run over several lines.
- **Blocks**: requests separated by a blank line or by `---`.
- **Quotes**: `> ...` blocks; the text of each quote is one request.

Optional details, one per line before or after the text of a request, in
Polish or English, as `Key: value`:

| Key | Values | Becomes |
|---|---|---|
| `Rola`, `Role` | pracownik instytucji, urząd gminy, organizacja, mieszkaniec, brak | `role`: `pracownik-instytucji`, `urzad-gminy`, `organizacja-spoleczna`, `mieszkaniec`, `null` |
| `Miejsce`, `Gmina`, `Place` | a gmina or a village in Małopolska, or brak | `place_query`, and `expected_terc` from `data/built/places/` |
| `Wynik`, `Oczekiwany wynik`, `Intent` | droga, częściowa, brak rozwiązania, doprecyzowanie, pomoc, odmowa, poza tematem | `intent`: `route`, `partial`, `none`, `clarification`, `redirected`, `declined`, `off_topic` |
| `Grupa`, `Group` | a target group code or its Polish label | `behaviour.clarify_group` |
| `Zachowanie`, `Behaviour` | free words: "otwiera 2 rozwiązania, ocenia tak, pobiera" | the matching `behaviour` fields |
| `Id` | `D01`... | `id` |

Lines like these are details, not part of the text. Everything else in a
request is its text.

Example:

```md
## Wychowankowie pieczy zastępczej
Rola: pracownik instytucji
Miejsce: Tarnów
Zachowanie: otwiera 2 rozwiązania, ocenia tak, pobiera

Pracuję w powiatowym centrum pomocy rodzinie. Co roku kilkanaście osób
kończy 18 lat i wychodzi z rodzin zastępczych...

## Sąsiad na wózku
Miejsce: Pisarzowa

Moj sasiad od wypadku jezdzi na wozku...
```

## How to turn it into personas

1. Copy the file into the run folder as `source.md` (or `source.txt`), so
   the run keeps what it was made from.
2. Split it into requests as above. Keep each text **exactly** as
   written: no corrected typos, no added Polish letters, no shortening.
   Only trim the spaces at its ends and join its lines.
3. Fill in what is missing:
   - `role`: from the text when it says it ("Pracuję w OPS",
     "Prowadzimy stowarzyszenie", "Mój sąsiad"); otherwise `null`.
   - `place_query`: from the text when it names a place in Małopolska;
     otherwise `null`. Never invent a place for an imported request: a
     missing place is part of what the user wrote.
   - `intent`: from the catalogue, as personas.md says for `route`: two
     or three records whose `derived.problem_pl` fit the text make it
     `route`; a partial fit `partial`; none `none`; a text with neither
     a group nor a place `clarification`.
   - `behaviour`: varied by the rules of personas.md, unless the file
     says it.
   - `description_pl`: who seems to write, in one line, ending with
     "(z pliku)"; say there which fields you inferred, for example
     "(z pliku; rola i wynik odczytane z tekstu)".
4. Report what does not fit instead of changing it silently:
   - a text under 20 or over 2000 characters (the form refuses it); ask
     whether to skip it or to let the user shorten it;
   - a place that is not in Małopolska, or that the register does not
     know;
   - a request that looks like real personal data (a full name with an
     address, a real-looking phone, a PESEL): the gate redacts it, but
     the route keeps the redacted text in the store; ask before playing
     it;
   - a crisis or a harmful text: it plays (the app shows human help or
     declines), but say so in the table.

The fiction rule of the playbook does not apply to imported texts: the
user chose them. Overlap with `tests/problems/` is allowed too.
