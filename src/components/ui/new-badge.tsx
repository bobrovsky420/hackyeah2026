/** A "new" mark in words with a frame, never colour alone. */
export function NewBadge({ children }: { children: string }) {
  return <span className="rounded-full border-2 border-primary px-2.5 py-0.5 text-[0.9rem] leading-tight font-bold text-primary">{children}</span>;
}
