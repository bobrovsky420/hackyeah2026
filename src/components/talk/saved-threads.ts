/*
 * "Moje rozmowy": the private links of this browser, kept in localStorage
 * so a person finds their conversations again without an account. Only the
 * id, the key, the subject and when it was last opened here, which tells a
 * new answer from one already read; storage that fails is ignored.
 */

export interface SavedThread {
  id: string;
  key: string;
  subject: string;
  savedAt: string;
  /** When the author last opened it here: an answer after it is new. */
  seenAt?: string;
}

const STORAGE_KEY = "talk:threads";
const CHANGED = "talk:threads-changed";
const MAX = 50;

/** For useSyncExternalStore: changes in this tab and in the others. */
export function subscribeSaved(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

/** The raw stored text: a string, so React compares snapshots by value. */
export function savedSnapshot(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

export function parseSaved(text: string): SavedThread[] {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item?.id === "string" && typeof item?.key === "string") : [];
  } catch {
    return [];
  }
}

export function readSaved(): SavedThread[] {
  return parseSaved(savedSnapshot());
}

function write(items: SavedThread[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CHANGED));
}

/** Remembers a conversation, or marks it as seen now when it is already remembered. */
export function saveThread(entry: Omit<SavedThread, "savedAt" | "seenAt">): void {
  try {
    const saved = readSaved();
    const now = new Date().toISOString();
    const savedAt = saved.find((item) => item.id === entry.id)?.savedAt ?? now;
    const rest = saved.filter((item) => item.id !== entry.id);
    write([{ ...entry, savedAt, seenAt: now }, ...rest].slice(0, MAX));
  } catch {
    // Private mode or blocked storage: the link on the page still works.
  }
}

export function forgetThread(id: string): void {
  try {
    write(readSaved().filter((item) => item.id !== id));
  } catch {
    // Nothing to forget where nothing could be stored.
  }
}
