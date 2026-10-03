import type { RoleCode, Need, Readiness } from "@/lib/contracts";

/*
 * The example entries every fresh store starts with (memory.ts): three
 * needs for the console and the map (the prototype's store had them from
 * the start), and the two consented and verified team entries of the
 * readiness registry (FR-6.5). All are marked `example`. A store that
 * exists already keeps what it has; deleting its file starts again from
 * these.
 */

/** The version of the consent texts the forms record (12.6). */
export const CONSENT_VERSION = "zgoda-prototyp-v1";

const SEEDED_AT = "2026-09-29T09:00:00+02:00";

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
    retention_until: "2027-09-29",
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
