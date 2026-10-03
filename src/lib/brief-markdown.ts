import { t } from "@/lib/i18n";
import { indicatorLabel } from "@/lib/labels";
import type { IndicatorKey } from "@/lib/contracts";
import { formatNumber } from "@/lib/text";

/*
 * The brief's page and its Markdown file come from one renderer, the
 * sections of src/server/needs/sections.ts (8.5); this module keeps the
 * indicator line they share.
 */

/** "Osoby w wieku 65 lat i więcej: 22,1 % mieszkańców (2024; mediana Małopolski: 17,4)." */
export function briefIndicatorLine(item: { key: IndicatorKey; value: number; year: number; median: number }): string {
  const label = indicatorLabel(item.key);
  return t("brief.whom.indicator", {
    name: label.name,
    value: formatNumber(item.value),
    unit: label.unit,
    year: item.year,
    median: formatNumber(item.median),
  });
}
