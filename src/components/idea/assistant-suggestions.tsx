import Link from "next/link";
import { GeneratedLine } from "@/components/ui/generated-note";
import { getInnovation } from "@/lib/catalogue";
import type { AssistantRun, AssistantSuggestion } from "@/lib/contracts";
import { t, type MessageKey } from "@/lib/i18n";
import { blockTitle } from "@/server/ideas/assistant";

const KIND_KEYS: Record<AssistantSuggestion["kind"], MessageKey> = {
  pytanie: "card.assistant.kind.pytanie",
  inspiracja: "card.assistant.kind.inspiracja",
  pomysl: "card.assistant.kind.pomysl",
};

/**
 * The stored suggestions of the idea assistant, each with its block of the
 * CANVAS application and its kind in words, an inspiration with the
 * innovation it comes from, and how they were made.
 */
export function AssistantSuggestions({
  run,
  headingLevel = 3,
  empty = "card.assistant.none",
}: {
  run: AssistantRun;
  headingLevel?: 3 | 4;
  /** What an empty run says. */
  empty?: MessageKey;
}) {
  const Heading = `h${headingLevel}` as const;
  if (run.suggestions.length === 0) return <p>{t(empty)}</p>;
  return (
    <div className="grid gap-3">
      <ul className="grid gap-3">
        {run.suggestions.map((item, index) => {
          const innovation = item.innovation_id ? getInnovation(item.innovation_id) : undefined;
          return (
            <li key={index} className="grid gap-1 rounded-md border border-border p-4">
              <Heading className="font-bold">
                {blockTitle(item.block)} · {t(KIND_KEYS[item.kind])}
              </Heading>
              <p>{item.text_pl}</p>
              {innovation && (
                <p className="text-muted-foreground">
                  {t("card.assistant.basedOn")} <Link href={`/innowacja/${innovation.id}`}>{innovation.title}</Link>
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <GeneratedLine model={run.source === "model"}>{t(run.source === "model" ? "card.assistant.model" : "card.assistant.template")}</GeneratedLine>
    </div>
  );
}
