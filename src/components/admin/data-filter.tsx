import { Button } from "@/components/ui/button";
import { controlClass, Label } from "@/components/ui/field";
import { t } from "@/lib/i18n";
import { REAL_ONLY } from "@/server/admin/data";

/** "Dane": all entries, or only the real ones, while the store holds the demonstration data (a GET form, like the other filters). */
export function DataFilter({ realOnly }: { realOnly: boolean }) {
  return (
    <form method="get" className="no-print grid gap-3 @xl:grid-cols-[minmax(0,18rem)_auto] @xl:items-end">
      <div className="grid gap-1">
        <Label htmlFor="filtr-dane">{t("admin.data.label")}</Label>
        <select id="filtr-dane" name="dane" defaultValue={realOnly ? REAL_ONLY : ""} className={controlClass}>
          <option value="">{t("admin.data.all")}</option>
          <option value={REAL_ONLY}>{t("admin.data.real")}</option>
        </select>
      </div>
      <Button type="submit" variant="secondary">
        {t("admin.filter.apply")}
      </Button>
    </form>
  );
}
