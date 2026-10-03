import { moderate } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { controlClass, Label } from "@/components/ui/field";
import type { Moderation } from "@/lib/contracts";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { REJECT_REASONS, rejectReasonCodes } from "@/server/admin/reasons";

type Kind = "need" | "idea" | "evaluation" | "contact" | "readiness" | "report" | "partnership";

/** The moderation state of an entry in words. */
export function ModerationState({ moderation }: { moderation: Pick<Moderation, "status" | "reviewer" | "decided_at" | "reason_pl"> }) {
  if (moderation.status === "do-weryfikacji") return <p className="font-bold">{t("admin.moderation.waiting")}</p>;
  return (
    <p>
      <span className="font-bold">{t(moderation.status === "zatwierdzone" ? "admin.moderation.approved" : "admin.moderation.rejected")}</span>
      {moderation.decided_at && ` ${t("admin.moderation.by", { who: moderation.reviewer ?? "ROPS", date: formatDate(moderation.decided_at) })}`}
      {moderation.reason_pl && ` ${t("admin.moderation.reason", { reason: moderation.reason_pl })}`}
    </p>
  );
}

/** Approve, or reject with a fixed reason and a note (FR-12.8). Works without JavaScript. */
export function DecisionForm({ kind, id, back, approveLabel }: { kind: Kind; id: string; back: string; approveLabel?: string }) {
  const prefix = `decyzja-${id}`;
  return (
    <div className="no-print grid gap-3 @3xl:grid-cols-[auto_1fr] @3xl:items-end">
      <form action={moderate}>
        <input type="hidden" name="rodzaj" value={kind} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="wroc" value={back} />
        <input type="hidden" name="decyzja" value="zatwierdz" />
        <Button type="submit">{approveLabel ?? t("admin.decision.approve")}</Button>
      </form>
      <form action={moderate} className="grid gap-2 @xl:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] @xl:items-end">
        <input type="hidden" name="rodzaj" value={kind} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="wroc" value={back} />
        <input type="hidden" name="decyzja" value="odrzuc" />
        <div className="grid gap-1">
          <Label htmlFor={`${prefix}-powod`}>{t("admin.decision.reason")}</Label>
          <select id={`${prefix}-powod`} name="powod" className={controlClass} defaultValue="inne">
            {rejectReasonCodes.map((code) => (
              <option key={code} value={code}>
                {t(REJECT_REASONS[code])}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${prefix}-notatka`}>{t("admin.decision.note")}</Label>
          <input id={`${prefix}-notatka`} name="notatka" maxLength={500} className={controlClass} />
        </div>
        <Button type="submit" variant="secondary">
          {t("admin.decision.reject")}
        </Button>
      </form>
    </div>
  );
}
