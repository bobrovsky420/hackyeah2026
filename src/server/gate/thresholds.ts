/*
 * Every number the gate decides with (FR-12.3, FR-12.1, FR-12.7, FR-12.14),
 * in one file so the lawyer and the team can read and change them together.
 * The decision rules in decide.ts read nothing else.
 */

/** `crisis`, or `individual_case` with a sensitive topic (E.4), from the model at or above this gives `redirected`. */
export const REDIRECT_MIN_CONFIDENCE = 0.6;

/** `harm` from the model at or above this gives `declined`; below it the text is routed. */
export const DECLINE_MIN_CONFIDENCE = 0.7;

/**
 * `off_topic` or `spam` from the model at or above this gives `off_topic`.
 * FR-12.3 names no threshold; 0.5 keeps a hesitant model from turning a
 * clumsy but real need away (principle E3).
 */
export const OFF_TOPIC_MIN_CONFIDENCE = 0.5;

/** A text whose links take at least this share of its non-space characters is spam. */
export const LINK_SHARE_SPAM = 0.5;

/** Identical texts (same kind, same client) are remembered this long. */
export const REPEAT_WINDOW_MS = 60 * 60 * 1000;

/**
 * How many identical texts one client may send within the window before the
 * next is spam: 1 is R12 of 13.1 ("off_topic after the first"). The test
 * runs, which send the same example many times from one address, raise it
 * with GATE_REPEAT_LIMIT.
 */
export const repeatLimit = () => envLimit("GATE_REPEAT_LIMIT", 1);

/** Screening-log texts of `declined` and `spam` are kept this long (FR-12.7). */
export const LOG_TEXT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function envLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 1 ? value : fallback;
}

/**
 * Abuse limits of FR-6.4 and FR-12.14, per day: five contact requests per
 * e-mail address and per client address, two readiness registrations per
 * e-mail address or phone, three idea cards per e-mail address, five
 * evaluations per innovation per e-mail address and per client address.
 * The test runs raise them like the route limit.
 */
export const contactRequestsPerDay = () => envLimit("ABUSE_LIMIT_CONTACTS_PER_DAY", 5);
export const readinessRegistrationsPerDay = () => envLimit("ABUSE_LIMIT_READINESS_PER_DAY", 2);
export const ideaCardsPerDay = () => envLimit("ABUSE_LIMIT_IDEAS_PER_DAY", 3);
export const evaluationsPerDay = () => envLimit("ABUSE_LIMIT_EVALUATIONS_PER_DAY", 5);
/** Service plans of the Middleman (module VII) per client address a day: each costs a model call. */
export const servicePlansPerDay = () => envLimit("ABUSE_LIMIT_SERVICE_PLANS_PER_DAY", 10);
/** Module V: new conversations and partnership posts per e-mail address and client address, messages per conversation. */
export const threadsPerDay = () => envLimit("ABUSE_LIMIT_THREADS_PER_DAY", 5);
export const messagesPerDay = () => envLimit("ABUSE_LIMIT_MESSAGES_PER_DAY", 30);
export const postsPerDay = () => envLimit("ABUSE_LIMIT_POSTS_PER_DAY", 3);
export const LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The model call of FR-12.2: effort low, about 1 000 tokens (9.3). */
export const SCREEN_MAX_TOKENS = 1000;
