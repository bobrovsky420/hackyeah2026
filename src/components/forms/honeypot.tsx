import { t } from "@/lib/i18n";
import { HONEYPOT_FIELD } from "@/server/gate/honeypot-field";

export { HONEYPOT_FIELD };

/**
 * The honeypot of FR-12.14: a text field off screen, hidden from assistive
 * technology and out of the tab order, which people never fill and some
 * bots do. The server answers a filled one like a success and stores
 * nothing.
 */
export function Honeypot({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute -left-[10000px] top-auto size-px overflow-hidden">
      <label htmlFor="strona-www">{t("forms.honeypot.label")}</label>
      <input
        id="strona-www"
        name={HONEYPOT_FIELD}
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
