import type { RoleCode } from "@/lib/contracts";
import type { Dataset } from "@/lib/data/to-contracts";
import { roleNoun } from "@/lib/labels";

/*
 * The volatile part of both prompts (9.3): the reader's context as data
 * and the need inside <potrzeba> tags, last. The need was redacted by the
 * gate; angle brackets in it are replaced, so no text can close the tag and
 * speak outside it (FR-2.4).
 */

/** The need inside its tags, with every "<" and ">" of the text replaced. */
export function wrapNeed(text: string): string {
  const inert = text.replace(/</g, "‹").replace(/>/g, "›").trim();
  return `<potrzeba>\n${inert}\n</potrzeba>`;
}

export interface ReaderContext {
  placeTerc: string | null;
  role: RoleCode | null;
  targetGroups: string[];
}

/** The place as "Radziemice, gmina wiejska, powiat proszowicki", or null. */
export function placeDescription(dataset: Dataset, terc: string | null): string | null {
  const gmina = terc ? dataset.gminaByTerc.get(terc) : undefined;
  return gmina ? `${gmina.name}, ${gmina.kind}, powiat ${gmina.powiat}` : null;
}

/** The reader's context as one JSON line; keys are Polish for the Polish prompt, values codes or names. */
export function readerContextLine(dataset: Dataset, reader: ReaderContext): string {
  return JSON.stringify({
    miejsce: placeDescription(dataset, reader.placeTerc),
    rola: reader.role ? roleNoun(reader.role) : null,
    grupy_wskazane_przez_osobe: reader.targetGroups,
  });
}
