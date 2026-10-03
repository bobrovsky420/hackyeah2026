"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

function download(markdown: string, filename: string) {
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** "Drukuj" and "Pobierz jako plik tekstowy" for a printable document such as the brief (S6). */
export function DocumentActions({ markdown, filename }: { markdown: string; filename: string }) {
  return (
    <div className="no-print flex flex-wrap gap-3">
      <Button variant="secondary" onClick={() => window.print()}>
        <Printer aria-hidden />
        {t("s2.print")}
      </Button>
      <Button variant="secondary" onClick={() => download(markdown, filename)}>
        <Download aria-hidden />
        {t("s2.download")}
      </Button>
    </div>
  );
}
