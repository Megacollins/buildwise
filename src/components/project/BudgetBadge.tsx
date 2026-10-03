import { Badge } from "@/components/ui";
import { formatMoney } from "@/i18n/format";
import type { TFunction } from "@/i18n/config";

/** Budget status from an estimate range. Mid-point is used for the over/under amount. */
export function budgetInfo(estimate: [number, number], budget: number | null) {
  if (!budget) return null;
  const expected = (estimate[0] + estimate[1]) / 2;
  const status = estimate[1] <= budget ? "under" : estimate[0] <= budget ? "within_range" : "over";
  return { status, diff: expected - budget } as const;
}

export function BudgetBadge({ estimate, budget, currency, bcp47, t, showAmount = false }: {
  estimate: [number, number]; budget: number | null; currency: string; bcp47: string; t: TFunction; showAmount?: boolean;
}) {
  const info = budgetInfo(estimate, budget);
  if (!info) return <Badge>No budget set</Badge>;
  const tone = info.status === "under" ? "ok" : info.status === "within_range" ? "warn" : "danger";
  return (
    <Badge tone={tone}>
      {showAmount && info.status !== "within_range"
        ? t(info.diff > 0 ? "budget.overBy" : "budget.underBy", { amount: formatMoney(Math.abs(info.diff), currency, bcp47, { compact: true }) })
        : t(`budget.${info.status}`)}
    </Badge>
  );
}
