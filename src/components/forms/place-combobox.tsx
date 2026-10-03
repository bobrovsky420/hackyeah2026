"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { controlClass, describedBy, Field, FieldError, Hint, Label } from "@/components/ui/field";
import { t } from "@/lib/i18n";
import { gminy } from "@/lib/mock/data";
import { placeLabel } from "@/lib/places";
import { fold, pluralPl } from "@/lib/text";
import { cn } from "@/lib/utils";

export interface PlaceValue {
  text: string;
  terc: string | null;
}

const options = gminy.map((gmina) => {
  const label = placeLabel(gmina);
  return { terc: gmina.terc, label, name: fold(gmina.name), full: fold(label) };
});

const MAX_RESULTS = 8;

/** FR-2.2: names that start with the query first, then any other match; no diacritics needed. */
function search(query: string) {
  const needle = fold(query.trim());
  if (needle.length === 0) return [];
  const starts = options.filter((option) => option.name.startsWith(needle));
  const contains = options.filter((option) => !option.name.startsWith(needle) && option.full.includes(needle));
  return [...starts, ...contains].slice(0, MAX_RESULTS);
}

/**
 * Type-ahead over the gminas of Małopolska, following the ARIA 1.2 combobox
 * pattern with a list popup. Empty means "cała Małopolska".
 */
export function PlaceCombobox({
  id,
  name,
  value,
  onChange,
  error,
}: {
  id: string;
  name: string;
  value: PlaceValue;
  onChange: (value: PlaceValue) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const results = useMemo(() => search(value.text), [value.text]);
  const listId = `${id}-lista`;
  const hintId = `${id}-podpowiedz`;
  const errorId = error ? `${id}-blad` : undefined;
  const expanded = open && results.length > 0;

  function choose(option: (typeof options)[number]) {
    onChange({ text: option.label, terc: option.terc });
    setOpen(false);
    setActive(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(results.length > 0 ? 0 : -1);
      } else {
        setActive((index) => Math.min(index + 1, results.length - 1));
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      if (expanded && active >= 0 && results[active]) {
        event.preventDefault();
        choose(results[active]);
      }
    } else if (event.key === "Escape") {
      if (expanded) {
        event.preventDefault();
        setOpen(false);
        setActive(-1);
      } else if (value.text) {
        onChange({ text: "", terc: null });
      }
    }
  }

  let status = "";
  if (open && value.text.trim() && value.terc === null) {
    status =
      results.length === 0
        ? t("place.status.none")
        : t("place.status.count", {
            count: results.length,
            unit: pluralPl(results.length, {
              one: t("place.unit.one"),
              few: t("place.unit.few"),
              many: t("place.unit.many"),
            }),
          });
  }

  return (
    <Field invalid={Boolean(error)}>
      <Label htmlFor={id}>{t("place.label.field")}</Label>
      <Hint id={hintId}>{t("place.hint")}</Hint>
      {error && <FieldError id={errorId}>{error}</FieldError>}
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? `${id}-opcja-${active}` : undefined}
          aria-describedby={describedBy(hintId, errorId)}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          spellCheck={false}
          value={value.text}
          onChange={(event) => {
            onChange({ text: event.target.value, terc: null });
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => setOpen(false)}
          className={controlClass}
        />
        <input type="hidden" name={name} value={value.terc ?? ""} />
        <ul
          id={listId}
          role="listbox"
          aria-label={t("place.list.label")}
          hidden={!expanded}
          className="absolute inset-x-0 z-20 mt-1 rounded-md border-2 border-input bg-background py-1 shadow-md"
        >
          {results.map((option, index) => (
            <li
              key={option.terc}
              id={`${id}-opcja-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
              className={cn(
                "flex min-h-11 cursor-pointer items-center px-3 py-2 hover:bg-accent",
                index === active && "bg-accent font-bold outline-2 -outline-offset-2 outline-ring",
              )}
            >
              {option.label}
            </li>
          ))}
        </ul>
      </div>
      <p role="status" className="sr-only">
        {status}
      </p>
    </Field>
  );
}
