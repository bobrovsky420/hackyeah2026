import type { RoleCode } from "@/lib/contracts";
import type { MessageKey } from "@/lib/i18n";

/*
 * The Middleman of module VII ("Dostosuj do mojej instytucji"): what an
 * institution says of itself before it gets a service plan for an
 * innovation. Codes for the form and the API; labels in messages/pl.json.
 */

export const INSTITUTIONS = {
  gmina: { label: "adapt.institution.gmina", role: "urzad-gminy" },
  ops: { label: "adapt.institution.ops", role: "pracownik-instytucji" },
  placowka: { label: "adapt.institution.placowka", role: "pracownik-instytucji" },
  ngo: { label: "adapt.institution.ngo", role: "organizacja-spoleczna" },
  mieszkancy: { label: "adapt.institution.mieszkancy", role: "mieszkaniec" },
} as const satisfies Record<string, { label: MessageKey; role: RoleCode }>;
export type Institution = keyof typeof INSTITUTIONS;
export const INSTITUTION_CODES = Object.keys(INSTITUTIONS) as Institution[];

export const CONSTRAINTS = {
  budzet: "adapt.constraint.budzet",
  etat: "adapt.constraint.etat",
  lokal: "adapt.constraint.lokal",
  dojazd: "adapt.constraint.dojazd",
  szybko: "adapt.constraint.szybko",
  cyfrowe: "adapt.constraint.cyfrowe",
} as const satisfies Record<string, MessageKey>;
export type Constraint = keyof typeof CONSTRAINTS;
export const CONSTRAINT_CODES = Object.keys(CONSTRAINTS) as Constraint[];

export const SCALES = {
  pilot: "adapt.scale.pilot",
  grupa: "adapt.scale.grupa",
  gmina: "adapt.scale.gmina",
} as const satisfies Record<string, MessageKey>;
export type Scale = keyof typeof SCALES;
export const SCALE_CODES = Object.keys(SCALES) as Scale[];

export const NOTE_MAX = 500;

export const isInstitution = (value: unknown): value is Institution => typeof value === "string" && value in INSTITUTIONS;
export const isScale = (value: unknown): value is Scale => typeof value === "string" && value in SCALES;

/** What the institution asks with. */
export interface AdaptInput {
  institution: Institution;
  place_terc: string | null;
  constraints: Constraint[];
  scale: Scale;
  /** The one of the innovation's target groups the service is mainly for; null when it serves one only. */
  target_group: string | null;
  /** Screened by the gate before it enters a prompt; null when empty. */
  note: string | null;
}

/** The service plan, every text ready to show: the model's parts that passed, the rest from the data and templates. */
export interface ServicePlan {
  innovation_id: string;
  title: string;
  institution_label: string;
  place_name: string | null;
  scale_label: string;
  /** The target group the service is mainly for, in words; null when not chosen. */
  group_label: string | null;
  /** "Usługa w Twojej instytucji". */
  service: string;
  /** "Kto i co robi". */
  roles: string[];
  /** "Jak dopasować do Twoich warunków", one per constraint at most. */
  adaptations: { constraint: string | null; text: string }[];
  /** "Pierwsze kroki", three. */
  first_steps: string[];
  /** "Czego potrzeba", from the record. */
  needs: { requires: string[]; cost: string; time: string; evidence: string };
  /** "Skąd finansowanie", from the selector of the route (8.7) or the catalogue's paths. */
  paths: { name: string; decision_maker: string; amount: string; timing: string; source_url: string }[];
  /** "Kto już to wdrożył", nearest first when a gmina is given. */
  implementers: { organisation: string | null; place: string | null; year: number | null }[];
  source: "model" | "template";
  prompt_version: string | null;
}
