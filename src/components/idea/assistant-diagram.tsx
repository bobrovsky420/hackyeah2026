import { GeneratedLine } from "@/components/ui/generated-note";
import type { AssistantDiagram, DiagramStep } from "@/lib/contracts";
import { t, type MessageKey } from "@/lib/i18n";
import { DIAGRAM_STEPS } from "@/server/ideas/assistant";

const STEP_KEYS: Record<DiagramStep, MessageKey> = {
  who: "card.assistant.show.step.who",
  what: "card.assistant.show.step.what",
  for_whom: "card.assistant.show.step.for_whom",
  with_whom: "card.assistant.show.step.with_whom",
  change: "card.assistant.show.step.change",
};

/**
 * The diagram of an idea ("Pokaż"): five steps as an ordered list, one
 * under another with an arrow between them, each step's name beside its
 * phrases on a wider screen, so a screen reader and print read it in
 * order and a long word never runs out of its box. A step without phrases
 * says so.
 */
export function AssistantDiagramView({ diagram }: { diagram: AssistantDiagram }) {
  return (
    <div className="grid gap-3">
      <ol className="grid gap-1">
        {DIAGRAM_STEPS.map((step, index) => (
          <li key={step} className="grid gap-1">
            <div className="grid gap-1 rounded-md border-2 border-border p-3 @xl:grid-cols-[10rem_minmax(0,1fr)] @xl:gap-4">
              <span className="font-bold">{t(STEP_KEYS[step])}</span>
              {diagram.steps[step].length > 0 ? (
                <ul className="grid list-disc gap-1 pl-5">
                  {diagram.steps[step].map((phrase) => (
                    <li key={phrase}>{phrase}</li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground">{t("card.assistant.show.unknown")}</span>
              )}
            </div>
            {index < DIAGRAM_STEPS.length - 1 && (
              <span aria-hidden className="pl-6 text-xl leading-none font-bold text-primary">
                ↓
              </span>
            )}
          </li>
        ))}
      </ol>
      <GeneratedLine model={diagram.source === "model"}>
        {t(diagram.source === "model" ? "card.assistant.show.model" : "card.assistant.show.template")}
      </GeneratedLine>
    </div>
  );
}
