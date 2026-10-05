/*
 * "Moje zgłoszenia": the idea cards sent from this browser, kept in
 * localStorage beside "Moje rozmowy", so their author sees a new reply of
 * ROPS without an account or an e-mail. Only the id, the name and when the
 * card was last opened here; storage that fails is ignored.
 */

export interface SavedIdea {
  id: string;
  title: string;
  savedAt: string;
  seenAt: string;
}

const STORAGE_KEY = "idea:mine";
const CHANGED = "idea:mine-changed";
const MAX = 50;

export function subscribeIdeas(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

export function ideasSnapshot(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

export function parseIdeas(text: string): SavedIdea[] {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item?.id === "string" && typeof item?.title === "string") : [];
  } catch {
    return [];
  }
}

function write(items: SavedIdea[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CHANGED));
}

/** Remembers a card just sent from this browser. */
export function saveIdea(id: string, title: string): void {
  try {
    const now = new Date().toISOString();
    write([{ id, title, savedAt: now, seenAt: now }, ...parseIdeas(ideasSnapshot()).filter((item) => item.id !== id)].slice(0, MAX));
  } catch {
    // Private mode or blocked storage: the card's link still works.
  }
}

/** The card's last visit here, then now; null when this browser did not send it. */
export function markIdeaSeen(id: string): string | null {
  try {
    const items = parseIdeas(ideasSnapshot());
    const found = items.find((item) => item.id === id);
    if (!found) return null;
    write(items.map((item) => (item.id === id ? { ...item, seenAt: new Date().toISOString() } : item)));
    return found.seenAt;
  } catch {
    return null;
  }
}

export function forgetIdea(id: string): void {
  try {
    write(parseIdeas(ideasSnapshot()).filter((item) => item.id !== id));
  } catch {
    // Nothing to forget where nothing could be stored.
  }
}
