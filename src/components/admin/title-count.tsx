"use client";

import { useEffect } from "react";

const PREFIX = /^\(\d+\)\s/;

/**
 * Puts the number of new entries before the panel tab's title, "(3)
 * Pomysły - Panel ROPS", so a reviewer sees it from another tab. Next.js
 * writes each page's own title after navigation, so the prefix is put back
 * whenever the title changes.
 */
export function TitleCount({ count }: { count: number }) {
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(PREFIX, "");
      const wanted = count > 0 ? `(${count}) ${base}` : base;
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = document.title.replace(PREFIX, "");
    };
  }, [count]);
  return null;
}
