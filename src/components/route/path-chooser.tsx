"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/ui/field";
import type { ImplementationPath } from "@/lib/contracts/path";
import type { Route } from "@/lib/contracts/route";
import { t } from "@/lib/i18n";
import { applicantCodes, applicantLabel } from "@/lib/labels";
import { PathCard } from "./path-card";

const MAX_PATHS = 3;

/**
 * FR-8.2 in the prototype: for the route's own applicant type the paths the
 * route chose; for another type, the route's paths open to it first, then
 * the other paths open to it. Only the route's own paths carry the model's
 * "Dlaczego ta ścieżka" (FR-4.5); the others get a templated reason.
 */
function selectPaths(route: Route["path"], applicant: string, all: ImplementationPath[]) {
  const byId = new Map(all.map((path) => [path.id, path]));
  const own = route.paths
    .map(({ path_id, why_pl }) => ({ path: byId.get(path_id), why: why_pl }))
    .filter((item): item is { path: ImplementationPath; why: string } => item.path !== undefined);
  if (applicant === route.applicant_type) return own.slice(0, MAX_PATHS);
  const fitting = own.filter((item) => item.path.applicant_types.includes(applicant));
  const others = all
    .filter((path) => path.applicant_types.includes(applicant) && !fitting.some((item) => item.path.id === path.id))
    .map((path) => ({ path, why: t("path.chooser.why", { applicant: applicantLabel(applicant) }) }));
  return [...fitting, ...others].slice(0, MAX_PATHS);
}

/** "Ścieżka wdrożenia" with "Kto złoży wniosek?", which re-selects the paths without leaving the page. */
export function PathChooser({ route, paths }: { route: Route["path"]; paths: ImplementationPath[] }) {
  const initial = route.applicant_type || "ngo";
  const [applicant, setApplicant] = useState(initial);
  const [choice, setChoice] = useState(initial);
  const [announcement, setAnnouncement] = useState("");
  const shown = selectPaths(route, applicant, paths);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = selectPaths(route, choice, paths);
    setApplicant(choice);
    setAnnouncement(t("path.chooser.shown", { applicant: applicantLabel(choice), count: next.length }));
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={apply} className="no-print flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label htmlFor="wnioskodawca" className="font-bold">
            {t("path.chooser.label")}
          </label>
          <p id="wnioskodawca-podpowiedz" className="text-muted-foreground">
            {t("path.chooser.hint")}
          </p>
          <select
            id="wnioskodawca"
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
            aria-describedby="wnioskodawca-podpowiedz"
            className={controlClass}
          >
            {applicantCodes.map((code) => (
              <option key={code} value={code}>
                {applicantLabel(code, true)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">
          {t("path.chooser.submit")}
        </Button>
      </form>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {shown.length === 0 ? (
        <p>{t("path.chooser.none")}</p>
      ) : (
        shown.map(({ path, why }) => <PathCard key={path.id} path={path} why={why} />)
      )}
    </div>
  );
}
