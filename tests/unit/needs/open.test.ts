import { describe, expect, test } from "vitest";
import { openNeeds } from "@/server/needs/open";
import { need } from "./fixtures";

/* The public view of the needs bank (FR-5.6): approved and consented needs only, never a reporter field. */

describe("openNeeds", () => {
  const needs = [
    need({ id: "nd-ok", created_at: "2026-09-28T09:00:00+02:00" }),
    need({ id: "nd-waiting", moderation: { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null } }),
    need({ id: "nd-rejected", moderation: { status: "odrzucone", reviewer: "rops-1", decided_at: null, reason_pl: "dane osobowe" } }),
    need({ id: "nd-private", consents: { ...need().consents, publish_anonymised: false } }),
    need({ id: "nd-closed", status: "zamknieta" }),
    need({
      id: "nd-other",
      created_at: "2026-09-29T09:00:00+02:00",
      place_terc: "1261011",
      target_groups: ["seniorzy"],
      summary_pl: null,
      problem_text: "Seniorzy nie mają jak dojechać do przychodni, proszę pisać na jan@example.pl. Reszta opisu.",
    }),
  ];

  test("only approved needs with consent to publication, newest first", () => {
    expect(openNeeds(needs).map((item) => item.id)).toEqual(["nd-other", "nd-ok"]);
  });

  test("no reporter field, consent, note or full text in the projection", () => {
    const serialised = JSON.stringify(openNeeds(needs));
    for (const leak of ["Anna", "Nowak", "example.pl", "Tajne", "Notatka", "reporter", "consents", "moderation", "note_pl", "problem_text", "Reszta opisu"]) {
      expect(serialised).not.toContain(leak);
    }
    expect(Object.keys(openNeeds(needs)[0]).sort()).toEqual(["date", "id", "place_terc", "summary_pl", "target_groups"]);
    expect(openNeeds(needs)[0]).toMatchObject({ date: "2026-09-29", summary_pl: "Seniorzy nie mają jak dojechać do przychodni, proszę pisać na [usunięto]." });
  });

  test("the category and place filters", () => {
    expect(openNeeds(needs, { category: "seniorzy" }).map((item) => item.id)).toEqual(["nd-other"]);
    expect(openNeeds(needs, { terc: "1216143" }).map((item) => item.id)).toEqual(["nd-ok"]);
  });
});
