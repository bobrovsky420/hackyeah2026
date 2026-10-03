/** A legal or funding path, schema 8.7 (one YAML file per path in data/paths/). */
export interface ImplementationPath {
  id: string;
  name_pl: string;
  legal_basis_pl: string;
  applicant_types: string[];
  amount_note_pl: string;
  timing: { kind: "rolling" | "fixed" | "resolution" | "none-open"; note_pl: string };
  decision_maker_pl: string;
  steps_pl: string[];
  source_url: string;
  verified_on: string;
  reviewer: string | null;
  /** Carries the prototype note of FR-1.8 (FR-8.1). */
  notes_pl: string;
}
