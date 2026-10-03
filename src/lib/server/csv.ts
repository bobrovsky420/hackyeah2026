import "server-only";

type Cell = string | number | boolean | null | undefined;

function cell(value: Cell): string {
  let text = value === null || value === undefined ? "" : typeof value === "boolean" ? (value ? "tak" : "nie") : String(value);
  // A cell that starts like a formula is neutralised: the data comes from forms (CSV injection).
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV for Polish Excel: UTF-8 with a byte order mark, semicolons (the
 * decimal comma takes the comma) and CRLF line ends.
 */
export function toCsv(header: string[], rows: Cell[][]): string {
  return `﻿${[header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n")}\r\n`;
}
