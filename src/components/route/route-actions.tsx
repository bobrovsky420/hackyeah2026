"use client";

import { Download, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { t, type MessageKey } from "@/lib/i18n";
import { feedbackKey } from "@/lib/storage-keys";

const votes: { value: string; label: MessageKey }[] = [
  { value: "tak", label: "s2.feedback.yes" },
  { value: "czesciowo", label: "s2.feedback.partly" },
  { value: "nie", label: "s2.feedback.no" },
];

/** "Czy ta droga pomaga?" (FR-10.1), print and download (FR-4.7). */
export function RouteActions({ routeId, markdown }: { routeId: string; markdown: string }) {
  const [vote, setVote] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(feedbackKey(routeId));
      // The vote lives in the browser, so it can only be read after mounting.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && votes.some((item) => item.value === saved)) setVote(saved);
    } catch {
      // Storage blocked: the vote is not remembered.
    }
  }, [routeId]);

  function choose(value: string) {
    setVote(value);
    try {
      localStorage.setItem(feedbackKey(routeId), value);
    } catch {
      // Storage blocked: the vote is not remembered.
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `droga-${routeId}.md`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <section aria-labelledby="ocena-drogi" className="no-print grid gap-3 rounded-lg border border-border bg-muted p-4">
        <h2 id="ocena-drogi" className="text-[1.2rem] font-bold">
          {t("s2.feedback.title")}
        </h2>
        <div role="group" aria-labelledby="ocena-drogi" className="flex flex-wrap gap-2">
          {votes.map((item) => (
            <Button key={item.value} variant="secondary" aria-pressed={vote === item.value} onClick={() => choose(item.value)}>
              {t(item.label)}
            </Button>
          ))}
        </div>
        <p role="status" className="text-muted-foreground">
          {vote ? t("s2.feedback.thanks") : ""}
        </p>
      </section>
      <div className="no-print flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer aria-hidden />
          {t("s2.print")}
        </Button>
        <Button variant="secondary" onClick={download}>
          <Download aria-hidden />
          {t("s2.download")}
        </Button>
      </div>
    </>
  );
}
