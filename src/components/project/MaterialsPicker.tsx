"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { Check, Leaf, Truck, Loader2 } from "lucide-react";
import type { BuildingModel, MaterialCategory } from "@/domain/model/types";
import { MATERIAL_CATEGORIES } from "@/domain/model/types";
import { TIERS, type RegionalMaterial } from "@/domain/materials/types";
import type { Region } from "@/domain/regions/types";
import { estimateCost } from "@/domain/cost/engine";
import { applyOp } from "@/domain/model/operations";
import { selectionColors } from "@/domain/materials/colors";
import { applyOpAction } from "@/app/actions/projects";
import { useI18n } from "@/i18n/client";
import { formatMoney, formatMoneyRange } from "@/i18n/format";
import { Badge, Notice, SampleDataBadge, cx } from "@/components/ui";
import { LazyViewer3D } from "@/components/three/LazyViewer";

const UNIT_LABEL: Record<string, string> = { m2: "m²", each: "each", lm: "m", set: "set", point: "point" };

export function MaterialsPicker({ projectId, model, region, catalog, budget }: {
  projectId: string; model: BuildingModel; region: Region; catalog: RegionalMaterial[]; budget: number | null;
}) {
  const { t, bcp47 } = useI18n();
  const [category, setCategory] = useState<MaterialCategory>("flooring");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useOptimistic(model.selections, (s, [c, id]: [MaterialCategory, string]) => ({ ...s, [c]: id }));
  const workingModel = useMemo(() => ({ ...model, selections: optimistic }), [model, optimistic]);

  // Client-side preview uses the same pure engine; the server recomputes authoritatively on save.
  const current = useMemo(() => estimateCost(workingModel, region, catalog), [workingModel, region, catalog]);
  const options = catalog.filter((m) => m.category === category).sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier));
  const deltas = useMemo(() => {
    const out = new Map<string, number>();
    for (const m of options) {
      if (!m.price) continue;
      const next = applyOp(workingModel, { kind: "selection", category, materialId: m.id });
      out.set(m.id, estimateCost(next, region, catalog).expected - current.expected);
    }
    return out;
  }, [options, workingModel, region, catalog, category, current.expected]);
  const colors = useMemo(() => selectionColors(workingModel, catalog), [workingModel, catalog]);
  const qty = current.lines.find((l) => l.id === `mat-${category}`);

  const choose = (m: RegionalMaterial) => {
    if (optimistic[category] === m.id || !m.price) return;
    setError(null);
    start(async () => {
      setOptimistic([category, m.id]);
      const res = await applyOpAction(projectId, { kind: "selection", category, materialId: m.id });
      if (!res.ok) setError(res.error ?? t("common.error"));
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_1fr] xl:grid-cols-[220px_1fr_360px]">
      <nav aria-label="Material categories" className="rounded-xl border border-line bg-surface p-2 lg:self-start">
        <ul className="flex gap-1 overflow-x-auto lg:block lg:space-y-0.5">
          {MATERIAL_CATEGORIES.map((c) => {
            const sel = catalog.find((m) => m.id === optimistic[c]);
            return (
              <li key={c} className="shrink-0">
                <button onClick={() => setCategory(c)} aria-current={category === c}
                  className={cx("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start", category === c ? "bg-surface-3" : "hover:bg-surface-2")}>
                  <span className="size-4 shrink-0 rounded border border-white/10" style={{ background: sel?.color }} aria-hidden />
                  <span className="min-w-0">
                    <span className={cx("block truncate text-[13px]", category === c ? "font-medium text-text" : "text-muted")}>{t(`cat.${c}` as never)}</span>
                    <span className="hidden truncate text-[11.5px] text-faint lg:block">{sel?.name ?? "—"}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <section aria-label={t(`cat.${category}` as never)} className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold">{t(`cat.${category}` as never)}</h2>
            {qty && <p className="text-[12.5px] text-muted">Quantity from model: <span className="tabular text-text">{qty.quantity.toFixed(qty.unit === "each" || qty.unit === "set" || qty.unit === "point" ? 0 : 1)} {qty.unit}</span> · {qty.basis}</p>}
          </div>
          <SampleDataBadge label="Sample prices" />
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        <ul className="grid gap-3 sm:grid-cols-2">
          {options.map((m) => {
            const selected = optimistic[category] === m.id;
            const delta = deltas.get(m.id) ?? 0;
            return (
              <li key={m.id}>
                <button onClick={() => choose(m)} disabled={!m.price} aria-pressed={selected}
                  className={cx("group relative flex h-full w-full flex-col overflow-hidden rounded-xl border text-start transition-colors disabled:opacity-50",
                    selected ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong")}>
                  <div className="h-16 w-full border-b border-line" style={{ background: `linear-gradient(135deg, ${m.color}, ${m.color}dd 60%, ${m.color}aa)` }} aria-hidden />
                  <div className="flex flex-1 flex-col p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-text">{m.name}</div>
                      {selected ? <Check className="size-4 shrink-0 text-accent-strong" aria-label="Selected" /> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge tone={m.tier === "luxury" ? "info" : m.tier === "premium" ? "accent" : "neutral"}>{t(`tier.${m.tier}` as never)}</Badge>
                      {m.price?.availability === "import" && <Badge tone="warn"><Truck className="size-3" aria-hidden /> Usually imported</Badge>}
                      {m.price?.availability === "limited" && <Badge tone="warn">Limited availability</Badge>}
                    </div>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{m.description}</p>
                    {m.environmental && <p className="mt-1.5 flex items-center gap-1 text-[12px] text-ok"><Leaf className="size-3" aria-hidden />{m.environmental}</p>}
                    <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                      <span className="text-[12px] text-muted tabular">
                        {m.price ? `${formatMoney(m.price.price[0], region.currency, bcp47)}–${formatMoney(m.price.price[1], region.currency, bcp47)} / ${UNIT_LABEL[m.unit]}` : "Awaiting regional pricing data"}
                      </span>
                      {!selected && m.price && (
                        <span className={cx("text-[12.5px] font-medium tabular", delta > 0 ? "text-warn" : "text-ok")}>
                          {delta > 0 ? "+" : "−"}{formatMoney(Math.abs(delta), region.currency, bcp47, { compact: true })}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-[12px] text-faint">Prices are supply-only; installation labour is added in the estimate. Cost change shown is for the whole project (mid-point).</p>
      </section>

      <aside className="space-y-4 lg:col-span-2 xl:col-span-1 xl:self-start xl:sticky xl:top-4">
        <div className="rounded-xl border border-line bg-surface p-4" aria-live="polite">
          <div className="flex items-center justify-between">
            <span className="text-[12px] uppercase tracking-wide text-faint">{t("cost.total")}</span>
            {pending ? <span className="flex items-center gap-1 text-[12px] text-muted"><Loader2 className="size-3 animate-spin" aria-hidden /> Saving…</span> : <span className="text-[12px] text-ok">Saved</span>}
          </div>
          <div className="mt-1 font-display text-xl font-semibold tabular">{formatMoneyRange(current.total, region.currency, bcp47)}</div>
          {budget && (
            <div className={cx("mt-1 text-[13px] font-medium tabular", current.expected > budget ? "text-danger" : "text-ok")}>
              {current.expected > budget
                ? t("budget.overBy", { amount: formatMoney(current.expected - budget, region.currency, bcp47, { compact: true }) })
                : t("budget.underBy", { amount: formatMoney(budget - current.expected, region.currency, bcp47, { compact: true }) })}
            </div>
          )}
        </div>
        <div className="h-72">
          <LazyViewer3D model={workingModel} colors={colors} compact initialMode="finished" />
        </div>
      </aside>
    </div>
  );
}
