import { createHash } from "node:crypto";
import type { RoleCode, Idea, Mentor, Need, PartnershipPost, Readiness, Thread } from "@/lib/contracts";

/*
 * The example entries every fresh store starts with (memory.ts): three
 * needs for the map and the brief (the prototype's store had them from
 * the start), the two consented and verified team entries of the
 * readiness registry (FR-6.5), one idea card of the team (module III),
 * its similar innovations already stored, and for module V two mentors,
 * two conversations and one approved partnership post. All are marked
 * `example`. A store that
 * exists already keeps what it has; deleting its file starts again from
 * these.
 */

/** The version of the consent texts the forms record (12.6). */
export const CONSENT_VERSION = "zgoda-prototyp-v1";

const SEEDED_AT = "2026-10-03T09:00:00+02:00";

function exampleNeed(
  id: string,
  placeTerc: string,
  role: RoleCode,
  text: string,
  groups: string[],
  publish: boolean,
  routeId: string | null = null,
): Need {
  return {
    id,
    created_at: SEEDED_AT,
    route_id: routeId,
    problem_text: text,
    summary_pl: text,
    place_terc: placeTerc,
    role,
    target_groups: groups,
    domains: [],
    reporter: { name: null, organisation: null, email: null },
    consents: {
      store: true,
      publish_anonymised: publish,
      contact: false,
      text_version: CONSENT_VERSION,
      timestamp: SEEDED_AT,
    },
    status: "nowa",
    moderation: { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null },
    cluster_id: null,
    nearest_matches: [],
    brief_id: null,
    note_pl: null,
    example: true,
  };
}

export function exampleNeeds(): Need[] {
  return [
    exampleNeed(
      "nd-przyklad-1",
      "1207062",
      "pracownik-instytucji",
      "Samotni seniorzy w gminie wiejskiej, brak domu dziennego pobytu.",
      ["seniorzy"],
      true,
    ),
    exampleNeed(
      "nd-przyklad-2",
      "1211011",
      "organizacja-spoleczna",
      "Młodzież nie ma gdzie się spotykać po lekcjach.",
      ["dzieci-mlodziez-rodziny"],
      false,
      "przyklad-mlodziez",
    ),
    exampleNeed(
      "nd-przyklad-3",
      "1261011",
      "mieszkaniec",
      "Dzieci z rodzin z Ukrainy potrzebują pomocy w odrabianiu lekcji.",
      ["dzieci-mlodziez-rodziny", "cudzoziemcy"],
      true,
      "przyklad-dzieci",
    ),
  ];
}

function teamEntry(id: string, name: string, placeTerc: string, topics: string[]): Readiness {
  return {
    id,
    created_at: SEEDED_AT,
    display_name: name,
    // Organisations only: the topics include children, where individuals are never named (FR-6.5).
    is_organisation: true,
    place_terc: placeTerc,
    topics,
    // A reserved example domain: the channel never leaves the store, and nobody may be reached through it.
    channel: { type: "email", value: `${id}@example.org` },
    consent_display_name: true,
    consent: { text_version: CONSENT_VERSION, timestamp: SEEDED_AT },
    verification: { status: "zweryfikowane", reviewer: "zespół HubMI.pl", decided_at: SEEDED_AT },
    retention_until: "2027-10-03",
    note_pl: null,
    example: true,
  };
}

/** FR-6.5: "Seeded with two consented and verified team entries". */
export function exampleReadiness(): Readiness[] {
  return [
    teamEntry("gt-przyklad-1", "Zespół HubMI.pl (wpis przykładowy)", "1261011", ["seniorzy", "dzieci-mlodziez-rodziny"]),
    teamEntry("gt-przyklad-2", "Zespół HubMI.pl, Laskowa (wpis przykładowy)", "1207062", ["seniorzy", "inne"]),
  ];
}

/** Module III: one idea card of the team, with the similar innovations its page shows, so the page has a stable address. */
export function exampleIdeas(): Idea[] {
  return [
    {
      id: "pm-przyklad-1",
      created_at: SEEDED_AT,
      kind: "pomysl",
      title: "Sąsiedzkie spotkania przy wspólnym gotowaniu (wpis przykładowy)",
      description:
        "Raz w tygodniu seniorzy z sołectwa gotują razem w świetlicy z pomocą młodzieży z pobliskiej szkoły. Po obiedzie zostają na rozmowę i gry.",
      essence: "Wspólne gotowanie daje powód, żeby wyjść z domu, i łączy pokolenia przy jednym stole.",
      for_whom: "Samotni seniorzy w małych wsiach i młodzież, która chce działać jako wolontariusze.",
      target_groups: ["seniorzy", "dzieci-mlodziez-rodziny"],
      stage: "pomysl",
      place_terc: "1207062",
      // A reserved example domain: the contact never leaves the store.
      author: { display_name: "Zespół HubMI.pl (wpis przykładowy)", is_organisation: true, email: "pm-przyklad-1@example.org" },
      consents: { store: true, publish: true, text_version: CONSENT_VERSION, timestamp: SEEDED_AT },
      moderation: { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null },
      similar: [
        {
          innovation_id: "inn-nat-649",
          fit_score: 74,
          what_fits_pl: "Łączy samotnych seniorów z uczniami w regularnych spotkaniach, które prowadzi młodzież.",
          what_lacks_pl: "Spotkania dotyczą nauki obsługi komputera, nie wspólnego gotowania.",
        },
        {
          innovation_id: "inn-nat-biblioteka-senior-dla-seniora",
          fit_score: 58,
          what_fits_pl: "Opiera się na sąsiedzkiej pomocy i spotkaniach osób starszych.",
          what_lacks_pl: "Dotyczy wypożyczania książek, nie wspólnych posiłków.",
        },
      ],
      status: "w-analizie",
      reply: {
        text_pl:
          "Dziękujemy za fiszkę. Pomysł pasuje do tematu najbliższego naboru inkubatora. Zapraszamy na konsultację z opiekunem kategorii seniorzy.",
        at: SEEDED_AT,
        by: "Dział Innowacji Społecznych ROPS (wpis przykładowy)",
      },
      retention_until: "2027-10-03",
      note_pl: null,
      example: true,
    },
  ];
}

// ------------------------------------------------ communication (module V)

/**
 * The keys of the example conversations: the demo and the screen checks
 * open them with these. Public on purpose, so they open only example data.
 */
export const EXAMPLE_THREAD_KEYS = { question: "przyklad-rozmowa-1", partnership: "przyklad-rozmowa-2", mentor: "przyklad-mentor-1" } as const;

const sha256 = (key: string) => createHash("sha256").update(key).digest("hex");
const REPLIED_AT = "2026-10-03T11:30:00+02:00";

export function exampleMentors(): Mentor[] {
  return [
    {
      id: "mt-przyklad-1",
      name: "Ekspertka ds. usług dla seniorów (wpis przykładowy)",
      expertise_pl: "Usługi opiekuńcze, kluby seniora, wolontariat międzypokoleniowy.",
      target_groups: ["seniorzy"],
      active: true,
      updated_at: SEEDED_AT,
      example: true,
    },
    {
      id: "mt-przyklad-2",
      name: "Ekspert ds. ekonomii społecznej (wpis przykładowy)",
      expertise_pl: "Spółdzielnie socjalne, zlecanie zadań publicznych, finansowanie z FIO i PROO.",
      target_groups: ["rynek-pracy", "inne"],
      active: true,
      updated_at: SEEDED_AT,
      example: true,
    },
  ];
}

export function exampleThreads(): Thread[] {
  const consent = { text_version: CONSENT_VERSION, timestamp: SEEDED_AT };
  return [
    {
      id: "rz-przyklad-1",
      created_at: SEEDED_AT,
      updated_at: REPLIED_AT,
      topic: "mentor",
      subject: "Jak zacząć klub seniora w małej wsi? (wpis przykładowy)",
      author: { display_name: "Koło Gospodyń Wiejskich (wpis przykładowy)", organisation: null, email: null, sector: "ngo" },
      place_terc: "1207062",
      target_groups: ["seniorzy"],
      ref: { type: "innovation", id: "inn-nat-649" },
      access_hash: sha256(EXAMPLE_THREAD_KEYS.question),
      mentor: { id: "mt-przyklad-1", name: "Ekspertka ds. usług dla seniorów (wpis przykładowy)", key_hash: sha256(EXAMPLE_THREAD_KEYS.mentor) },
      messages: [
        {
          id: "wd-przyklad-1",
          at: SEEDED_AT,
          author: "uzytkownik",
          name: null,
          text: "Chcemy zacząć spotkania dla seniorów w naszej świetlicy. Od czego zacząć i skąd wziąć pieniądze na pierwszy rok?",
        },
        {
          id: "wd-przyklad-2",
          at: "2026-10-03T10:15:00+02:00",
          author: "rops",
          name: "Dział Innowacji Społecznych ROPS",
          text: "Dziękujemy za pytanie. Zaprosiliśmy do rozmowy ekspertkę, która prowadziła podobne kluby.",
        },
        {
          id: "wd-przyklad-3",
          at: REPLIED_AT,
          author: "mentor",
          name: "Ekspertka ds. usług dla seniorów (wpis przykładowy)",
          text: "Na start wystarczy stały termin raz w tygodniu i jedna osoba prowadząca. Na pierwszy rok sprawdźcie mały grant z gminy albo fundusz sołecki.",
        },
      ],
      status: "w-toku",
      consent,
      retention_until: "2027-10-03",
      note_pl: null,
      example: true,
    },
    {
      id: "rz-przyklad-2",
      created_at: SEEDED_AT,
      updated_at: SEEDED_AT,
      topic: "partnerstwo",
      subject: "Szukamy szkoły do wolontariatu przy zakupach dla seniorów (wpis przykładowy)",
      author: { display_name: "Stowarzyszenie Razem (wpis przykładowy)", organisation: null, email: null, sector: "ngo" },
      place_terc: "1261011",
      target_groups: ["seniorzy", "dzieci-mlodziez-rodziny"],
      ref: { type: "partnership", id: "pp-przyklad-1" },
      access_hash: sha256(EXAMPLE_THREAD_KEYS.partnership),
      mentor: null,
      messages: [
        {
          id: "wd-przyklad-4",
          at: SEEDED_AT,
          author: "uzytkownik",
          name: null,
          text: "Dodaliśmy ogłoszenie na tablicę partnerstw. Prosimy o kontakt, gdy zgłosi się szkoła.",
        },
      ],
      status: "nowa",
      consent,
      retention_until: "2027-10-03",
      note_pl: null,
      example: true,
    },
  ];
}

export function examplePosts(): PartnershipPost[] {
  return [
    {
      id: "pp-przyklad-1",
      created_at: SEEDED_AT,
      kind: "szukam",
      title: "Szukamy szkoły do wolontariatu przy zakupach dla seniorów (wpis przykładowy)",
      description:
        "Organizujemy pomoc w zakupach dla samotnych seniorów w Krakowie. Szukamy szkoły, której uczniowie raz w tygodniu pomogą jako wolontariusze pod opieką nauczyciela.",
      sector: "ngo",
      seeking: ["instytucja", "jst"],
      place_terc: "1261011",
      target_groups: ["seniorzy", "dzieci-mlodziez-rodziny"],
      author: { display_name: "Stowarzyszenie Razem (wpis przykładowy)", organisation: null, email: null },
      thread_id: "rz-przyklad-2",
      moderation: { status: "zatwierdzone", reviewer: "zespół HubMI.pl", decided_at: SEEDED_AT, reason_pl: null },
      retention_until: "2027-10-03",
      example: true,
    },
  ];
}
