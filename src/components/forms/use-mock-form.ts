"use client";

import { useRef, useState } from "react";
import type { FormError } from "@/components/ui/error-summary";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validation, focus on the error summary and a simulated submission: the
 * prototype has no backend, so nothing is sent or stored.
 */
export function useMockForm() {
  const [errors, setErrors] = useState<FormError[]>([]);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const summaryRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  function submit(found: FormError[]) {
    if (status === "sending") return;
    setErrors(found);
    if (found.length > 0) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setStatus("sending");
    window.setTimeout(() => {
      setStatus("sent");
      requestAnimationFrame(() => doneRef.current?.focus());
    }, 700);
  }

  function errorFor(fieldId: string): string | undefined {
    return errors.find((error) => error.fieldId === fieldId)?.message;
  }

  return { errors, status, summaryRef, doneRef, submit, errorFor };
}
