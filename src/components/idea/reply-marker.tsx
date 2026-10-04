"use client";

import { useEffect, useState } from "react";
import { NewBadge } from "@/components/talk/my-threads";
import { t } from "@/lib/i18n";
import { markIdeaSeen } from "./saved-ideas";

/**
 * On the card's page in the browser that sent it: "Nowa odpowiedź od
 * Twojej ostatniej wizyty" when ROPS replied after the last visit here,
 * which this visit then marks as seen. Elsewhere nothing.
 */
export function ReplyMarker({ ideaId, replyAt }: { ideaId: string; replyAt: string | null }) {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    const seenAt = markIdeaSeen(ideaId);
    // Marking the visit has to wait for the browser; the badge follows from it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (seenAt && replyAt && replyAt > seenAt) setFresh(true);
  }, [ideaId, replyAt]);
  return fresh ? <NewBadge>{t("card.reply.new")}</NewBadge> : null;
}
