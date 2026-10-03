"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { controlClass, describedBy, Field, FieldError, Hint, Label } from "@/components/ui/field";
import { t } from "@/lib/i18n";
import { localityLabeller, placeLabeller, type LocalityOption, type PlaceOption } from "@/lib/place-options";
import { fold, pluralPl } from "@/lib/text";
import { cn } from "@/lib/utils";

export interface PlaceValue {
  text: string;
  terc: string | null;
}

interface SearchOption {
  key: string;
  /** The gmina's TERC, also for a town or village. */
  terc: string;
  label: string;
  name: string;
  full: string;
}

/** The gminas first, so a gmina ranks above a village of the same name. */
function searchOptions(places: PlaceOption[], localities: LocalityOption[]): SearchOption[] {
  const label = placeLabeller(places);
  const labelLocality = localityLabeller(places);
  const gminas = places.map((place) => {
    const text = label(place);
    return { key: place.terc, terc: place.terc, label: text, name: fold(place.name), full: fold(text) };
  });
  const towns = localities.flatMap((locality, index) => {
    const text = labelLocality(locality);
    return text ? [{ key: `m${index}`, terc: locality.terc, label: text, name: fold(locality.name), full: fold(text) }] : [];
  });
  return [...gminas, ...towns];
}

const MAX_RESULTS = 8;

/** FR-2.2: names that start with the query first, then any other match; no diacritics needed. */
function search(options: SearchOption[], query: string) {
  const needle = fold(query.trim());
  if (needle.length === 0) return [];
  const starts = options.filter((option) => option.name.startsWith(needle));
  const contains = options.filter((option) => !option.name.startsWith(needle) && option.full.includes(needle));
  return [...starts, ...contains].slice(0, MAX_RESULTS);
}

/**
 * Type-ahead over the gminas, towns and villages of Małopolska, following
 * the ARIA 1.2 combobox pattern with a list popup. A town or village only
 * finds its gmina: the value is always a gmina's TERC. Empty means "cała
 * Małopolska". The options come from the server page as props
 * (placeOptions and localityOptions in src/lib/places.ts).
 */
export function PlaceCombobox({
  id,
  name,
  places,
  localities,
  value,
  onChange,
  error,
}: {
  id: string;
  name: string;
  places: PlaceOption[];
  localities: LocalityOption[];
  value: PlaceValue;
  onChange: (value: PlaceValue) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const options = useMemo(() => searchOptions(places, localities), [places, localities]);
  const results = useMemo(() => search(options, value.text), [options, value.text]);
  const listId = `${id}-lista`;
  const hintId = `${id}-podpowiedz`;
  const errorId = error ? `${id}-blad` : undefined;
  const expanded = open && results.length > 0;

  function choose(option: SearchOption) {
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
              key={option.key}
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
