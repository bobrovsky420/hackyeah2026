import type { ReactNode } from "react";

/*
 * The page side of the brief's one renderer: the section text of
 * src/server/needs/sections.ts (8.5), a small Markdown subset, as React
 * elements. Blocks are separated by a blank line: "### " is a subheading,
 * lines that all start with "- " a list, a block in underscores emphasis,
 * anything else a paragraph. Inline, [text](url) is a link and a bare URL
 * or e-mail address becomes one. No HTML is ever injected.
 */

const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s),;]+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    const [whole, label, target, url, email] = match;
    const href = target ?? url ?? `mailto:${email}`;
    nodes.push(
      <a key={`${start}-${whole}`} href={href}>
        {label ?? url ?? email}
      </a>,
    );
    cursor = start + whole.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function SectionText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return (
    <>
      {blocks.map((block, index) => {
        const key = `${index}-${block.slice(0, 20)}`;
        if (block.startsWith("### ")) {
          return (
            <h3 key={key} className="text-[1.15rem] font-bold">
              {inline(block.slice(4))}
            </h3>
          );
        }
        const lines = block.split("\n");
        if (lines.every((line) => line.startsWith("- "))) {
          return (
            <ul key={key} className="grid list-disc gap-1 pl-6">
              {lines.map((line, item) => (
                <li key={`${item}-${line.slice(2, 22)}`}>{inline(line.slice(2))}</li>
              ))}
            </ul>
          );
        }
        if (/^_[^_]+_$/.test(block)) {
          return (
            <p key={key} className="italic">
              {inline(block.slice(1, -1))}
            </p>
          );
        }
        return (
          <p key={key} className="whitespace-pre-line">
            {inline(block)}
          </p>
        );
      })}
    </>
  );
}
