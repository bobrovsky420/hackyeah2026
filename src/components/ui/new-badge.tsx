/**
 * A "new" mark in words, filled in the pictogram's magenta so it catches
 * the eye (decision U.11): white on the dark step, dark on the light one,
 * 7:1 either way; yellow in the contrast version.
 */
export function NewBadge({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-[var(--idea-ink)] px-2.5 py-0.5 text-[0.9rem] leading-tight font-bold text-background">{children}</span>
  );
}
