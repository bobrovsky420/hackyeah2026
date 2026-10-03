import { Phone } from "lucide-react";
import Link from "next/link";
import { helplines } from "@/lib/catalogue";
import type { Helpline, SensitiveTopic } from "@/lib/contracts";
import { t } from "@/lib/i18n";

/* The lines that fit each sensitive topic of 8.10, most relevant first. */
const linesByTopic: Record<SensitiveTopic, string[]> = {
  suicide: ["116 123", "116 111", "800 702 222"],
  self_harm: ["116 123", "116 111", "800 702 222"],
  violence: ["800 120 002", "116 123", "116 111"],
  child_abuse: ["116 111", "800 121 212", "800 120 002"],
  sexual_violence: ["800 120 002", "116 123", "116 111"],
  addiction: ["116 123", "800 702 222"],
};

/* The number never breaks; its name may wrap on a phone. */
function Line({ line }: { line: Helpline }) {
  return (
    <span>
      <a href={line.href} className="font-bold whitespace-nowrap tabular-nums">
        {line.number}
      </a>{" "}
      <span>{line.short}</span>
    </span>
  );
}

/**
 * The crisis banner of J10 and FR-12.3: a community need about a sensitive
 * topic keeps its route, and the helplines stand in one line under the
 * heading, where the reader starts after the focus moves.
 */
export function CrisisBanner({ topics }: { topics: SensitiveTopic[] }) {
  const { alarm, support } = helplines();
  const numbers = [...new Set(topics.flatMap((topic) => linesByTopic[topic]))].slice(0, 3);
  const lines = numbers.map((number) => support.find((line) => line.number === number)).filter((line) => line !== undefined);
  return (
    <div className="flex gap-3 rounded-lg border-2 border-warning-border bg-warning-tint p-4">
      <Phone aria-hidden className="mt-1 size-5 shrink-0" />
      <div className="grid gap-1.5">
        <p className="font-bold">{t("crisis.title")}</p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          {alarm.slice(0, 1).map((line) => (
            <Line key={line.id} line={line} />
          ))}
          {lines.map((line) => (
            <Line key={line.id} line={line} />
          ))}
        </p>
        <p>
          <Link href="/droga/pomoc-czlowieka">{t("crisis.all")}</Link>
        </p>
      </div>
    </div>
  );
}
