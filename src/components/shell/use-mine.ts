"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ideasSnapshot, parseIdeas, subscribeIdeas } from "@/components/idea/saved-ideas";
import { parseSaved, savedSnapshot, subscribeSaved } from "@/components/talk/saved-threads";

/*
 * "Moje sprawy" for the header: whether this browser remembers a
 * conversation or an idea card, and how many have an answer of ROPS or a
 * mentor since they were last opened here. The dates come from the two
 * status endpoints (FR-15.8), at most every 30 seconds per tab, kept in
 * sessionStorage; what is unread is worked out here, so opening a
 * conversation clears it at once.
 */

const CACHE_KEY = "mine:status";
const FRESH_MS = 30_000;

interface Dates {
  /** The ids asked, so a new conversation or card asks again. */
  ids: string;
  at: number;
  answers: Record<string, string | null>;
  replies: Record<string, string | null>;
}

function cached(ids: string): Dates | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "null") as Dates | null;
    return value && value.ids === ids && Date.now() - value.at < FRESH_MS ? value : null;
  } catch {
    return null;
  }
}

/** One request at a time per list of ids, shared by the header and the top bar. */
let inFlight: { ids: string; job: Promise<Dates> } | null = null;

async function post<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Null before the browser is read (the server renders nothing of it). */
export function useMine(): { remembered: boolean; unread: number } | null {
  const threadsText = useSyncExternalStore(subscribeSaved, savedSnapshot, () => null);
  const ideasText = useSyncExternalStore(subscribeIdeas, ideasSnapshot, () => null);
  const threads = useMemo(() => (threadsText === null ? null : parseSaved(threadsText)), [threadsText]);
  const ideas = useMemo(() => (ideasText === null ? null : parseIdeas(ideasText)), [ideasText]);
  const ids = useMemo(() => JSON.stringify([(threads ?? []).map((item) => item.id), (ideas ?? []).map((item) => item.id)]), [threads, ideas]);
  const [dates, setDates] = useState<Dates | null>(null);

  useEffect(() => {
    if (threads === null || ideas === null || (threads.length === 0 && ideas.length === 0)) return;
    const hit = cached(ids);
    if (hit) {
      // Reading sessionStorage has to wait for the browser.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDates(hit);
      return;
    }
    let cancelled = false;
    if (inFlight?.ids !== ids) {
      const job = Promise.all([
        threads.length > 0 ? post<{ threads: { id: string; last_answer_at: string | null }[] }>("/api/threads/status", { threads: threads.map(({ id, key }) => ({ id, key })) }) : null,
        ideas.length > 0 ? post<{ ideas: { id: string; reply_at: string | null }[] }>("/api/ideas/status", { ids: ideas.map((item) => item.id) }) : null,
      ]).then(([threadStatus, ideaStatus]) => {
        const next: Dates = {
          ids,
          at: Date.now(),
          answers: Object.fromEntries((threadStatus?.threads ?? []).map((item) => [item.id, item.last_answer_at])),
          replies: Object.fromEntries((ideaStatus?.ideas ?? []).map((item) => [item.id, item.reply_at])),
        };
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(next));
        } catch {
          // Without storage the next page asks again.
        }
        return next;
      });
      inFlight = { ids, job };
      void job.finally(() => {
        if (inFlight?.job === job) inFlight = null;
      });
    }
    void inFlight!.job.then((next) => {
      if (!cancelled) setDates(next);
    });
    return () => {
      cancelled = true;
    };
    // `ids` stands for the lists: a new conversation or card asks again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  if (threads === null || ideas === null) return null;
  const remembered = threads.length > 0 || ideas.length > 0;
  const unread =
    threads.filter((item) => {
      const answered = dates?.answers[item.id];
      return Boolean(answered && answered > (item.seenAt ?? item.savedAt));
    }).length +
    ideas.filter((item) => {
      const replied = dates?.replies[item.id];
      return Boolean(replied && replied > item.seenAt);
    }).length;
  return { remembered, unread };
}
