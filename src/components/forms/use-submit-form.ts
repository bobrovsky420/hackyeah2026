"use client";

import { useRef, useState } from "react";
import type { FormError } from "@/components/ui/error-summary";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validation, focus on the error summary, and the POST to the form's API
 * route. The prototype's API keeps the entries in the server's memory.
 */
export function useSubmitForm(endpoint: string) {
  const [errors, setErrors] = useState<FormError[]>([]);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  /** The API's answer, such as the new entry's id. */
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  const failedRef = useRef<HTMLDivElement>(null);

  async function submit(found: FormError[], payload: unknown) {
    if (status === "sending") return;
    setErrors(found);
    if (found.length > 0) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setStatus("sending");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setResult(await response.json().catch(() => null));
      setStatus("sent");
      requestAnimationFrame(() => doneRef.current?.focus());
    } catch {
      setStatus("failed");
      requestAnimationFrame(() => failedRef.current?.focus());
    }
  }

  function errorFor(fieldId: string): string | undefined {
    return errors.find((error) => error.fieldId === fieldId)?.message;
  }

  return { errors, status, result, summaryRef, doneRef, failedRef, submit, errorFor };
}
