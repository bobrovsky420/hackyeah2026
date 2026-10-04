/**
 * Parts of the app that are switched off but kept in the source. A part
 * switched off answers 404 and nothing in the app links to it; its code,
 * data, API and tests stay, and setting the switch to true brings it back.
 *
 * No "@/" imports: the Playwright tests load this file.
 */

/** The map of the gminas (S4, FR-7): /mapa, its menu item and the links to it. */
export const MAP_ENABLED = true;
