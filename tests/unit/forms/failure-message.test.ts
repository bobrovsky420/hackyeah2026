import { describe, expect, it } from "vitest";
import { failureMessage } from "@/components/forms/failure-message";
import { t } from "@/lib/i18n";

/* What the public forms show when the server refuses a submission (S9, FR-12.14, 7.12). */

describe("failureMessage", () => {
  it("shows the Polish message of a 429 and a 503", () => {
    expect(failureMessage(429, { error: "limit", message: t("forms.limit.text") })).toBe(t("forms.limit.text"));
    expect(failureMessage(503, { error: "public_writes_off", message: t("forms.closed.text") })).toBe(t("forms.closed.text"));
  });

  it("names a declined or an off-topic text", () => {
    expect(failureMessage(422, { error: "screened", outcome: "declined" })).toBe(t("forms.screened.declined"));
    expect(failureMessage(422, { error: "screened", outcome: "off_topic" })).toBe(t("forms.screened.offTopic"));
  });

  it("keeps the generic notice for anything else", () => {
    expect(failureMessage(500, { message: "Internal" })).toBeNull();
    expect(failureMessage(422, { error: "invalid", field: "email" })).toBeNull();
    expect(failureMessage(429, null)).toBeNull();
    expect(failureMessage(503, { message: "  " })).toBeNull();
    expect(failureMessage(422, { error: "screened", outcome: "redirected" })).toBeNull();
  });
});
