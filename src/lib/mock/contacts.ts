import type { Department, Helpline } from "@/lib/contracts/contacts";

/** From data/advisors.yaml (the ROPS contact page, read on 28 September 2026). */
export const ropsDepartment: Department = {
  name: "Dział Innowacji Społecznych ROPS w Krakowie",
  email: "iws@rops.krakow.pl",
  phone: "+48 12 422 06 36 wew. 34",
  hours: "od poniedziałku do piątku, 8:00-16:00",
};

/*
 * The helplines of screen S10 as listed in the specification, the fallback
 * when data/helplines.yaml cannot be loaded. Opening hours are left out:
 * the verified ones live in the data file (FR-12.5 asks for honest hours).
 */
export const helplines: { alarm: Helpline[]; support: Helpline[] } = {
  alarm: [
    {
      id: "hl-112",
      number: "112",
      href: "tel:112",
      group: "alarm",
      name: "Numer alarmowy. Dzwoń, gdy zagrożone jest życie lub zdrowie.",
      short: "gdy zagrożone jest życie lub zdrowie",
      forWhom: "both",
      hours: null,
      whoFor: null,
    },
  ],
  support: [
    {
      id: "hl-116123",
      number: "116 123",
      href: "tel:116123",
      group: "support",
      name: "Telefon zaufania dla dorosłych w kryzysie emocjonalnym",
      short: "dla dorosłych w kryzysie emocjonalnym",
      forWhom: "self",
      hours: null,
      whoFor: null,
    },
    {
      id: "hl-800702222",
      number: "800 702 222",
      href: "tel:800702222",
      group: "support",
      name: "Centrum wsparcia dla osób dorosłych w kryzysie psychicznym",
      short: "dla dorosłych w kryzysie psychicznym",
      forWhom: "self",
      hours: null,
      whoFor: null,
    },
    {
      id: "hl-800120002",
      number: "800 120 002",
      href: "tel:800120002",
      group: "support",
      name: "Niebieska Linia dla osób doznających przemocy domowej",
      short: "Niebieska Linia, przemoc domowa",
      forWhom: "both",
      hours: null,
      whoFor: null,
    },
    {
      id: "hl-116111",
      number: "116 111",
      href: "tel:116111",
      group: "support",
      name: "Telefon zaufania dla dzieci i młodzieży",
      short: "dla dzieci i młodzieży",
      forWhom: "someone",
      hours: null,
      whoFor: null,
    },
    {
      id: "hl-800121212",
      number: "800 121 212",
      href: "tel:800121212",
      group: "support",
      name: "Dziecięcy Telefon Zaufania Rzecznika Praw Dziecka",
      short: "Dziecięcy Telefon Zaufania",
      forWhom: "someone",
      hours: null,
      whoFor: null,
    },
  ],
};
