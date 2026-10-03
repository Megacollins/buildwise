import { loadWorkspace } from "@/server/workspace";
import { Card, CardHeader, Notice, SampleDataBadge, Stat } from "@/components/ui";
import { OptimisationList } from "@/components/project/OptimisationList";
import { BudgetBadge } from "@/components/project/BudgetBadge";
import { optimisationOptions } from "@/domain/cost/optimize";
import { formatMoney, formatMoneyRange, formatNumber } from "@/i18n/format";
import { formatArea, M2_PER_FT2 } from "@/domain/units";
import type { CostGroup } from "@/domain/cost/engine";

const GROUP_LABEL: Record<CostGroup, string> = {
  site: "Site preparation", foundation: "Foundation", structure: "Structure", walls: "Walls", roofing: "Roofing",
  doors: "Doors", windows: "Windows", electrical: "Electrical", plumbing: "Plumbing", hvac: "HVAC",
  flooring: "Flooring", painting: "Painting", ceilings: "Ceilings", kitchen: "Kitchen", bathrooms: "Bathrooms",
  external_works: "Landscaping & driveway", labour: "Labour", other: "Other (preliminaries & contingency)",
};

export default async function CostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, region, catalog, system, t, bcp47 } = await loadWorkspace(id);
  const e = project.estimate;
  const cur = project.currency;
  const options = optimisationOptions(project.model, region, catalog);
  const budget = project.budgetTarget;
  const perArea: [number, number] = system === "metric" ? e.perM2 : [e.perM2[0] * M2_PER_FT2, e.perM2[1] * M2_PER_FT2];
  const max = e.groups[0]?.amount[1] ?? 1;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <div className="space-y-6">
        <Card>
          <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t("cost.total")} value={formatMoneyRange(e.total, cur, bcp47)} sub={`${t("cost.expected")} ${formatMoney(e.expected, cur, bcp47, { compact: true })}`} />
            <Stat label={t("dash.budget")} value={budget ? formatMoney(budget, cur, bcp47, { compact: true }) : "—"} sub={budget ? <BudgetBadge estimate={e.total} budget={budget} currency={cur} bcp47={bcp47} t={t} /> : undefined} />
            <Stat label="Difference" value={budget ? `${e.expected > budget ? "+" : "−"}${formatMoney(Math.abs(e.expected - budget), cur, bcp47, { compact: true })}` : "—"} sub="Mid-point vs target" />
            <Stat label={t("cost.perArea", { unit: system === "metric" ? "m²" : "ft²" })} value={`${formatMoney(perArea[0], cur, bcp47)}–${formatMoney(perArea[1], cur, bcp47)}`} sub={`${formatArea(e.grossFloorArea, system, 0)} gross floor area`} />
          </div>
          <div className="border-t border-line px-5 py-3">
            {e.dataStatus === "sample"
              ? <Notice tone="warn" title={t("data.sample")}>{region.dataNote}</Notice>
              : <Notice tone="info">{t("cost.estimateNote")}</Notice>}
          </div>
        </Card>

        <Card>
          <CardHeader title={t("cost.breakdown")} subtitle="Every line shows its quantity (measured from the model), rate range and basis." action={<SampleDataBadge />} />
          <div className="divide-y divide-line">
            {e.groups.map((g) => {
              const lines = e.lines.filter((l) => l.group === g.group);
              return (
                <details key={g.group} className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-3 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                    <span className="w-40 shrink-0 text-[13.5px] text-text sm:w-56">{GROUP_LABEL[g.group]}</span>
                    <span className="hidden h-1.5 flex-1 rounded-full bg-surface-3 sm:block"><span className="block h-full rounded-full bg-accent/80" style={{ width: `${(g.amount[1] / max) * 100}%` }} /></span>
                    <span className="ms-auto whitespace-nowrap text-[13px] tabular text-text">{formatMoneyRange(g.amount, cur, bcp47)}</span>
                    <span className="w-10 text-end text-[12px] text-faint tabular">{Math.round((g.amount[1] / e.total[1]) * 100)}%</span>
                  </summary>
                  <div className="overflow-x-auto bg-bg/40 px-5 pb-3">
                    <table className="w-full text-[12.5px]">
                      <thead className="text-[11px] uppercase tracking-wide text-faint">
                        <tr><th className="py-2 text-start font-medium">Item</th><th className="py-2 text-end font-medium">Quantity</th><th className="py-2 text-end font-medium">Rate</th><th className="py-2 text-end font-medium">Amount</th></tr>
                      </thead>
                      <tbody>
                        {lines.map((l) => (
                          <tr key={l.id} className="border-t border-line/60 align-top">
                            <td className="py-2 pe-3"><div className="text-text">{l.label}</div><div className="text-[11.5px] text-faint">{l.basis}</div></td>
                            <td className="py-2 text-end font-mono text-[11.5px] text-muted whitespace-nowrap">{l.unit.startsWith("×") ? `${Math.round(l.quantity * 100)}%` : `${formatNumber(l.quantity, bcp47, l.quantity < 20 ? 1 : 0)} ${l.unit}`}</td>
                            <td className="py-2 text-end font-mono text-[11.5px] text-muted whitespace-nowrap">{l.unit.startsWith("×") ? "—" : `${formatMoney(l.rate[0], cur, bcp47)}–${formatMoney(l.rate[1], cur, bcp47)}`}</td>
                            <td className="py-2 text-end whitespace-nowrap tabular text-text">{formatMoneyRange(l.amount, cur, bcp47)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13.5px] font-semibold">
            <span>{t("cost.total")}</span><span className="tabular">{formatMoneyRange(e.total, cur, bcp47, false)}</span>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card id="optimise" className="scroll-mt-4">
          <CardHeader title={t("cost.optimise")} subtitle="Each option is applied to a copy of your model and re-estimated." />
          <OptimisationList projectId={project.id} options={options} currency={cur} budget={budget} expected={e.expected} />
        </Card>
        <Card>
          <CardHeader title="How this estimate works" />
          <ul className="space-y-2 p-5 text-[13px] text-muted">
            <li>Quantities (areas, lengths, counts) are measured from the building model — not guessed.</li>
            <li>Rates come from the {region.city} regional dataset ({region.dataStatus === "sample" ? "sample data" : region.dataStatus}, compiled {region.dataAsOf}).</li>
            <li>Finish materials are priced from the regional catalog; installation labour is added separately.</li>
            <li>Preliminaries ({Math.round(region.rates.preliminariesFactor * 100)}%) and contingency ({Math.round(region.rates.contingencyFactor * 100)}%) are included.</li>
            <li>Excluded: land, permits & fees, professional fees, furniture, financing and inflation.</li>
            <li className="text-faint">Cost engine v{e.engineVersion}. Calculated on the server for every saved version.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
