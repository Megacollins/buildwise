"use client";

import type { BuildingModel } from "@/domain/model/types";
import { buildingBounds, elevationProjector, elevationRange, openingsOn, roofBlocks, roofFaces, roofGeometry, wallFrame, type ElevationSide } from "@/domain/model/geometry";
import { formatDimension, formatLength, type MeasurementSystem } from "@/domain/units";
import { DimLine, DrawingSvg, Hatch, INK, INK_FAINT, INK_SOFT, LevelMark, LW, NorthArrow, ScaleBar } from "./primitives";

/* ------------------------------------------------------------------ Site plan */

export function SitePlan({ model, system, className }: { model: BuildingModel; system: MeasurementSystem; className?: string }) {
  const { plot, setbacks, footprintOrigin: o, driveway, parking } = model.site;
  const PW = plot.width, PD = plot.depth;
  const t = model.params.wallThickness.exterior;
  const bb = buildingBounds(model).outer;
  const bx = o.x + bb.x0, by = o.y + bb.y0;
  const bw = bb.x1 - bb.x0, bd = bb.y1 - bb.y0;
  const m = 4500;
  const fmt = (mm: number) => formatDimension(mm, system);
  const Y = (y: number) => -y;
  const roof = roofGeometry(model);
  const xg = model.exteriorGeometry;

  return (
    <DrawingSvg viewBox={[-m, -PD - m, PW + 2 * m, PD + 2 * m]} title="Site plan" className={className}>
      <defs><Hatch id="bldg" spacing={300} color={INK_SOFT} /></defs>
      {/* Street */}
      <rect x={-m} y={0 + 700} width={PW + 2 * m} height={2600} fill="#e4e1da" />
      <text x={PW / 2} y={2250} fontSize={380} textAnchor="middle" fill={INK_SOFT} letterSpacing={120}>STREET / ACCESS ROAD</text>
      {/* Plot boundary (dash-dot) */}
      <rect x={0} y={-PD} width={PW} height={PD} fill="#eef0e8" stroke={INK} strokeWidth={LW.medium} strokeDasharray="600 150 80 150" />
      {/* Setback line */}
      <rect x={setbacks.left} y={Y(PD - setbacks.rear)} width={PW - setbacks.left - setbacks.right} height={PD - setbacks.rear - setbacks.front}
        fill="none" stroke={INK_FAINT} strokeWidth={LW.hair} strokeDasharray="200 120" />
      <text x={setbacks.left + 150} y={Y(PD - setbacks.rear) + 330} fontSize={200} fill={INK_FAINT}>Building line (indicative setbacks)</text>
      {/* Compound: paving, paths, drains */}
      {xg && (
        <g>
          <defs>
            <pattern id="paving" patternUnits="userSpaceOnUse" width={400} height={200}>
              <rect width={400} height={200} fill="#e3dfd6" />
              <path d="M0 0H400M0 100H400M200 0V100M100 100V200M300 100V200" stroke="#c8c2b6" strokeWidth={12} />
            </pattern>
          </defs>
          {xg.site.paving.map((r, i) => <rect key={`pv${i}`} x={r.x} y={Y(r.y + r.depth)} width={r.width} height={r.depth} fill="url(#paving)" stroke={INK_FAINT} strokeWidth={LW.hair} />)}
          {xg.site.paths.map((r, i) => <rect key={`pa${i}`} x={r.x} y={Y(r.y + r.depth)} width={r.width} height={r.depth} fill="url(#paving)" stroke={INK_FAINT} strokeWidth={LW.hair} />)}
          {xg.site.drains.map((d, i) => <line key={`dr${i}`} x1={d.a.x} y1={Y(d.a.y)} x2={d.b.x} y2={Y(d.b.y)} stroke="#4f7fa6" strokeWidth={LW.light} strokeDasharray="300 120" />)}
        </g>
      )}
      {/* Driveway & parking */}
      {driveway && (
        <g>
          <rect x={driveway.x} y={Y(driveway.y + driveway.depth)} width={driveway.width} height={driveway.depth} fill="#d9d6cf" stroke={INK_SOFT} strokeWidth={LW.hair} />
          {!parking.covered && Array.from({ length: parking.spaces }, (_, i) => {
            const sw = driveway.width / parking.spaces;
            return (
              <g key={i}>
                <rect x={driveway.x + i * sw + 150} y={Y(driveway.y + driveway.depth) + 250} width={sw - 300} height={Math.min(5000, driveway.depth - 500)} fill="none" stroke={INK_SOFT} strokeWidth={LW.hair} strokeDasharray="150 90" />
                <text x={driveway.x + (i + 0.5) * sw} y={Y(driveway.y + driveway.depth / 2)} fontSize={260} textAnchor="middle" fill={INK_SOFT}>P{i + 1}</text>
              </g>
            );
          })}
          <text x={driveway.x + driveway.width / 2} y={Y(driveway.y + 450)} fontSize={180} textAnchor="middle" fill={INK_SOFT}>DRIVEWAY</text>
        </g>
      )}
      {/* Boundary, gates, trees, services */}
      {xg && (
        <g>
          {xg.site.boundary.map((b) => {
            const horizontal = b.a.y === b.b.y;
            const x = Math.min(b.a.x, b.b.x) - (horizontal ? 0 : b.thickness / 2), y = Math.min(b.a.y, b.b.y) - (horizontal ? b.thickness / 2 : 0);
            const w = horizontal ? Math.abs(b.b.x - b.a.x) : b.thickness, h = horizontal ? b.thickness : Math.abs(b.b.y - b.a.y);
            const fill = b.kind === "masonry_wall" ? INK : b.kind === "low_wall" ? INK_SOFT : b.kind === "hedge" ? "#7da36a" : "#fff";
            return <rect key={b.id} x={x} y={Y(y + h)} width={Math.max(w, 60)} height={Math.max(h, 60)} fill={fill} stroke={INK} strokeWidth={b.kind === "fence" ? LW.light : LW.hair} />;
          })}
          {xg.site.gates.map((g) => (
            <g key={g.id}>
              <line x1={g.a.x} y1={Y(g.a.y) - 250} x2={g.b.x} y2={Y(g.b.y) - 250} stroke={INK} strokeWidth={LW.medium} strokeDasharray="250 120" />
              <rect x={g.a.x - 200} y={Y(g.a.y) - 200} width={400} height={400} fill={INK} /><rect x={g.b.x - 200} y={Y(g.b.y) - 200} width={400} height={400} fill={INK} />
              <text x={(g.a.x + g.b.x) / 2} y={Y(g.a.y) - 450} fontSize={190} textAnchor="middle" fill={INK}>{g.kind === "vehicle" ? "SLIDING GATE" : "GATE"}</text>
            </g>
          ))}
          {xg.site.trees.map((tr) => (
            <g key={tr.id} stroke="#4f7a3a" fill="rgba(110,150,90,0.18)" strokeWidth={LW.hair}>
              <circle cx={tr.x} cy={Y(tr.y)} r={tr.radius} />
              <path d={`M${tr.x - tr.radius * 0.5} ${Y(tr.y)}h${tr.radius}M${tr.x} ${Y(tr.y) - tr.radius * 0.5}v${tr.radius}`} />
            </g>
          ))}
          {(xg.site.carports ?? []).map((cp) => (
            <g key={cp.id}>
              {/* Roof outline dashed (overhead), posts solid */}
              <rect x={cp.x} y={Y(cp.y + cp.depth)} width={cp.width} height={cp.depth} fill="none" stroke={INK} strokeWidth={LW.light} strokeDasharray="200 120" />
              <line x1={cp.x} y1={Y(cp.y + cp.depth)} x2={cp.x + cp.width} y2={Y(cp.y)} stroke={INK_SOFT} strokeWidth={LW.hair} strokeDasharray="200 120" />
              {cp.posts.map((p, i) => <rect key={i} x={p.x - 60} y={Y(p.y + 60)} width={120} height={120} fill={INK} />)}
              <text x={cp.x + cp.width / 2} y={Y(cp.y + cp.depth / 2) - 120} fontSize={200} textAnchor="middle" fill={INK}>CARPORT OVER</text>
            </g>
          ))}
          {xg.site.services.map((sv) => {
            const roof = sv.placement === "roof", under = sv.placement === "underground";
            const label = sv.kind === "generator_house" ? "GENERATOR HOUSE" : roof ? "WATER TANK (ON ROOF)" : under ? "WATER TANK (UNDERGROUND)" : "WATER TANK (ON STAND)";
            return (
              <g key={sv.id}>
                <rect x={sv.x} y={Y(sv.y + sv.depth)} width={sv.width} height={sv.depth} fill={roof ? "none" : "#fff"} stroke={INK} strokeWidth={LW.light} strokeDasharray={roof || under ? "160 100" : undefined} />
                {sv.kind === "water_tank" && !roof && !under && <circle cx={sv.x + sv.width / 2} cy={Y(sv.y + sv.depth / 2)} r={Math.min(sv.width, sv.depth) * 0.42} fill="none" stroke={INK} strokeWidth={LW.hair} />}
                <text x={sv.x + sv.width / 2} y={Y(sv.y) + 280} fontSize={170} textAnchor="middle" fill={INK}>{label}</text>
              </g>
            );
          })}
        </g>
      )}
      {/* Pool */}
      {xg?.site.pool && (
        <g>
          <rect x={xg.site.pool.deck.x} y={Y(xg.site.pool.deck.y + xg.site.pool.deck.depth)} width={xg.site.pool.deck.width} height={xg.site.pool.deck.depth} fill="#efe9de" stroke={INK_SOFT} strokeWidth={LW.hair} />
          <rect x={xg.site.pool.water.x} y={Y(xg.site.pool.water.y + xg.site.pool.water.depth)} width={xg.site.pool.water.width} height={xg.site.pool.water.depth} fill="#bfe1ef" stroke={INK} strokeWidth={LW.light} />
          <path d={`M${xg.site.pool.water.x + 300} ${Y(xg.site.pool.water.y + xg.site.pool.water.depth / 2)} q 400 -250 800 0 t 800 0 t 800 0`} fill="none" stroke="#5b9fbd" strokeWidth={LW.light} />
          <text x={xg.site.pool.water.x + xg.site.pool.water.width / 2} y={Y(xg.site.pool.water.y + xg.site.pool.water.depth / 2) + 380} fontSize={220} textAnchor="middle" fill={INK}>POOL {(xg.site.pool.water.width / 1000).toFixed(1)} × {(xg.site.pool.water.depth / 1000).toFixed(1)} m</text>
          <rect x={xg.site.pool.equipment.x} y={Y(xg.site.pool.equipment.y + xg.site.pool.equipment.depth)} width={xg.site.pool.equipment.width} height={xg.site.pool.equipment.depth} fill="#fff" stroke={INK_SOFT} strokeWidth={LW.hair} />
        </g>
      )}
      {/* Roof outline (dashed) & footprint */}
      {model.roof.type !== "flat" && (
        <rect x={bx - roof.overhang} y={Y(by + bd + roof.overhang)} width={bw + 2 * roof.overhang} height={bd + 2 * roof.overhang} fill="none" stroke={INK_SOFT} strokeWidth={LW.hair} strokeDasharray="160 100" />
      )}
      {model.levels.find((l) => l.index === 0)!.rooms.map((r) => (
        <rect key={`fp-${r.id}`} x={o.x + r.x - t / 2} y={Y(o.y + r.y + r.depth + t / 2)} width={r.width + t} height={r.depth + t} fill="url(#bldg)" stroke="none" />
      ))}
      {model.levels.find((l) => l.index === 0)!.walls.filter((w) => w.exterior).map((w) => (
        <line key={`fo-${w.id}`} x1={o.x + w.a.x} y1={Y(o.y + w.a.y)} x2={o.x + w.b.x} y2={Y(o.y + w.b.y)} stroke={INK} strokeWidth={t} strokeLinecap="square" />
      ))}
      {/* Porch, steps and balconies (balconies are above ground, so dashed) */}
      {xg && (
        <g fill="#fff" stroke={INK} strokeWidth={LW.light}>
          {xg.attached.porch && <rect x={o.x + xg.attached.porch.x} y={Y(o.y + xg.attached.porch.y + xg.attached.porch.depth)} width={xg.attached.porch.width} height={xg.attached.porch.depth} />}
          {xg.attached.steps && (
            <g>
              <rect x={o.x + xg.attached.steps.x} y={Y(o.y + xg.attached.steps.y + xg.attached.steps.depth)} width={xg.attached.steps.width} height={xg.attached.steps.depth} />
              {Array.from({ length: Math.max(0, Math.round(xg.attached.steps.depth / xg.attached.steps.tread) - 1) }, (_, k) => (
                <line key={k} x1={o.x + xg.attached.steps!.x} x2={o.x + xg.attached.steps!.x + xg.attached.steps!.width} y1={Y(o.y + xg.attached.steps!.y + (k + 1) * xg.attached.steps!.tread)} y2={Y(o.y + xg.attached.steps!.y + (k + 1) * xg.attached.steps!.tread)} strokeWidth={LW.hair} />
              ))}
            </g>
          )}
          {xg.attached.balconies.map((b) => <rect key={b.id} x={o.x + b.x} y={Y(o.y + b.y + b.depth)} width={b.width} height={b.depth} fill="none" strokeDasharray="160 90" strokeWidth={LW.hair} />)}
        </g>
      )}
      <rect x={bx + bw / 2 - 2600} y={Y(by + bd / 2) - 520} width={5200} height={1000} fill="#fff" stroke={INK_SOFT} strokeWidth={LW.hair} />
      <text x={bx + bw / 2} y={Y(by + bd / 2) - 60} fontSize={280} textAnchor="middle" fill={INK} fontWeight={700}>PROPOSED HOUSE</text>
      <text x={bx + bw / 2} y={Y(by + bd / 2) + 300} fontSize={220} textAnchor="middle" fill={INK_SOFT}>{model.levels.length} storey{model.levels.length > 1 ? "s" : ""}</text>
      {/* Entrance marker */}
      {(() => {
        const g = model.levels[0];
        const entrance = g.doors.find((d) => d.kind === "entrance");
        const wall = entrance && g.walls.find((w) => w.id === entrance.wallId);
        if (!entrance || !wall) return null;
        const { ux } = wallFrame(wall);
        const ex = o.x + wall.a.x + ux * (entrance.offset + entrance.width / 2);
        const entryY = o.y + (xg?.attached.steps?.y ?? xg?.attached.porch?.y ?? -t / 2);
        return (
          <g>
            <path d={`M${ex} ${Y(entryY) + 300} L${ex - 260} ${Y(entryY) + 750} L${ex + 260} ${Y(entryY) + 750} Z`} fill={INK} />
            <text x={ex} y={Y(entryY) + 1100} fontSize={200} textAnchor="middle" fill={INK}>ENTRY</text>
          </g>
        );
      })()}
      {/* Dimensions */}
      <DimLine x1={0} y1={0} x2={PW} y2={0} offset={-(PD + 1200)} label={fmt(PW)} />
      <DimLine vertical x1={0} y1={0} x2={0} y2={-PD} offset={-1400} label={fmt(PD)} />
      <DimLine vertical x1={PW} y1={0} x2={PW} y2={Y(by)} offset={1200} label={fmt(by)} />
      <DimLine vertical x1={PW} y1={Y(by + bd)} x2={PW} y2={-PD} offset={1200} label={fmt(PD - by - bd)} />
      <DimLine x1={0} y1={Y(by + bd / 2)} x2={bx} y2={Y(by + bd / 2)} offset={0} label={fmt(bx)} />
      <DimLine x1={bx + bw} y1={Y(by + bd / 2)} x2={PW} y2={Y(by + bd / 2)} offset={0} label={fmt(PW - bx - bw)} />
      <NorthArrow x={PW + m * 0.55} y={-PD - m * 0.2 + 1200} size={1400} angle={-model.site.northAngleDeg} />
      <ScaleBar x={0} y={3900} metres={10} />
    </DrawingSvg>
  );
}

/* ----------------------------------------------------------------- Elevations */

export function Elevation({ model, side, system, className }: { model: BuildingModel; side: ElevationSide; system: MeasurementSystem; className?: string }) {
  const proj = elevationProjector(model, side);
  const roof = roofGeometry(model);
  const range = elevationRange(model, side);
  const faceW = range.u1 - range.u0;
  const u0 = range.u0;
  const plinth = model.exterior?.plinth ?? 300;
  const topZ = model.roof.type === "flat" ? roof.parapetZ : roof.ridgeZ;
  const m = 3500;
  const Z = (z: number) => -(z + plinth);
  // Roof polygons: each roof surface projected onto this elevation, nearer volumes drawn last.
  const blocks = roofBlocks(model);
  // Painter's order: farthest volume first, nearest last.
  const nearness = (b: (typeof blocks)[number]) => (side === "front" ? -b.y0 : side === "rear" ? b.y1 : side === "left" ? -b.x0 : b.x1);
  const ordered = [...blocks].sort((p, q) => nearness(p) - nearness(q));
  const roofPolys = model.roof.type === "flat" ? [] : ordered.flatMap((b) => {
    const f = roofFaces(model, b);
    return [
      ...f.slopes.map((poly) => ({ fill: "#8f969a", pts: poly.map((v) => [proj.u(v.x, v.y), Z(v.z)] as const) })),
      ...f.gables.map((poly) => ({ fill: "#fbfaf7", pts: poly.map((v) => [proj.u(v.x, v.y), Z(v.z)] as const) })),
    ];
  });

  return (
    <DrawingSvg viewBox={[u0 - m, Z(topZ) - m * 0.8, faceW + 2 * m, topZ + plinth + m * 1.6]} title={`${side} elevation`} className={className}>
      {/* Ground */}
      <line x1={u0 - m * 0.8} y1={0} x2={u0 + faceW + m * 0.8} y2={0} stroke={INK} strokeWidth={LW.heavy} />
      {/* Wall face */}
      <rect x={u0} y={Z(roof.eaveZ)} width={faceW} height={roof.eaveZ + plinth} fill="#fbfaf7" stroke={INK} strokeWidth={LW.medium} />
      <rect x={u0} y={-plinth} width={faceW} height={plinth} fill="#e2ded6" stroke={INK} strokeWidth={LW.light} />
      {/* Floor lines */}
      {model.levels.slice(1).map((l) => (
        <line key={l.id} x1={u0} y1={Z(l.elevation)} x2={u0 + faceW} y2={Z(l.elevation)} stroke={INK_FAINT} strokeWidth={LW.hair} strokeDasharray="100 80" />
      ))}
      {/* Openings on walls facing this side */}
      {model.levels.map((l) =>
        l.walls.filter((w) => proj.facing(w, l)).flatMap((w) =>
          openingsOn(l, w.id).map((op) => {
            const { ux, uy } = wallFrame(w);
            const pa = proj.u(w.a.x + ux * op.from, w.a.y + uy * op.from);
            const pb = proj.u(w.a.x + ux * op.to, w.a.y + uy * op.to);
            const x = Math.min(pa, pb), wd = Math.abs(pb - pa);
            const zb = l.elevation + op.bottom, zt = l.elevation + op.top;
            const isDoor = op.kind === "door";
            return (
              <g key={`${l.id}-${op.ref.id}`}>
                <rect x={x} y={Z(zt)} width={wd} height={zt - zb} fill={isDoor ? "#d8d3c9" : "#c9d3d6"} stroke={INK} strokeWidth={LW.light} />
                {!isDoor && <line x1={x + wd / 2} y1={Z(zt)} x2={x + wd / 2} y2={Z(zb)} stroke={INK_SOFT} strokeWidth={LW.hair} />}
                {!isDoor && <rect x={x - 60} y={Z(zb)} width={wd + 120} height={60} fill={INK_SOFT} />}
                <text x={x + wd / 2} y={Z(zt) - 90} fontSize={130} textAnchor="middle" fill={INK_SOFT} fontFamily="var(--font-jetbrains), monospace">{(op.ref as { tag: string }).tag}</text>
              </g>
            );
          }),
        ),
      )}
      {/* Projecting elements: porch, steps, balconies, hoods, AC units */}
      <AttachedElevation model={model} side={side} Z={Z} plinth={plinth} />
      {/* Roof */}
      {model.roof.type === "flat"
        ? <rect x={u0} y={Z(roof.parapetZ)} width={faceW} height={roof.parapetZ - roof.eaveZ} fill="#fbfaf7" stroke={INK} strokeWidth={LW.medium} />
        : roofPolys.map((poly, i) => <polygon key={i} points={poly.pts.map((p) => p.join(",")).join(" ")} fill={poly.fill} stroke={INK} strokeWidth={LW.light} strokeLinejoin="round" />)}
      {/* Levels */}
      <LevelMark x={u0 + faceW + 300} y={Z(0)} label="Ground floor" value="±0.00" align="right" />
      {model.levels.slice(1).map((l) => (
        <LevelMark key={l.id} x={u0 + faceW + 300} y={Z(l.elevation)} label={l.name} value={`+${formatLength(l.elevation, system, { compact: true })}`} align="right" />
      ))}
      <LevelMark x={u0 + faceW + 300} y={Z(topZ)} label={model.roof.type === "flat" ? "Top of parapet" : "Ridge"} value={`+${formatLength(topZ, system, { compact: true })}`} align="right" />
      <DimLine vertical x1={u0} y1={Z(0)} x2={u0} y2={Z(topZ)} offset={-900} label={formatDimension(topZ, system)} />
      <DimLine x1={u0} y1={0} x2={u0 + faceW} y2={0} offset={900} label={formatDimension(faceW, system)} />
      <text x={u0 + faceW / 2} y={340} fontSize={140} textAnchor="middle" fill={INK_SOFT}>Ground floor raised {plinth} mm above finished ground (indicative)</text>
    </DrawingSvg>
  );
}

/* -------------------------------------------------------------------- Section */

/** Section A–A: a cut along y (front → rear) through the middle of the stair room (or the building centre). */
export function Section({ model, system, className }: { model: BuildingModel; system: MeasurementSystem; className?: string }) {
  const g = model.levels[0];
  const stairRoom = g.rooms.find((r) => r.type === "stair");
  const cutX = stairRoom ? stairRoom.x + stairRoom.width * 0.25 : model.footprint.width / 2;
  const D = model.footprint.depth;
  const t = model.params.wallThickness.exterior;
  const slab = model.params.slabThickness;
  const roof = roofGeometry(model);
  const topZ = model.roof.type === "flat" ? roof.parapetZ : roof.ridgeZ;
  const plinth = model.exterior?.plinth ?? 300;
  const m = 3500;
  const Z = (z: number) => -(z + plinth);
  const U = (y: number) => y; // front at left

  const cutWalls = model.levels.flatMap((l) =>
    l.walls
      .filter((w) => w.a.y === w.b.y && Math.min(w.a.x, w.b.x) <= cutX && Math.max(w.a.x, w.b.x) >= cutX)
      .map((w) => ({ l, w, openings: openingsOn(l, w.id).filter((o) => {
        const { ux } = wallFrame(w);
        const xs = [w.a.x + ux * o.from, w.a.x + ux * o.to];
        return Math.min(...xs) <= cutX && Math.max(...xs) >= cutX;
      }) })),
  );
  const stair = g.stairs[0];

  return (
    <DrawingSvg viewBox={[-t - m, Z(topZ) - m * 0.7, D + 2 * t + 2 * m, topZ + plinth + m * 1.5]} title="Section A–A" className={className}>
      <line x1={-m} y1={0} x2={D + m} y2={0} stroke={INK} strokeWidth={LW.heavy} />
      <rect x={-m} y={0} width={D + 2 * m} height={400} fill="#dcd8cf" />
      {/* Slabs */}
      {model.levels.flatMap((l) => l.rooms.filter((r) => r.x <= cutX && r.x + r.width >= cutX).map((r) => (
        <rect key={`${l.id}-${r.id}`} x={U(r.y - t / 2)} y={Z(l.elevation)} width={r.depth + t} height={l.index === 0 ? plinth : slab} fill={INK} />
      )))}
      {/* Roof slab / structure */}
      {model.roof.type === "flat" ? (
        <g>
          <rect x={U(-t / 2)} y={Z(roof.eaveZ)} width={D + t} height={slab} fill={INK} />
        </g>
      ) : (
        <path
          d={(!roof.ridgeAlongX)
            ? `M${U(-t / 2)} ${Z(roof.eaveZ)} H${U(D + t / 2)} V${Z(roof.eaveZ) - 120} H${U(-t / 2)} Z` // cut parallel to ridge
            : `M${U(-t / 2 - roof.overhang)} ${Z(roof.eaveZ)} L${U(D / 2)} ${Z(roof.ridgeZ)} L${U(D + t / 2 + roof.overhang)} ${Z(roof.eaveZ)}`}
          fill={!roof.ridgeAlongX ? INK : "none"} stroke={INK} strokeWidth={LW.heavy} />
      )}
      {/* Cut walls */}
      {cutWalls.map(({ l, w, openings }) => {
        const zTop = l.elevation + l.height - (l.index === model.levels.length - 1 ? 0 : slab);
        const y = U(w.a.y - w.thickness / 2);
        const segs: [number, number][] = [];
        let cur = l.elevation;
        for (const o of openings.sort((a, b) => a.bottom - b.bottom)) {
          segs.push([cur, l.elevation + o.bottom]);
          cur = l.elevation + o.top;
        }
        segs.push([cur, zTop]);
        return (
          <g key={`${l.id}-${w.id}`}>
            {segs.filter(([a, b]) => b > a).map(([a, b], i) => (
              <rect key={i} x={y} y={Z(b)} width={w.thickness} height={b - a} fill={INK} />
            ))}
            {openings.map((o) => (
              <rect key={o.ref.id} x={y} y={Z(l.elevation + o.top)} width={w.thickness} height={o.top - o.bottom} fill="none" stroke={INK} strokeWidth={LW.hair} />
            ))}
          </g>
        );
      })}
      {model.roof.type === "flat" && (
        <g fill={INK}>
          <rect x={U(-t / 2)} y={Z(roof.parapetZ)} width={t} height={roof.parapetZ - roof.eaveZ} />
          <rect x={U(D - t / 2)} y={Z(roof.parapetZ)} width={t} height={roof.parapetZ - roof.eaveZ} />
        </g>
      )}
      {/* Stair (profile) */}
      {stair && (() => {
        const n1 = Math.ceil(stair.risers / 2);
        const path: string[] = [`M${U(stair.y)} ${Z(0)}`];
        for (let i = 0; i < n1; i++) {
          path.push(`V${Z((i + 1) * stair.riserHeight)}`);
          path.push(`H${U(stair.y + (i + 1) * stair.tread)}`);
        }
        return <path d={path.join(" ")} fill="none" stroke={INK} strokeWidth={LW.medium} />;
      })()}
      {/* Levels & heights */}
      {model.levels.map((l) => (
        <g key={`lv-${l.id}`}>
          <LevelMark x={U(D + t / 2) + 300} y={Z(l.elevation)} label={l.name} value={l.elevation ? `+${formatLength(l.elevation, system, { compact: true })}` : "±0.00"} align="right" />
          <DimLine vertical x1={U(-t / 2)} y1={Z(l.elevation)} x2={U(-t / 2)} y2={Z(l.elevation + l.ceilingHeight)} offset={-800} label={formatDimension(l.ceilingHeight, system)} textSize={150} />
          <text x={U(D / 2)} y={Z(l.elevation + l.ceilingHeight / 2)} fontSize={200} textAnchor="middle" fill={INK_SOFT}>{l.name.toUpperCase()}</text>
          <line x1={U(0)} y1={Z(l.elevation + l.ceilingHeight)} x2={U(D)} y2={Z(l.elevation + l.ceilingHeight)} stroke={INK_FAINT} strokeWidth={LW.hair} strokeDasharray="120 80" />
        </g>
      ))}
      <LevelMark x={U(D + t / 2) + 300} y={Z(topZ)} label={model.roof.type === "flat" ? "Top of parapet" : "Ridge"} value={`+${formatLength(topZ, system, { compact: true })}`} align="right" />
      <DimLine vertical x1={U(-t / 2)} y1={Z(0)} x2={U(-t / 2)} y2={Z(topZ)} offset={-1800} label={formatDimension(topZ, system)} />
      <DimLine x1={U(-t / 2)} y1={0} x2={U(D + t / 2)} y2={0} offset={900} label={formatDimension(D + t, system)} />
      <text x={U(-t / 2)} y={Z(topZ) - 900} fontSize={170} fill={INK_SOFT}>Cut at {formatDimension(cutX, system)} from left wall centreline, looking left</text>
    </DrawingSvg>
  );
}

/** Porch, steps, balconies, hoods and AC units projected onto an elevation. */
function AttachedElevation({ model, side, Z, plinth }: { model: BuildingModel; side: ElevationSide; Z: (z: number) => number; plinth: number }) {
  const xg = model.exteriorGeometry;
  if (!xg) return null;
  const proj = elevationProjector(model, side);
  const t = model.params.wallThickness.exterior;
  const W = model.footprint.width, D = model.footprint.depth;
  type R = { x: number; y: number; width: number; depth: number };
  const span = (r: R) => {
    const us = [proj.u(r.x, r.y), proj.u(r.x + r.width, r.y + r.depth)];
    return [Math.min(...us), Math.max(...us)] as const;
  };
  // Visible if in front of the facing wall, or projecting sideways past the facade.
  const visible = (r: R) => {
    const [u0, u1] = span(r);
    const beyond = u1 <= -t / 2 + 1 || u0 >= proj.width + t / 2 - 1;
    const inFront = side === "front" ? r.y + r.depth <= -t / 2 + 1 : side === "rear" ? r.y >= D + t / 2 - 1 : side === "left" ? r.x + r.width <= -t / 2 + 1 : r.x >= W + t / 2 - 1;
    return inFront || beyond;
  };
  const a = xg.attached;
  const box = (key: string, r: R, z0: number, z1: number, fill: string, extra?: React.ReactNode) => {
    const [u0, u1] = span(r);
    return (
      <g key={key}>
        <rect x={u0} y={Z(z1)} width={u1 - u0} height={z1 - z0} fill={fill} stroke={INK} strokeWidth={LW.light} />
        {extra}
      </g>
    );
  };
  return (
    <g>
      {a.steps && visible(a.steps) && box("steps", a.steps, -plinth, 0, "#ece8e0",
        Array.from({ length: a.steps.risers - 1 }, (_, k) => {
          const [u0, u1] = span(a.steps!);
          const z = -plinth + (k + 1) * a.steps!.riserHeight;
          return <line key={k} x1={u0} x2={u1} y1={Z(z)} y2={Z(z)} stroke={INK_SOFT} strokeWidth={LW.hair} />;
        }))}
      {a.porch && visible(a.porch) && (
        <g>
          {box("porch-floor", a.porch, -plinth, 0, "#ece8e0")}
          {a.porch.columns.map((c, i) => box(`col${i}`, { x: c.x - 150, y: c.y - 150, width: 300, depth: 300 }, 0, a.porch!.canopyTop, "#fbfaf7"))}
          {box("canopy", { x: a.porch.x - 100, y: a.porch.y - 100, width: a.porch.width + 200, depth: a.porch.depth + 100 }, a.porch.canopyTop, a.porch.canopyTop + 200, "#fbfaf7")}
        </g>
      )}
      {a.balconies.filter(visible).map((b) => {
        const glass = model.exterior.balustrade === "glass", masonry = model.exterior.balustrade === "masonry";
        const [u0, u1] = span(b);
        const bars = !masonry && !glass
          ? Array.from({ length: Math.floor((u1 - u0) / 120) }, (_, k) => <line key={k} x1={u0 + k * 120} x2={u0 + k * 120} y1={Z(b.elevation)} y2={Z(b.elevation + 1100)} stroke={INK_SOFT} strokeWidth={LW.hair} />)
          : null;
        return (
          <g key={b.id}>
            {box(`${b.id}-slab`, b, b.elevation - 180, b.elevation, "#fbfaf7")}
            {box(`${b.id}-rail`, b, b.elevation, b.elevation + 1100, masonry ? "#fbfaf7" : glass ? "rgba(160,195,210,0.35)" : "none", bars)}
          </g>
        );
      })}
      {a.hoods.filter(visible).map((h) => box(h.id, h, h.z, h.z + 100, "#fbfaf7"))}
      {(a.terraces ?? []).flatMap((tr) => tr.balustrade.filter((e) => {
        // An edge faces the viewer if it's the terrace's edge on this side.
        if (e.a.y === e.b.y) return side === (e.a.y === tr.y ? "front" : "rear");
        return side === (e.a.x === tr.x ? "left" : "right");
      }).map((e, i) => {
        const r = { x: Math.min(e.a.x, e.b.x), y: Math.min(e.a.y, e.b.y), width: Math.abs(e.b.x - e.a.x), depth: Math.abs(e.b.y - e.a.y) };
        const glass = model.exterior.balustrade === "glass", masonry = model.exterior.balustrade === "masonry";
        return box(`${tr.id}-${i}`, r, tr.elevation, tr.elevation + 1100, masonry ? "#fbfaf7" : glass ? "rgba(160,195,210,0.35)" : "none");
      }))}
      {a.acUnits.filter(visible).map((u) => {
        const z0 = u.z === 0 ? -plinth : u.z;
        const [u0, u1] = span(u);
        return box(u.id, u, z0, z0 + u.h, "#f2f2f0",
          <text x={(u0 + u1) / 2} y={Z(z0 + u.h / 2) + 50} fontSize={110} textAnchor="middle" fill={INK_SOFT}>AC</text>);
      })}
    </g>
  );
}
