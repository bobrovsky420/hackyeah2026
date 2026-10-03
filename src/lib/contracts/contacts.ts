/*
 * The fixed contacts of the screens: the helplines of S10 and the crisis
 * banner (FR-12.5, 12.6), and the ROPS department named on the info pages
 * and in the brief. Mapped from data/helplines.yaml and data/advisors.yaml.
 */

export interface Helpline {
  id: string;
  /** As dialled, with spaces, e.g. "116 123". */
  number: string;
  /** The tel: link. */
  href: string;
  /** alarm: "Numery alarmowe"; support: "Pomoc i rozmowa" (FR-12.5). */
  group: "alarm" | "support";
  name: string;
  /** The name in a few words, for the one-line crisis banner of S2 (J10). */
  short: string;
  /** Which entry path of S10 lists the line first (FR-12.5). */
  forWhom: "self" | "someone" | "both";
  /** Verified opening hours; null until someone checked them. */
  hours: string | null;
  /** Who the line is for, one sentence; null when unknown. */
  whoFor: string | null;
}

export interface Department {
  name: string;
  email: string;
  /** As written, e.g. "+48 12 422 06 36 wew. 34". */
  phone: string;
  hours: string;
}
