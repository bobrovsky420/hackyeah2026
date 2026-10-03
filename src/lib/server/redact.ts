import "server-only";

/*
 * The deterministic part of the gate (FR-12.1, FR-12.4), standing in until
 * the real gate exists: e-mail addresses, PESEL numbers with a valid
 * checksum, phone numbers and street addresses with a house number are
 * replaced before the text is stored. Names are left to the model's
 * screening; organisations and officials in their public role stay.
 */

export const REDACTED = "[usunięto]";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const ELEVEN_DIGITS = /(?<!\d)\d{11}(?!\d)/g;
const PHONE = /(?<![\d+])(?:(?:\+|00)48[\s-]?)?(?:\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\d{3}[\s-]?\d{3}[\s-]?\d{3})(?!\d)/g;
const ADDRESS =
  /(?<!\p{L})(?:ul\.|ulic[ay]|al\.|alej[ai]|os\.|osiedl[eu]|pl\.|plac[u]?)\s*\p{Lu}[\p{L}.'-]*(?:\s+\p{Lu}[\p{L}.'-]*){0,3}\s+\d+[a-zA-Z]?(?:\s*\/\s*\d+[a-zA-Z]?)?/gu;

const PESEL_WEIGHTS = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];

function isPesel(digits: string): boolean {
  const sum = PESEL_WEIGHTS.reduce((total, weight, index) => total + weight * Number(digits[index]), 0);
  return (10 - (sum % 10)) % 10 === Number(digits[10]);
}

/** The text with personal data replaced, and how many fragments were removed. */
export function redact(text: string): { text: string; count: number } {
  let count = 0;
  const replace = () => {
    count += 1;
    return REDACTED;
  };
  const result = text
    .replace(EMAIL, replace)
    .replace(ELEVEN_DIGITS, (digits) => (isPesel(digits) ? replace() : digits))
    .replace(PHONE, replace)
    .replace(ADDRESS, replace);
  return { text: result, count };
}
