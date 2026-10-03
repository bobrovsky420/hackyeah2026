const dateFormat = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Warsaw",
});

/** A date in the interface format of section 11: "3.10.2026". Plain dates are read at noon, so no zone shifts them. */
export function formatDate(value: string): string {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}

const timeFormat = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" });

/** An instant as date and time in Poland: "3.10.2026, 14:05". */
export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : `${dateFormat.format(date)}, ${timeFormat.format(date)}`;
}

const dayFormat = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Warsaw" });

/** The calendar day of an instant in Poland, as YYYY-MM-DD: what a date filter compares. */
export function warsawDay(value: string): string {
  return dayFormat.format(new Date(value));
}
