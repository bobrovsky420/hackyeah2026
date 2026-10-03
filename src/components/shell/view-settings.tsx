"use client";

import { Contrast } from "lucide-react";
import { useSyncExternalStore } from "react";
import { t } from "@/lib/i18n";
import { CONTRAST_KEY, TEXT_SIZE_KEY } from "@/lib/storage-keys";

type TextSize = "1" | "2" | "3";

const sizes: { value: TextSize; glyph: string; className: string; spoken: "shell.textSize.1" | "shell.textSize.2" | "shell.textSize.3" }[] = [
  { value: "1", glyph: "A", className: "text-[0.875rem]", spoken: "shell.textSize.1" },
  { value: "2", glyph: "A", className: "text-[1.375rem]", spoken: "shell.textSize.2" },
  { value: "3", glyph: "A", className: "text-[2rem]", spoken: "shell.textSize.3" },
];

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-text-size", "data-contrast"] });
  return () => observer.disconnect();
}

function readTextSize(): TextSize {
  const value = document.documentElement.dataset.textSize;
  return value === "2" || value === "3" ? value : "1";
}

function readContrast(): boolean {
  return document.documentElement.dataset.contrast === "on";
}

function remember(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the setting lasts until the page is reloaded.
  }
}

/* The settings live on <html>, outside React; the store above re-renders the buttons. */
function applyTextSize(next: TextSize) {
  const root = document.documentElement;
  if (next === "1") delete root.dataset.textSize;
  else root.dataset.textSize = next;
  remember(TEXT_SIZE_KEY, next === "1" ? null : next);
}

function applyContrast(on: boolean) {
  const root = document.documentElement;
  if (on) root.dataset.contrast = "on";
  else delete root.dataset.contrast;
  remember(CONTRAST_KEY, on ? "on" : null);
}

/** D6: the text-size buttons and "Wersja kontrastowa", above the header. */
export function ViewSettings() {
  const textSize = useSyncExternalStore(subscribe, readTextSize, () => "1" as TextSize);
  const contrast = useSyncExternalStore(subscribe, readContrast, () => false);

  return (
    <div className="no-print border-b border-border bg-muted">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-1.5 text-[0.9rem] @3xl:px-8">
        <p className="hidden @xl:block">{t("shell.prototypeNote")}</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div role="group" aria-label={t("shell.textSize.group")} className="flex items-center gap-1.5">
            {sizes.map((size) => (
              <button
                key={size.value}
                type="button"
                className="view-tool view-size"
                data-size={size.value}
                aria-pressed={textSize === size.value}
                onClick={() => applyTextSize(size.value)}
              >
                <span className={size.className}>{size.glyph}</span>
                <span className="sr-only"> {t(size.spoken)}</span>
              </button>
            ))}
          </div>
          <button type="button" className="view-tool view-contrast" aria-pressed={contrast} onClick={() => applyContrast(!contrast)}>
            <Contrast aria-hidden className="size-[1.1em]" />
            {t("shell.contrast")}
          </button>
        </div>
      </div>
    </div>
  );
}
