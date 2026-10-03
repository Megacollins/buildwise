import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getProjectForUser } from "@/server/projects";
import { getI18n, getMeasurementSystem } from "@/server/i18n";
import { Badge, SampleDataBadge } from "@/components/ui";
import { WorkspaceTabs } from "@/components/project/WorkspaceTabs";
import { BudgetBadge } from "@/components/project/BudgetBadge";
import { formatMoneyRange } from "@/i18n/format";
import { formatArea, formatLength } from "@/domain/units";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(id, user.id);
  return { title: project?.name ?? "Project" };
}

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  const { t, bcp47 } = await getI18n();
  const system = await getMeasurementSystem();
  const q = project.estimate.quantities;
  const site = project.site!;

  const facts: [string, string][] = [
    [t("ws.plot"), `${formatLength(site.plotWidthMm, system)} × ${formatLength(site.plotDepthMm, system)}`],
    [t("ws.buildingArea"), formatArea(q.grossFloorArea, system, 0)],
    [t("ws.floors"), String(q.floors)],
    [t("ws.bedrooms"), String(q.bedrooms)],
    [t("ws.bathrooms"), String(q.bathrooms)],
  ];

  return (
    <div>
      <div className="border-b border-line bg-surface/40">
        <div className="mx-auto max-w-[1440px] px-4 pt-5 sm:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent">{t(`stage.${project.stage}` as never)}</Badge>
                {project.isSample && <Badge>Sample project</Badge>}
              </div>
              <h1 className="mt-2 truncate font-display text-xl font-semibold tracking-tight sm:text-2xl">{project.name}</h1>
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
                <MapPin className="size-3.5" aria-hidden /> {site.city}, {site.subdivision}, {site.country}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-6 xl:flex xl:gap-8">
              {facts.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-faint">{k}</dt>
                  <dd className="mt-0.5 text-[13.5px] font-medium tabular">{v}</dd>
                </div>
              ))}
              <div className="col-span-2 min-w-0 sm:col-span-2 xl:col-span-1">
                <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-faint">{t("ws.estimate")}</dt>
                <dd className="mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-semibold tabular">{formatMoneyRange(project.estimate.total, project.currency, bcp47)}</span>
                  <BudgetBadge estimate={project.estimate.total} budget={project.budgetTarget} currency={project.currency} bcp47={bcp47} t={t} showAmount />
                  {project.estimate.dataStatus === "sample" && <SampleDataBadge />}
                </dd>
              </div>
            </dl>
          </div>
          <div className="mt-4"><WorkspaceTabs projectId={project.id} /></div>
        </div>
      </div>
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-8">{children}</div>
    </div>
  );
}
