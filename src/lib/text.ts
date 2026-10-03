/**
 * Lower-cases and strips Polish diacritics, so "zakop" finds "Zakopane" and
 * "lodz" finds "Łódź". NFD does not decompose "ł", hence the explicit swap.
 */
export function fold(text: string): string {
  return text
    .toLocaleLowerCase("pl-PL")
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Groups thousands with a no-break space, as in "1 200 zł" (section 11). */
export function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Picks the Polish plural form: one ("1 znak"), few ("2 znaki") or many
 * ("5 znaków", "12 znaków", "22 znaki").
 */
export function pluralPl(value: number, forms: { one: string; few: string; many: string }): string {
  if (value === 1) return forms.one;
  const lastDigit = value % 10;
  const lastTwo = value % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return forms.few;
  return forms.many;
}
