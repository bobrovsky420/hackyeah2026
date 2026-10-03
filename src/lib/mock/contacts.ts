/** From data/advisors.yaml (the ROPS contact page, read on 28 September 2026). */
export const ropsDepartment = {
  name: "Dział Innowacji Społecznych ROPS w Krakowie",
  email: "iws@rops.krakow.pl",
  phone: "+48 12 422 06 36 wew. 34",
  phoneHref: "tel:+48124220636",
  hours: "od poniedziałku do piątku, 8:00-16:00",
};

export interface Helpline {
  number: string;
  href: string;
  name: string;
  /** Which entry path of S10 lists the line first (FR-12.5). */
  forWhom: "self" | "someone" | "both";
}

/*
 * The helplines of screen S10 as listed in the specification. Opening hours
 * are left out until the team verifies them (FR-12.5 asks for honest hours).
 */
export const emergencyNumber: Helpline = {
  number: "112",
  href: "tel:112",
  name: "Numer alarmowy. Dzwoń, gdy zagrożone jest życie lub zdrowie.",
  forWhom: "both",
};

export const helplines: Helpline[] = [
  {
    number: "116 123",
    href: "tel:116123",
    name: "Telefon zaufania dla dorosłych w kryzysie emocjonalnym",
    forWhom: "self",
  },
  {
    number: "800 702 222",
    href: "tel:800702222",
    name: "Centrum wsparcia dla osób dorosłych w kryzysie psychicznym",
    forWhom: "self",
  },
  {
    number: "800 120 002",
    href: "tel:800120002",
    name: "Niebieska Linia dla osób doznających przemocy domowej",
    forWhom: "both",
  },
  {
    number: "116 111",
    href: "tel:116111",
    name: "Telefon zaufania dla dzieci i młodzieży",
    forWhom: "someone",
  },
  {
    number: "800 121 212",
    href: "tel:800121212",
    name: "Dziecięcy Telefon Zaufania Rzecznika Praw Dziecka",
    forWhom: "someone",
  },
];
