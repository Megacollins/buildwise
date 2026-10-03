import Link from "next/link";
import { MapPin } from "lucide-react";
import { Badge, SampleDataBadge } from "@/components/ui";
import { FloorPlan } from "@/components/drawings/FloorPlan";
import type { ProjectSummary } from "@/server/projects";
import { formatMoneyRange, formatDate } from "@/i18n/format";
import { formatArea, type MeasurementSystem } from "@/domain/units";
import type { TFunction } from "@/i18n/config";
import { BudgetBadge } from "./BudgetBadge";

export function ProjectCard({ p, system, bcp47, t }: { p: ProjectSummary; system: MeasurementSystem; bcp47: string; t: TFunction }) {
  return (
    <Link href={`/app/projects/${p.id}`} className="group block overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-line-strong">
      <div className="relative aspect-[16/10] overflow-hidden border-b border-line bg-paper">
        {p.model && <div aria-hidden="true" className="h-full w-full"><FloorPlan model={p.model} levelId="L0" system={system} showDimensions={false} showTags={false} className="h-full w-full scale-[1.25] transition-transform duration-300 group-hover:scale-[1.3]" /></div>}
        <div className="absolute start-3 top-3 flex gap-1.5">
          <Badge tone="accent">{t(`stage.${p.stage}` as never)}</Badge>
          {p.isSample && <Badge>Sample project</Badge>}
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="truncate font-medium text-text">{p.name}</h3>
          <span className="shrink-0 text-[12px] text-faint">v{p.version}</span>
        </div>
        <p className="mt-1 flex items-center gap-1 text-[12.5px] text-muted"><MapPin className="size-3.5" aria-hidden />{p.city}, {p.country}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted tabular">
          <span>{formatArea(p.gfa, system, 0)}</span>
          <span>{p.bedrooms} bed</span>
          <span>{p.floors} {p.floors === 1 ? "floor" : "floors"}</span>
        </div>
        {p.estimate && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-faint">{t("dash.estimated")}</div>
              <div className="font-display text-[15px] font-semibold tabular">{formatMoneyRange(p.estimate, p.currency, bcp47)}</div>
            </div>
            <BudgetBadge estimate={p.estimate} budget={p.budgetTarget} currency={p.currency} bcp47={bcp47} t={t} />
          </div>
        )}
        <div className="mt-2 flex items-center justify-between text-[11.5px] text-faint">
          <span>Updated {formatDate(p.updatedAt, bcp47)}</span>
          <SampleDataBadge label="Sample pricing" />
        </div>
      </div>
    </Link>
  );
}
