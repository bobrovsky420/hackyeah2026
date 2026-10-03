const dateFormat = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Warsaw",
});

const dateTimeFormat = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Warsaw",
});

/** A date in the interface format of section 11: "3.10.2026". Plain dates are read at noon, so no zone shifts them. */
export function formatDate(value: string): string {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}

/** A moment for the console: "3.10.2026, 14:02". */
export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormat.format(date);
}
