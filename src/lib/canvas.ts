import type { IdeaKind, IdeaStage } from "@/lib/contracts";
import { t, type MessageKey } from "@/lib/i18n";

/*
 * The CANVAS application (wniosek CANVAS) of module III: the INNO AGH
 * Social Innovation Canvas, version 1.0 of 5 May 2026, based on the Social
 * Innovation Canvas of The New Global School, asked one block at a time.
 * The steps are data: the wizard renders them, the API checks an
 * application against them and the card's page and file print them, so a
 * question is added in one place. Its texts live in messages/pl.json under
 * canvas.<field id>.
 *
 * The first five fields are the idea card's own (kind, title, description,
 * essence, for whom), so a CANVAS application is also an ordinary card:
 * the panel, the similar innovations and the trends read it unchanged.
 */

export const CANVAS_VERSION = "inno-agh-1.0";

/** A field of the card itself rather than of the canvas. */
export const CORE_FIELDS = ["kind", "title", "description", "essence", "for_whom"] as const;
export type CoreField = (typeof CORE_FIELDS)[number];

export type CanvasField =
  /** One choice, required: a scale of the canvas, lowest or first level first. */
  | { id: string; type: "choice"; options: readonly string[]; described?: boolean }
  /** Any number of choices (at most `max`), with an "inna odpowiedź" text when `other`. */
  | { id: string; type: "multi"; options: readonly string[]; max?: number; other?: boolean }
  /** A free text; `prompts` helper questions are shown above it. */
  | { id: string; type: "text"; min?: number; max: number; rows?: number; prompts?: number }
  /** The partners of the "konstelacja partnerów": a name, how each helps and its status. */
  | { id: string; type: "partners" };

export interface CanvasStep {
  id: string;
  fields: readonly CanvasField[];
}

export const PARTNER_ROLES = ["koszty", "zasieg", "wartosc"] as const;
export const PARTNER_STATUSES = ["potwierdzony", "rozmowy", "potencjalny"] as const;
export const MAX_PARTNERS = 8;
export const OTHER_MAX = 200;
export const PARTNER_NAME_MAX = 120;

export interface CanvasPartner {
  name: string;
  roles: (typeof PARTNER_ROLES)[number][];
  status: (typeof PARTNER_STATUSES)[number];
}

/** The answers of the wizard: a code, a list of codes or a text per field; `<id>_inne` holds an "other" text. */
export type CanvasAnswers = Record<string, string | string[]>;

/** The canvas as stored with the card; the five card fields are not repeated in it. */
export interface IdeaCanvas {
  version: string;
  answers: CanvasAnswers;
  partners: CanvasPartner[];
}

const IMPACT_LEVELS = ["maly", "mozliwy", "wyrazny", "silny"] as const;

export const CANVAS_STEPS: readonly CanvasStep[] = [
  {
    id: "start",
    fields: [
      { id: "kind", type: "choice", options: ["pomysl", "dobra-praktyka"] },
      { id: "title", type: "text", min: 3, max: 120 },
      { id: "description", type: "text", min: 20, max: 1500, rows: 5 },
    ],
  },
  {
    id: "problem",
    fields: [
      { id: "intensity", type: "choice", described: true, options: ["bardzo-powazny", "mocno", "utrudnia", "lekko"] },
      { id: "frequency", type: "choice", described: true, options: ["bardzo-czesto", "czesto", "czasami", "rzadko"] },
      { id: "scale", type: "choice", described: true, options: ["pojedyncze", "waska", "duza", "bardzo-szeroka"] },
    ],
  },
  {
    id: "actors",
    fields: [
      { id: "supporters", type: "text", max: 1000, rows: 4, prompts: 5 },
      { id: "blockers", type: "text", max: 1000, rows: 4, prompts: 5 },
    ],
  },
  {
    id: "solution",
    fields: [
      { id: "essence", type: "text", min: 10, max: 1000, rows: 4 },
      { id: "clarity", type: "choice", described: true, options: ["niejasne", "czesciowo", "jasne", "wyjasniaja"] },
      { id: "readiness", type: "choice", described: true, options: ["pomysl", "prototyp", "przetestowane", "gotowe"] },
      { id: "value", type: "choice", described: true, options: ["koszt-wiekszy", "podobne", "korzysc-wieksza", "bardzo-duza"] },
    ],
  },
  {
    id: "recipients",
    fields: [
      { id: "for_whom", type: "text", min: 3, max: 500, rows: 2 },
      {
        id: "users",
        type: "multi",
        other: true,
        options: ["dzieci", "mlodziez", "rodzice", "seniorzy", "niepelnosprawnosc", "nauczyciele", "pracownicy", "kryzys", "organizacje", "mieszkancy"],
      },
      {
        id: "payers",
        type: "multi",
        other: true,
        options: ["uzytkownik", "rodzic", "szkola", "firma", "gmina", "fundacja", "grantodawca", "sponsor", "publiczna", "pracodawca"],
      },
      {
        id: "authorities",
        type: "multi",
        other: true,
        options: [
          "dyrektor",
          "nauczyciel",
          "lekarz",
          "terapeuta",
          "pracownik-socjalny",
          "urzad",
          "lider",
          "organizacja",
          "rodzic",
          "opiekun",
          "menedzer",
          "ekspert",
          "finansujacy",
        ],
      },
    ],
  },
  {
    id: "value",
    fields: [
      {
        id: "emotional",
        type: "multi",
        max: 3,
        other: true,
        options: ["bezpieczenstwo", "niezaleznosc", "spokoj", "motywacja", "pewnosc", "wlaczenie", "samotnosc", "widzialnosc", "sprawczosc", "nastroj", "zdrowie", "zadowolenie"],
      },
      {
        id: "functional",
        type: "multi",
        max: 3,
        other: true,
        options: ["koszty", "zasieg", "czas", "obciazenie", "skutecznosc", "bezpieczenstwo", "jakosc", "wplyw", "proces", "srodowisko", "dostepnosc", "decyzje"],
      },
    ],
  },
  {
    id: "costs",
    fields: [
      { id: "fixed", type: "multi", other: true, options: ["zespol", "przestrzen", "aplikacja", "narzedzia", "koordynacja", "ksiegowosc", "promocja", "sprzet"] },
      { id: "variable", type: "multi", other: true, options: ["materialy", "specjalista", "dojazdy", "catering", "wydruk", "wsparcie"] },
    ],
  },
  {
    id: "revenue",
    fields: [
      { id: "income", type: "choice", described: true, options: ["nie-wiemy", "pomysl", "propozycja", "potwierdzenie"] },
      { id: "income_text", type: "text", max: 600, rows: 3 },
      { id: "growth", type: "choice", described: true, options: ["brak", "szanse", "sciezki", "powielanie"] },
      { id: "growth_text", type: "text", max: 600, rows: 3 },
    ],
  },
  {
    id: "channels",
    fields: [
      {
        id: "direct",
        type: "multi",
        options: ["strona", "formularz", "sklep", "telefon", "spotkania", "warsztaty", "media", "aplikacja", "newsletter", "wydarzenia"],
      },
      {
        id: "through",
        type: "multi",
        options: ["szkola", "gmina", "organizacja", "ekspert", "lekarz", "nauczyciel", "pracownik-socjalny", "lider", "firma", "partner", "ambasador", "handlowiec"],
      },
      {
        id: "extra",
        type: "multi",
        other: true,
        options: ["kampania", "webinary", "platforma", "wydarzenia-lokalne", "ambasadorzy", "materialy", "rekomendacje", "instytucje", "newsletter", "spolecznosc"],
      },
    ],
  },
  { id: "partners", fields: [{ id: "partners", type: "partners" }] },
  {
    id: "impact",
    fields: [
      { id: "impact_person", type: "choice", described: true, options: IMPACT_LEVELS },
      { id: "impact_person_text", type: "text", max: 600, rows: 3 },
      { id: "impact_community", type: "choice", described: true, options: IMPACT_LEVELS },
      { id: "impact_community_text", type: "text", max: 600, rows: 3 },
      { id: "impact_environment", type: "choice", described: true, options: IMPACT_LEVELS },
      { id: "impact_environment_text", type: "text", max: 600, rows: 3 },
    ],
  },
];

/** The wizard's steps: the canvas's blocks, the author's contact and the summary. */
export const STEP_COUNT = CANVAS_STEPS.length + 2;

export const CANVAS_FIELDS: readonly CanvasField[] = CANVAS_STEPS.flatMap((step) => step.fields);

/*
 * The message keys of a field, built from its id. The unit test of the
 * canvas checks that every key exists in messages/pl.json.
 */
const key = (text: string) => text as MessageKey;
export const stepTitleKey = (step: string) => key(`canvas.step.${step}`);
export const stepLeadKey = (step: string) => key(`canvas.step.${step}.lead`);
export const labelKey = (field: string) => key(`canvas.${field}.label`);
export const hintKey = (field: string) => key(`canvas.${field}.hint`);
export const promptKey = (field: string, index: number) => key(`canvas.${field}.q${index + 1}`);
export const optionKey = (field: string, code: string) => key(`canvas.${field}.${code}`);
export const optionDescriptionKey = (field: string, code: string) => key(`canvas.${field}.${code}.opis`);
export const otherKey = (field: string) => `${field}_inne`;

const isCore = (id: string): id is CoreField => (CORE_FIELDS as readonly string[]).includes(id);

function text(answers: CanvasAnswers, id: string): string {
  const value = answers[id];
  return typeof value === "string" ? value.trim() : "";
}

function list(answers: CanvasAnswers, id: string): string[] {
  const value = answers[id];
  return Array.isArray(value) ? value : [];
}

/** An error of a step: the id of the element to focus and its message. */
export interface CanvasError {
  fieldId: string;
  message: string;
}

/** The DOM id of a field's first control, where an error link moves focus. */
export function controlId(field: CanvasField): string {
  if (field.type === "choice" || field.type === "multi") return `${field.id}-0`;
  if (field.type === "partners") return "partner-0-nazwa";
  return field.id;
}

/** The errors of one step; the wizard checks a step before moving on, the API every step. */
export function stepErrors(step: CanvasStep, answers: CanvasAnswers, partners: CanvasPartner[]): CanvasError[] {
  const errors: CanvasError[] = [];
  for (const field of step.fields) {
    const fieldId = controlId(field);
    if (field.type === "choice") {
      if (!field.options.includes(text(answers, field.id))) errors.push({ fieldId, message: t(key(`canvas.${field.id}.error`)) });
    } else if (field.type === "multi") {
      const chosen = list(answers, field.id);
      if (field.max && chosen.length > field.max) errors.push({ fieldId, message: t("canvas.error.tooMany", { max: field.max }) });
      if (text(answers, otherKey(field.id)).length > OTHER_MAX) errors.push({ fieldId: otherKey(field.id), message: t("canvas.error.otherTooLong", { max: OTHER_MAX }) });
    } else if (field.type === "text") {
      const length = text(answers, field.id).length;
      if (field.min && length < field.min) errors.push({ fieldId, message: t(key(`canvas.${field.id}.error`)) });
      else if (length > field.max) errors.push({ fieldId, message: t("canvas.error.tooLong", { max: field.max }) });
    } else {
      partners.forEach((partner, index) => {
        if (!partner.name.trim()) errors.push({ fieldId: `partner-${index}-nazwa`, message: t("canvas.partners.nameError", { number: index + 1 }) });
      });
    }
  }
  return errors;
}

/** The checked parts of a posted application, or the id of the first field that failed. */
export type ParsedCanvas =
  | { ok: true; core: Record<CoreField, string> & { kind: IdeaKind }; canvas: IdeaCanvas }
  | { ok: false; field: string };

/**
 * Checks a posted application against the steps: codes from their lists
 * only, texts within their limits, at most MAX_PARTNERS partners. Unknown
 * keys are dropped. The texts are not screened here; the API does that.
 */
export function parseCanvas(value: unknown, rawPartners: unknown): ParsedCanvas {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false, field: "canvas" };
  const raw = value as Record<string, unknown>;
  const answers: CanvasAnswers = {};
  for (const field of CANVAS_FIELDS) {
    const given = raw[field.id];
    if (field.type === "multi") {
      const chosen = Array.isArray(given) ? [...new Set(given.filter((item): item is string => typeof item === "string" && field.options.includes(item)))] : [];
      answers[field.id] = chosen;
      const other = raw[otherKey(field.id)];
      if (field.other && typeof other === "string" && other.trim()) answers[otherKey(field.id)] = other.trim();
    } else if (field.type !== "partners" && typeof given === "string") {
      answers[field.id] = given.trim();
    }
  }
  if (Array.isArray(rawPartners) && rawPartners.length > MAX_PARTNERS) return { ok: false, field: "partners" };
  const partners: CanvasPartner[] = (Array.isArray(rawPartners) ? rawPartners : []).flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) return [];
    const partner = item as Record<string, unknown>;
    const name = typeof partner.name === "string" ? partner.name.trim().slice(0, PARTNER_NAME_MAX) : "";
    const status = PARTNER_STATUSES.find((code) => code === partner.status) ?? "potencjalny";
    const roles = Array.isArray(partner.roles) ? PARTNER_ROLES.filter((code) => (partner.roles as unknown[]).includes(code)) : [];
    return name ? [{ name, roles, status }] : [];
  });
  for (const step of CANVAS_STEPS) {
    const errors = stepErrors(step, answers, partners);
    if (errors.length > 0) return { ok: false, field: errors[0].fieldId };
  }
  const core = Object.fromEntries(CORE_FIELDS.map((id) => [id, text(answers, id)])) as Record<CoreField, string> & { kind: IdeaKind };
  for (const id of CORE_FIELDS) delete answers[id];
  return { ok: true, core, canvas: { version: CANVAS_VERSION, answers, partners } };
}

/** The canvas's free texts in a fixed order, for the gate to screen as one text and give back redacted. */
export function canvasTexts(canvas: IdeaCanvas): string[] {
  const texts: string[] = [];
  for (const field of CANVAS_FIELDS) {
    if (isCore(field.id)) continue;
    if (field.type === "text") texts.push(text(canvas.answers, field.id));
    if (field.type === "multi" && field.other) texts.push(text(canvas.answers, otherKey(field.id)));
  }
  for (const partner of canvas.partners) texts.push(partner.name);
  return texts;
}

/** The canvas with its free texts replaced, in the order of canvasTexts. */
export function withCanvasTexts(canvas: IdeaCanvas, texts: readonly string[]): IdeaCanvas {
  const answers = { ...canvas.answers };
  let index = 0;
  const next = () => texts[index++] ?? "";
  for (const field of CANVAS_FIELDS) {
    if (isCore(field.id)) continue;
    if (field.type === "text") answers[field.id] = next();
    if (field.type === "multi" && field.other) {
      const other = next();
      if (other) answers[otherKey(field.id)] = other;
      else delete answers[otherKey(field.id)];
    }
  }
  const partners = canvas.partners.map((partner) => ({ ...partner, name: next() }));
  return { ...canvas, answers, partners };
}

/** The card's stage from the canvas's readiness: "gotowe do wdrożenia" has been tested but does not yet run for good. */
export function stageFromReadiness(readiness: string): IdeaStage {
  if (readiness === "prototyp") return "prototyp";
  if (readiness === "przetestowane" || readiness === "gotowe") return "test";
  return "pomysl";
}

/** The target groups of the catalogue that the canvas's "główny użytkownik" names, for the needs bank's trends. */
export function targetGroupsFromUsers(users: readonly string[]): string[] {
  const groups = new Set<string>();
  for (const user of users) {
    if (user === "dzieci" || user === "mlodziez" || user === "rodzice") groups.add("dzieci-mlodziez-rodziny");
    if (user === "seniorzy") groups.add("seniorzy");
  }
  return [...groups];
}

/** One answered block of the canvas for the card's page, the panel and the file. */
export interface CanvasSection {
  id: string;
  title: string;
  rows: { label: string; value: string }[];
}

/**
 * The answered fields of the canvas, block by block; empty answers are left
 * out. The card's own fields too, unless `core` (the wizard's summary, which
 * also keeps the blocks without answers when `empty`).
 */
export function canvasSections(canvas: IdeaCanvas, { core = false, empty = false } = {}): CanvasSection[] {
  return CANVAS_STEPS.flatMap((step) => {
    const rows: CanvasSection["rows"] = [];
    for (const field of step.fields) {
      if (isCore(field.id) && !core) continue;
      const label = t(labelKey(field.id));
      if (field.type === "choice") {
        const code = text(canvas.answers, field.id);
        if (field.options.includes(code)) rows.push({ label, value: t(optionKey(field.id, code)) });
      } else if (field.type === "multi") {
        const values = list(canvas.answers, field.id).map((code) => t(optionKey(field.id, code)));
        const other = text(canvas.answers, otherKey(field.id));
        if (other) values.push(other);
        if (values.length > 0) rows.push({ label, value: values.join(", ") });
      } else if (field.type === "text") {
        const value = text(canvas.answers, field.id);
        if (value) rows.push({ label, value });
      } else {
        for (const partner of canvas.partners) {
          const roles = partner.roles.map((role) => t(optionKey("partner-role", role)).toLowerCase());
          const status = t(optionKey("partner-status", partner.status)).toLowerCase();
          rows.push({ label: partner.name, value: [status, ...roles].join(", ") });
        }
      }
    }
    return rows.length > 0 || empty ? [{ id: step.id, title: t(stepTitleKey(step.id)), rows }] : [];
  });
}
