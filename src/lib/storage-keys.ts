/*
 * Keys of what the prototype keeps in the browser. The specification allows
 * no cookies (12.6): the view settings live in localStorage and are applied
 * by an inline script before the first paint.
 */
export const TEXT_SIZE_KEY = "view:text-size";
export const CONTRAST_KEY = "view:contrast";

/** The intake form's draft, so "Zmień opis" returns to the text as typed. */
export const DRAFT_KEY = "intake:draft";

/** One vote per route per browser (FR-10.1). */
export const feedbackKey = (routeId: string) => `feedback:${routeId}`;
