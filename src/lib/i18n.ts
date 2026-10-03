import messages from "../../messages/pl.json";

/** Every user-visible string lives in messages/pl.json (specification, section 11). */
export type MessageKey = keyof typeof messages;

/** Returns the Polish string for `key`, filling {placeholders} from `values`. */
export function t(key: MessageKey, values?: Record<string, string | number>): string {
  const text: string = messages[key];
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}
