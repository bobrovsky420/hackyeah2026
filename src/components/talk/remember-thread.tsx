"use client";

import { useEffect } from "react";
import { saveThread } from "./saved-threads";

/** Remembers an opened conversation on this device, for "Moje rozmowy". Only the author's link is kept. */
export function RememberThread({ id, keyValue, subject }: { id: string; keyValue: string; subject: string }) {
  useEffect(() => {
    saveThread({ id, key: keyValue, subject });
  }, [id, keyValue, subject]);
  return null;
}
