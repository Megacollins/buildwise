"use client";

import { useState, useTransition } from "react";
import { TrendingDown, Loader2 } from "lucide-react";
import type { OptimisationOption } from "@/domain/cost/optimize";
import { applyOpAction } from "@/app/actions/projects";
import { useI18n } from "@/i18n/client";
import { formatMoney } from "@/i18n/format";
import { Button, Notice } from "@/components/ui";

export function OptimisationList({ projectId, options, currency, budget, expected }: {
  projectId: string; options: OptimisationOption[]; currency: string; budget: number | null; expected: number;
}) {
  const { t, bcp47 } = useI18n();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const over = budget ? expected - budget : 0;

  if (!options.length) return <p className="p-5 text-[13px] text-muted">No further savings found for this design.</p>;
  return (
    <div>
      {budget && over > 0 && (
        <div className="border-b border-line px-5 py-3 text-[13px] text-muted">
          Choose changes to close the <span className="font-medium text-danger">{formatMoney(over, currency, bcp47)}</span> gap. Savings are measured by re-running the estimate on the changed model, and don&apos;t simply add up.
        </div>
      )}
      {error && <div className="p-4"><Notice tone="danger">{error}</Notice></div>}
      <ul className="divide-y divide-line">
        {options.map((o) => (
          <li key={o.id} className="flex gap-3 px-5 py-4">
            <TrendingDown className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-text">{o.title}</div>
              <div className="text-[12.5px] text-muted">{o.detail} <span className="text-faint">Trade-off: {o.tradeoff}</span></div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="whitespace-nowrap text-[13px] font-semibold text-ok tabular">{t("cost.saves", { amount: formatMoney(o.saving, currency, bcp47, { compact: true }) })}</span>
              <Button size="sm" variant="secondary" disabled={pending}
                onClick={() => { setBusy(o.id); setError(null); start(async () => { const r = await applyOpAction(projectId, o.op, "optimisation"); if (!r.ok) setError(r.error ?? t("common.error")); setBusy(null); }); }}>
                {busy === o.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}{t("cost.apply")}
              </Button>
            </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
