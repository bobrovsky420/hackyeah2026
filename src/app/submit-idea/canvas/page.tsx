import type { Metadata } from "next";
import Link from "next/link";
import { CanvasWizard, type CanvasBase } from "@/components/forms/canvas-wizard";
import { InfoPage } from "@/components/info/info-page";
import { Notice } from "@/components/ui/notice";
import { helplines } from "@/lib/catalogue";
import { STEP_COUNT } from "@/lib/canvas";
import type { Idea } from "@/lib/contracts";
import { t } from "@/lib/i18n";
import { repository } from "@/server/db";

export const metadata: Metadata = { title: t("canvas.meta.title") };

/** The short-form card's own fields and the assistant's suggestions per step, for "Rozbuduj do wniosku CANVAS". */
function baseOf(idea: Idea): CanvasBase {
  const hints: CanvasBase["hints"] = {};
  for (const item of idea.assistant?.develop?.suggestions ?? []) {
    (hints[item.block] ??= []).push({ kind: item.kind, text: item.text_pl });
  }
  return {
    id: idea.id,
    title: idea.title,
    answers: { kind: idea.kind, title: idea.title, description: idea.description, essence: idea.essence, for_whom: idea.for_whom },
    hints,
  };
}

/**
 * Module III, the CANVAS application: the idea card asked block by block
 * along the INNO AGH Social Innovation Canvas. With `?z={id}` of a
 * short-form card it starts from that card's fields and shows the
 * assistant's suggestions in the matching steps; the application is sent
 * as a new card that links to it.
 */
export default async function CanvasPage({ searchParams }: PageProps<"/submit-idea/canvas">) {
  const query = await searchParams;
  const from = typeof query.z === "string" ? await repository().getIdea(query.z) : undefined;
  const base = from && !from.demo && !from.canvas ? baseOf(from) : undefined;
  return (
    <InfoPage journey="idea"
      title={t("canvas.title")}
      afterTitle={
        <p>
          <Link href="/zglos-pomysl">{t("canvas.short")}</Link>
        </p>
      }
      lead={t("canvas.lead", { count: STEP_COUNT })}
    >
      {base && (
        <Notice tone="success" title={t("canvas.basedOn.title", { title: base.title })}>
          <p>{t("canvas.basedOn.text")}</p>
        </Notice>
      )}
      <Notice title={t("forms.prototype.title")}>
        <p>{t("forms.prototype.text")}</p>
      </Notice>
      <CanvasWizard helplines={helplines()} base={base} />
      <p className="text-muted-foreground">{t("canvas.source")}</p>
    </InfoPage>
  );
}
