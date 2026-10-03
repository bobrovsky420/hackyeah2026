"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/*
 * The page events of PAGE_EVENTS=on (src/lib/env.ts): a page view with the
 * time spent on it, every link followed (the path, or only the host of an
 * outside link) and the buttons marked with data-track. Sent with
 * sendBeacon to /api/events. Nothing is stored in the browser: the visit
 * id lives in this tab's memory and is gone on a reload. Never a form
 * field, a query string or any text the reader typed.
 */

type PageEvent = { event: "page_viewed" | "page_left" | "link_clicked" | "button_clicked"; path: string } & Record<string, string | number>;

const visitId = `v-${Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;

function send(event: PageEvent) {
  const body = JSON.stringify({ ...event, visit_id: visitId });
  if (!navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) {
    void fetch("/api/events", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
  }
}

/** The path of a link: our own without the query, an outside one as its host. */
function linkTarget(anchor: HTMLAnchorElement): string | null {
  try {
    const url = new URL(anchor.href, location.href);
    if (url.protocol === "mailto:" || url.protocol === "tel:") return url.protocol.slice(0, -1);
    // A blob: link is the download of the page itself, already logged as its button.
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin === location.origin ? url.pathname : url.host;
  } catch {
    return null;
  }
}

export function PageEvents() {
  const path = usePathname();

  useEffect(() => {
    const shown = performance.now();
    send({ event: "page_viewed", path });
    const leave = () => send({ event: "page_left", path, duration_ms: Math.round(performance.now() - shown) });
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [path]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const tracked = target?.closest<HTMLElement>("[data-track]");
      if (tracked) {
        send({ event: "button_clicked", path, target: tracked.dataset.track ?? "", target_id: tracked.dataset.trackId ?? "" });
        return;
      }
      const anchor = target?.closest("a");
      const href = anchor ? linkTarget(anchor) : null;
      if (href) send({ event: "link_clicked", path, target: href, section: anchor?.closest("section[aria-labelledby]")?.getAttribute("aria-labelledby") ?? "" });
    }
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [path]);

  return null;
}
