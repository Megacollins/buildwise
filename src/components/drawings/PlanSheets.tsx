"use client";

import { useState } from "react";
import { Printer, Ruler, Tag, Sofa } from "lucide-react";
import type { BuildingModel } from "@/domain/model/types";
import { formatArea, formatDimension, formatLength, type MeasurementSystem } from "@/domain/units";
import { wallFrame } from "@/domain/model/geometry";
import { validateModel } from "@/domain/model/validate";
import { FloorPlan } from "./FloorPlan";
import { Elevation, Section, SitePlan } from "./SiteElevationSection";
import { cx } from "@/components/ui";

interface SheetDef { id: string; number: string; title: string; scale: string; kind: "site" | "plan" | "elevations" | "section" | "schedules" | "finishes"; levelId?: string }

export function PlanSheets({ model, projectName, location, system, versionNumber, versionDate, stageLabel, materialNames }: {
  model: BuildingModel; projectName: string; location: string; system: MeasurementSystem;
  versionNumber: number; versionDate: string; stageLabel: string; materialNames: Record<string, string>;
}) {
  const sheets: SheetDef[] = [
    { id: "site", number: "A-001", title: "Site plan", scale: "1:200", kind: "site" },
    ...model.levels.map((l, i) => ({ id: l.id, number: `A-10${i + 1}`, title: `${l.name} plan`, scale: "1:100", kind: "plan" as const, levelId: l.id })),
    { id: "elev", number: "A-201", title: "Elevations", scale: "1:100", kind: "elevations" },
    { id: "sect", number: "A-301", title: "Section A–A", scale: "1:100", kind: "section" },
    { id: "sched", number: "A-601", title: "Room, door & window schedules", scale: "—", kind: "schedules" },
    { id: "fin", number: "A-602", title: "Finishes schedule", scale: "—", kind: "finishes" },
  ];
  const upcoming = ["Roof plan", "Reflected ceiling plan", "Electrical layout", "Plumbing layout", "Structural drawings (by engineer)"];
  const [active, setActive] = useState(sheets[1].id);
  const [dims, setDims] = useState(true);
  const [tags, setTags] = useState(true);
  const [furniture, setFurniture] = useState(true);
  const sheet = sheets.find((s) => s.id === active)!;
  const check = validateModel(model);

  return (
    <div className="grid gap-5 lg:grid-cols-[230px_1fr]">
      <aside className="no-print space-y-4">
        <nav aria-label="Drawing sheets" className="rounded-xl border border-line bg-surface p-2">
          <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">Sheets</div>
          <ul className="flex gap-1 overflow-x-auto lg:block lg:space-y-0.5">
            {sheets.map((s) => (
              <li key={s.id} className="shrink-0">
                <button onClick={() => setActive(s.id)} aria-current={active === s.id}
                  className={cx("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-[13px]",
                    active === s.id ? "bg-surface-3 text-text" : "text-muted hover:bg-surface-2 hover:text-text")}>
                  <span className="font-mono text-[11px] text-faint">{s.number}</span>
                  <span className="truncate">{s.title}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 hidden border-t border-line px-2 pb-1 pt-3 lg:block">
            <div className="text-[11px] font-medium uppercase tracking-wider text-faint">Roadmap</div>
            <ul className="mt-2 space-y-1.5 text-[12.5px] text-faint">
              {upcoming.map((u) => <li key={u} className="flex items-center justify-between gap-2"><span className="truncate">{u}</span><span className="shrink-0 rounded border border-line px-1.5 text-[10.5px]">Soon</span></li>)}
            </ul>
          </div>
        </nav>
        <div className="rounded-xl border border-line bg-surface p-3 text-[12.5px] text-muted">
          Every line and dimension on these sheets is calculated from the building model. Chain dimensions are to wall centrelines; overall dimensions are to outside faces.
        </div>
      </aside>

      <div className="min-w-0 space-y-3">
        <div className="no-print flex flex-wrap items-center gap-2">
          {sheet.kind === "plan" && (
            <>
              <Toggle on={dims} set={setDims} icon={<Ruler className="size-3.5" />} label="Dimensions" />
              <Toggle on={tags} set={setTags} icon={<Tag className="size-3.5" />} label="Door & window tags" />
              <Toggle on={furniture} set={setFurniture} icon={<Sofa className="size-3.5" />} label="Fixtures" />
            </>
          )}
          <button onClick={() => window.print()} className="ms-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface-2 px-3 text-[12.5px] text-text hover:bg-surface-3">
            <Printer className="size-3.5" aria-hidden /> Print sheet
          </button>
        </div>

        <article className="print-sheet overflow-hidden rounded-lg bg-paper text-ink shadow-[0_1px_0_rgba(255,255,255,0.04),0_20px_50px_-20px_rgba(0,0,0,0.6)]">
          <div className="border-[6px] border-paper">
            <div className="border border-ink/70">
              <div className={cx("relative", sheet.kind === "schedules" || sheet.kind === "finishes" ? "" : "aspect-[1.414]")}>
                {sheet.kind === "site" && <SitePlan model={model} system={system} />}
                {sheet.kind === "plan" && <FloorPlan model={model} levelId={sheet.levelId!} system={system} showDimensions={dims} showTags={tags} showFixtures={furniture} />}
                {sheet.kind === "elevations" && (
                  <div className="grid h-full grid-cols-2 grid-rows-2">
                    {(["front", "rear", "left", "right"] as const).map((side) => (
                      <figure key={side} className="relative border-ink/15 [&:nth-child(odd)]:border-e [&:nth-child(-n+2)]:border-b">
                        <Elevation model={model} side={side} system={system} />
                        <figcaption className="absolute bottom-2 start-3 text-[11px] font-semibold uppercase tracking-wider">{side} elevation</figcaption>
                      </figure>
                    ))}
                  </div>
                )}
                {sheet.kind === "section" && <Section model={model} system={system} />}
                {sheet.kind === "schedules" && <Schedules model={model} system={system} />}
                {sheet.kind === "finishes" && <FinishSchedule model={model} system={system} materialNames={materialNames} />}
              </div>
              <TitleBlock projectName={projectName} location={location} sheet={sheet} version={versionNumber} date={versionDate} stageLabel={stageLabel} system={system}
                checkLabel={check.valid ? `Model check ${check.results.filter((r) => r.status === "pass").length}/${check.results.length}` : `Model check: ${check.errors} problem(s)`} />
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

function Toggle({ on, set, icon, label }: { on: boolean; set: (v: boolean) => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={() => set(!on)} aria-pressed={on}
      className={cx("inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px]", on ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-line text-muted hover:text-text")}>
      {icon}{label}
    </button>
  );
}

function TitleBlock({ projectName, location, sheet, version, date, stageLabel, system, checkLabel }: {
  projectName: string; location: string; sheet: SheetDef; version: number; date: string; stageLabel: string; system: MeasurementSystem; checkLabel: string;
}) {
  const cell = "border-ink/40 px-3 py-1.5";
  const label = "block text-[9px] font-semibold uppercase tracking-wider text-ink/55";
  return (
    <div className="grid grid-cols-2 border-t border-ink/70 text-[11.5px] sm:grid-cols-[1.3fr_1.6fr_1fr_0.7fr_0.7fr_0.6fr]">
      <div className={cx(cell, "flex items-center gap-2 border-e font-bold tracking-tight")}>
        <svg viewBox="0 0 28 28" className="size-5" aria-hidden><rect x="1" y="1" width="26" height="26" rx="7" fill="#1d2124" /><path d="M8 20V12.5L14 8l6 4.5V20h-4.2v-4.4h-3.6V20z" fill="none" stroke="#f3f1ec" strokeWidth="2" strokeLinejoin="round" /></svg>
        Buildwise
      </div>
      <div className={cx(cell, "sm:border-e")}><span className={label}>Project</span>{projectName}<span className="block text-[10.5px] text-ink/60">{location}</span></div>
      <div className={cx(cell, "border-e border-t sm:border-t-0")}><span className={label}>Drawing</span>{sheet.title}</div>
      <div className={cx(cell, "border-t sm:border-e sm:border-t-0")}><span className={label}>Sheet</span><span className="font-mono">{sheet.number}</span></div>
      <div className={cx(cell, "border-e border-t sm:border-t-0")}><span className={label}>Scale @ A3</span><span className="font-mono">{sheet.scale}</span></div>
      <div className={cx(cell, "border-t sm:border-t-0")}><span className={label}>Rev.</span><span className="font-mono">v{version}</span></div>
      <div className={cx(cell, "col-span-2 flex flex-wrap items-center justify-between gap-2 border-t bg-ink/[0.04] sm:col-span-6")}>
        <span className="font-semibold uppercase tracking-wide text-[#9a4b12]">{stageLabel} — not for construction. Professional review required.</span>
        <span className="text-ink/60">{checkLabel} · Units: {system === "metric" ? "metres" : "feet & inches"} · Issued {date}</span>
      </div>
    </div>
  );
}

function Schedules({ model, system }: { model: BuildingModel; system: MeasurementSystem }) {
  const th = "border-b border-ink/40 px-2 py-1.5 text-start text-[10px] font-semibold uppercase tracking-wider text-ink/60";
  const td = "border-b border-ink/10 px-2 py-1 text-[11.5px]";
  const roomName = (id: string | null) => model.levels.flatMap((l) => l.rooms).find((r) => r.id === id)?.name ?? "Exterior";
  return (
    <div className="grid gap-6 p-5 lg:grid-cols-2">
      <section className="lg:col-span-2">
        <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wider">Room schedule</h3>
        <table className="w-full"><thead><tr><th className={th}>Level</th><th className={th}>Room</th><th className={th}>Clear size</th><th className={cx(th, "text-end")}>Area</th><th className={cx(th, "text-end")}>Ceiling</th></tr></thead>
          <tbody>{model.levels.flatMap((l) => l.rooms.map((r) => (
            <tr key={r.id}><td className={td}>{l.name}</td><td className={td}>{r.name}</td>
              <td className={cx(td, "font-mono")}>{formatDimension(r.clearWidth, system)} × {formatDimension(r.clearDepth, system)}</td>
              <td className={cx(td, "text-end font-mono")}>{formatArea(r.area, system)}</td>
              <td className={cx(td, "text-end font-mono")}>{formatLength(l.ceilingHeight, system)}</td></tr>
          )))}</tbody>
        </table>
      </section>
      <section>
        <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wider">Door schedule</h3>
        <table className="w-full"><thead><tr><th className={th}>Tag</th><th className={th}>Type</th><th className={th}>W × H</th><th className={th}>Into</th></tr></thead>
          <tbody>{model.levels.flatMap((l) => l.doors.map((d) => (
            <tr key={d.id}><td className={cx(td, "font-mono")}>{d.tag}</td><td className={cx(td, "capitalize")}>{d.kind}</td>
              <td className={cx(td, "font-mono")}>{d.width} × {d.height}</td><td className={td}>{roomName(d.swingInto)}</td></tr>
          )))}</tbody>
        </table>
      </section>
      <section>
        <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wider">Window schedule</h3>
        <table className="w-full"><thead><tr><th className={th}>Tag</th><th className={th}>W × H</th><th className={th}>Sill</th><th className={th}>Room</th><th className={th}>Facing</th></tr></thead>
          <tbody>{model.levels.flatMap((l) => l.windows.map((w) => {
            const wall = l.walls.find((x) => x.id === w.wallId)!;
            const { ux } = wallFrame(wall);
            const facing = ux !== 0 ? (wall.a.y === 0 ? "Front" : "Rear") : wall.a.x === 0 ? "Left" : "Right";
            return (
              <tr key={w.id}><td className={cx(td, "font-mono")}>{w.tag}</td><td className={cx(td, "font-mono")}>{w.width} × {w.height}</td>
                <td className={cx(td, "font-mono")}>{w.sill}</td><td className={td}>{roomName(w.roomId)}</td><td className={td}>{facing}</td></tr>
            );
          }))}</tbody>
        </table>
        <p className="mt-2 text-[10.5px] text-ink/55">Opening sizes in mm. Structural lintels and window specifications to be confirmed by professionals.</p>
      </section>
    </div>
  );
}

function FinishSchedule({ model, system, materialNames }: { model: BuildingModel; system: MeasurementSystem; materialNames: Record<string, string> }) {
  const th = "border-b border-ink/40 px-2 py-1.5 text-start text-[10px] font-semibold uppercase tracking-wider text-ink/60";
  const td = "border-b border-ink/10 px-2 py-1 text-[11.5px]";
  const name = (c: keyof BuildingModel["selections"]) => materialNames[model.selections[c] ?? ""] ?? "—";
  return (
    <div className="p-5">
      <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wider">Finishes schedule</h3>
      <table className="w-full"><thead><tr><th className={th}>Room</th><th className={th}>Floor</th><th className={th}>Walls</th><th className={th}>Ceiling</th><th className={cx(th, "text-end")}>Area</th></tr></thead>
        <tbody>{model.levels.flatMap((l) => l.rooms.map((r) => (
          <tr key={r.id}><td className={td}>{r.name} <span className="text-ink/50">({l.name})</span></td>
            <td className={td}>{r.type === "garage" ? "Power-floated concrete" : name("flooring")}</td>
            <td className={td}>{r.type === "garage" ? "Fair-faced / emulsion" : name("wall_paint")}</td>
            <td className={td}>{r.type === "garage" ? "Exposed soffit" : name("ceiling")}</td>
            <td className={cx(td, "text-end font-mono")}>{formatArea(r.area, system)}</td></tr>
        )))}</tbody>
      </table>
      <p className="mt-3 text-[11px] text-ink/60">Exterior: {name("exterior_finish")} · Roof: {name("roofing")} · Windows: {name("windows")} · Doors: {name("doors")}</p>
    </div>
  );
}
