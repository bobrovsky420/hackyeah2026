import { Layers } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getGmina, getInnovation } from "@/lib/catalogue";
import type { IdeaStage, NeedStatus } from "@/lib/contracts";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { ideaStageLabel } from "@/lib/labels";
import { needStatusLabel } from "@/server/admin/labels";
import { BlockHeading } from "./block-heading";
import type { SimilarCases } from "@/server/match/similar-cases";

/**
 * Module I, "podobne przypadki": the needs and the idea cards of others
 * that are close to this one, shown only with consent and after ROPS
 * approved them; the others only counted. Never a contact: "Zapytaj ROPS"
 * lets ROPS connect the people.
 */
export function SimilarCasesBlock({ cases, routeId }: { cases: SimilarCases; routeId: string }) {
  if (cases.shown.length === 0 && cases.hiddenCount === 0) return null;
  return (
    <section aria-labelledby="podobne-przypadki" className="grid gap-4 pt-6">
      <BlockHeading id="podobne-przypadki" icon={Layers} title={t("cases.title")} lead={<p>{t("cases.lead")}</p>} />
      {cases.shown.length > 0 && (
        <ul className="grid gap-3">
          {cases.shown.map((item) => {
            const gmina = getGmina(item.place_terc);
            const innovations = item.innovation_ids.flatMap((id) => {
              const innovation = getInnovation(id);
              return innovation ? [innovation] : [];
            });
            return (
              <li key={item.id} className="grid gap-1 rounded-lg border border-border p-4">
                <p className="text-[0.95rem] font-bold text-muted-foreground">
                  {t(item.kind === "need" ? "cases.kind.need" : "cases.kind.idea")}
                  {gmina && ` · ${gmina.name}`} · {formatDate(item.created_at)}
                </p>
                <h3 className="text-[1.1rem] font-bold">{item.title}</h3>
                {item.description && <p>{item.description}</p>}
                <p>
                  <span className="font-bold">{t(item.kind === "need" ? "cases.status" : "cases.stage")}</span>{" "}
                  {item.kind === "need" ? needStatusLabel(item.state as NeedStatus) : ideaStageLabel(item.state as IdeaStage)}
                </p>
                {innovations.length > 0 && (
                  <p>
                    <span className="font-bold">{t("cases.matched")}</span>{" "}
                    {innovations.map((innovation, index) => (
                      <span key={innovation.id}>
                        {index > 0 && ", "}
                        <Link href={`/innowacja/${innovation.id}?droga=${routeId}`}>{innovation.title}</Link>
                      </span>
                    ))}
                  </p>
                )}
                {item.kind === "idea" && (
                  <div className="no-print">
                    <Link href={`/zapytaj?pomysl=${item.id}`} className={buttonVariants({ variant: "text" })}>
                      {t("cases.connect")}
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {cases.hiddenCount > 0 && (
        <p className="text-muted-foreground">
          {t(cases.shown.length > 0 ? "cases.hiddenMore" : "cases.hiddenOnly", { count: cases.hiddenCount })}
        </p>
      )}
    </section>
  );
}
