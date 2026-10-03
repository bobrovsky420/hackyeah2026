"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { t } from "@/lib/i18n";
import { saveThread } from "./saved-threads";

const noSubscription = () => () => {};

/** The private link of a new conversation: shown once, copied with one button, remembered on this device. */
export function PrivateLink({ id, keyValue, path, subject }: { id: string; keyValue: string; path: string; subject: string }) {
  const [copied, setCopied] = useState(false);
  // The full address needs the browser's origin; the server shows the path.
  const origin = useSyncExternalStore(noSubscription, () => window.location.origin, () => "");
  const url = origin ? new URL(path, origin).toString() : path;

  useEffect(() => {
    saveThread({ id, key: keyValue, subject });
  }, [id, keyValue, path, subject]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Notice tone="success" title={t("talk.link.title")} titleAs="h2">
        <p>{t("talk.link.text")}</p>
      </Notice>
      <p className="rounded-md border-2 border-border p-3 font-mono text-[0.95rem] break-all" id="prywatny-link">
        {url}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={copy} aria-describedby="prywatny-link">
          {t("talk.link.copy")}
        </Button>
        <Link href={path} className={buttonVariants({ variant: "secondary" })}>
          {t("talk.link.open")}
        </Link>
      </div>
      <p role="status" aria-live="polite">
        {copied ? t("talk.link.copied") : ""}
      </p>
      <p className="text-muted-foreground">{t("talk.link.device")}</p>
    </div>
  );
}
