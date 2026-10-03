import Link from "next/link";
import { ThermometerSun, BookMarked, AlertTriangle, ArrowRight } from "lucide-react";
import { loadWorkspace } from "@/server/workspace";
import { Card, CardHeader, Notice, LinkButton, Badge } from "@/components/ui";
import { FloorPlan } from "@/components/drawings/FloorPlan";
import { LazyViewer3D } from "@/components/three/LazyViewer";
import { formatMoney, formatMoneyRange } from "@/i18n/format";
import { formatArea } from "@/domain/units";
import { validateModel } from "@/domain/model/validate";
import { ModelCheck } from "@/components/project/ModelCheck";

export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, region, colors, system, t, bcp47 } = await loadWorkspace(id);
  const e = project.estimate;
  const req = project.requirements;
  const base = `/app/projects/${id}`;
  const stages = ["CONCEPT", "DETAILED_DESIGN", "PROFESSIONALLY_REVIEWED", "CONSTRUCTION_DOCUMENTATION"] as const;
  const stageIdx = stages.indexOf(project.stage);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Link href={`${base}/plans`} className="group overflow-hidden rounded-xl border border-line bg-paper">
            <div className="aspect-[4/3]"><FloorPlan model={project.model} levelId="L0" system={system} showTags={false} /></div>
            <div className="flex items-center justify-between border-t border-black/10 px-4 py-2 text-[12.5px] text-ink/75">
              <span>A-101 · Ground floor plan</span><ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </div>
          </Link>
          <div className="flex flex-col">
            <div className="aspect-[4/3] md:aspect-auto md:flex-1">
              <LazyViewer3D model={project.model} colors={colors} compact />
            </div>
            <Link href={`${base}/3d`} className="mt-2 text-end text-[12.5px] text-muted hover:text-text">Open 3D viewer →</Link>
          </div>
        </div>

        {project.model.warnings.length > 0 && (
          <Notice tone="warn" title="Design notes">
            <ul className="mt-1 list-disc space-y-0.5 ps-4">{project.model.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </Notice>
        )}

        <Card>
          <CardHeader title="Rooms" subtitle="Clear internal dimensions, measured from the model." />
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-start text-[11.5px] uppercase tracking-wide text-faint">
                <tr className="border-b border-line">
                  <th className="px-5 py-2 text-start font-medium">Room</th><th className="px-3 py-2 text-start font-medium">Level</th>
                  <th className="px-3 py-2 text-end font-medium">Size</th><th className="px-5 py-2 text-end font-medium">Area</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {project.model.levels.flatMap((l) => l.rooms.filter((r) => r.type !== "hall").map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2">
                    <td className="px-5 py-2 text-text">{r.name}</td>
                    <td className="px-3 py-2 text-muted">{l.name}</td>
                    <td className="px-3 py-2 text-end font-mono text-[12px] text-muted">{(r.clearWidth / 1000).toFixed(2)} × {(r.clearDepth / 1000).toFixed(2)}</td>
                    <td className="px-5 py-2 text-end tabular">{formatArea(r.area, system)}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title={t("ws.estimate")} subtitle={t("cost.estimateNote")} action={<LinkButton href={`${base}/cost`} size="sm">{t("ws.cost")}</LinkButton>} />
          <div className="space-y-4 p-5">
            <div>
              <div className="font-display text-2xl font-semibold tabular">{formatMoneyRange(e.total, project.currency, bcp47, false)}</div>
              <div className="mt-1 text-[13px] text-muted tabular">
                {formatMoney(e.perM2[0], project.currency, bcp47)}–{formatMoney(e.perM2[1], project.currency, bcp47)} per m² · {formatArea(e.grossFloorArea, system, 0)} gross
              </div>
            </div>
            {project.budgetTarget && (
              <div className="rounded-lg border border-line bg-bg p-3 text-[13px]">
                <div className="flex justify-between"><span className="text-muted">{t("dash.budget")}</span><span className="tabular">{formatMoney(project.budgetTarget, project.currency, bcp47)}</span></div>
                <div className="mt-1 flex justify-between"><span className="text-muted">{t("cost.expected")}</span><span className="tabular">{formatMoney(e.expected, project.currency, bcp47)}</span></div>
                <div className="mt-2 border-t border-line pt-2">
                  {e.expected > project.budgetTarget ? (
                    <div className="flex items-center justify-between gap-2 text-danger">
                      <span className="font-medium">{t("budget.overBy", { amount: formatMoney(e.expected - project.budgetTarget, project.currency, bcp47) })}</span>
                      <Link href={`${base}/cost#optimise`} className="text-[12.5px] text-accent-strong hover:underline">{t("cost.optimise")} →</Link>
                    </div>
                  ) : (
                    <span className="font-medium text-ok">{t("budget.underBy", { amount: formatMoney(project.budgetTarget - e.expected, project.currency, bcp47) })}</span>
                  )}
                </div>
              </div>
            )}
            {e.dataStatus === "sample" && <Notice tone="warn">{t("data.sampleLong")}</Notice>}
          </div>
        </Card>

        {project.model.designNotes?.length > 0 && (
          <Card>
            <CardHeader title={`Why it looks like this in ${region.city}`} subtitle="Style and regional context are resolved separately, then combined" />
            <ul className="space-y-2.5 p-5 text-[13px]">
              {project.model.designNotes.map((n) => {
                const [head, ...rest] = n.split(": ");
                return (
                  <li key={n} className="flex gap-3">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                    <span><span className="font-medium text-text">{head}</span>{rest.length ? <span className="text-muted"> — {rest.join(": ")}</span> : null}</span>
                  </li>
                );
              })}
            </ul>
            <p className="border-t border-line px-5 py-3 text-[11.5px] text-faint">Regional conventions come from a sample dataset; local practice varies by neighbourhood and site.</p>
          </Card>
        )}

        <Card>
          <CardHeader title="Model check" subtitle="Deterministic consistency checks on the building model" />
          <ModelCheck report={validateModel(project.model)} />
        </Card>

        <Card>
          <CardHeader title={t("ws.stage")} subtitle="Where this design is on the path to construction." />
          <ol className="space-y-3 p-5">
            {stages.map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className={i <= stageIdx ? "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-ink" : "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong text-[11px] text-faint"}>{i + 1}</span>
                <div>
                  <div className={i <= stageIdx ? "text-[13.5px] font-medium text-text" : "text-[13.5px] text-muted"}>{t(`stage.${s}` as never)}</div>
                  {i === 0 && <p className="text-[12.5px] text-muted">{t("stage.CONCEPT.help")}</p>}
                  {i === 2 && <p className="text-[12.5px] text-faint">Requires review by an appropriately qualified professional. <Link className="text-accent-strong hover:underline" href={`${base}/professionals`}>Request review</Link></p>}
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <CardHeader title={`${region.city}, ${region.country}`} subtitle="How this location shapes the design" action={<Badge tone="warn">Sample dataset</Badge>} />
          <div className="space-y-4 p-5 text-[13px]">
            <div className="flex gap-3">
              <ThermometerSun className="mt-0.5 size-4 shrink-0 text-accent-strong" aria-hidden />
              <div>
                <div className="font-medium text-text">{region.climate.zone}</div>
                <p className="text-muted">{region.climate.summary}</p>
                <ul className="mt-2 list-disc space-y-1 ps-4 text-muted">{region.climate.designHints.map((h) => <li key={h}>{h}</li>)}</ul>
              </div>
            </div>
            <div className="flex gap-3">
              <BookMarked className="mt-0.5 size-4 shrink-0 text-accent-strong" aria-hidden />
              <div>
                <div className="font-medium text-text">Local construction practice</div>
                <p className="text-muted">{region.constructionPractice.structure}. {region.constructionPractice.walls}.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
              <div>
                <div className="font-medium text-text">Regulations to confirm locally</div>
                <ul className="mt-1 space-y-1 text-muted">{region.regulatoryReferences.map((r) => <li key={r.name}>{r.name} — <span className="text-faint">{r.scope}</span></li>)}</ul>
                <p className="mt-2 text-[12px] text-faint">Buildwise has not checked this design against these regulations. Setbacks and site coverage used here are indicative.</p>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Brief" subtitle="What you asked for" />
          <dl className="grid grid-cols-2 gap-3 p-5 text-[13px]">
            {[
              ["Bedrooms", req.bedrooms], ["Bathrooms", req.bathrooms], ["Floors", req.floors], ["Parking", req.parking],
              ["Style", t(`style.${req.style}` as never)], ["Garage", req.garage ? "Yes" : "No"],
            ].map(([k, v]) => (
              <div key={String(k)}><dt className="text-faint">{k}</dt><dd className="text-text">{v}</dd></div>
            ))}
            {req.notes && <div className="col-span-2"><dt className="text-faint">Notes</dt><dd className="text-muted">{req.notes}</dd></div>}
            {(req.balcony || req.outdoorSpace) && (
              <div className="col-span-2 text-[12px] text-faint">Balconies and designed outdoor spaces are noted but not yet modelled geometrically.</div>
            )}
          </dl>
        </Card>
      </div>
    </div>
  );
}
