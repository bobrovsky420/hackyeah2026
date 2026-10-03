"use client";

import { useEffect } from "react";

/** Moves focus to the page heading after navigation, so screen readers start there. */
export function FocusOnMount({ targetId }: { targetId: string }) {
  useEffect(() => {
    document.getElementById(targetId)?.focus({ preventScroll: true });
  }, [targetId]);
  return null;
}
