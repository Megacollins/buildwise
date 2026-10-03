"use client";

import type { BuildingModel, Level, Room, Wall, Stair } from "@/domain/model/types";
import { openingsOn, solidIntervals, wallFrame } from "@/domain/model/geometry";
import { levelFixtures, type Fixture } from "@/domain/model/fixtures";
import { formatArea, formatDimension, type MeasurementSystem } from "@/domain/units";
import { DimLine, DrawingSvg, INK, INK_FAINT, INK_SOFT, LW, NorthArrow, ScaleBar, ACCENT } from "./primitives";

export interface FloorPlanProps {
  model: BuildingModel;
  levelId: string;
  system: MeasurementSystem;
  showDimensions?: boolean;
  showTags?: boolean;
  showFixtures?: boolean;
  roomLabel?: (room: Room) => string;
  selectedRoomId?: string | null;
  selectedWallId?: string | null;
  onRoomClick?: (roomId: string) => void;
  onWallClick?: (wallId: string) => void;
  className?: string;
}

const P = (x: number, y: number) => [x, -y] as const;
const pts = (list: (readonly [number, number])[]) => list.map((p) => p.join(",")).join(" ");

export function FloorPlan(props: FloorPlanProps) {
  const { model, levelId, system, showDimensions = true, showTags = true, showFixtures = true } = props;
  const level = model.levels.find((l) => l.id === levelId) ?? model.levels[0];
  const below = model.levels.find((l) => l.index === level.index - 1);
  const W = model.footprint.width, D = model.footprint.depth;
  const tExt = model.params.wallThickness.exterior, tInt = model.params.wallThickness.interior;
  const margin = 3200;
  // Elements projecting from the facade on this level push the dimension lines outwards.
  const xa = model.exteriorGeometry?.attached;
  const onLevel = {
    porch: level.index === 0 ? xa?.porch ?? null : null,
    steps: level.index === 0 ? xa?.steps ?? null : null,
    balconies: (xa?.balconies ?? []).filter((b) => b.levelId === level.id),
    ac: (xa?.acUnits ?? []).filter((u) => u.roomId.startsWith(`${level.id}-`)),
    terraces: (xa?.terraces ?? []).filter((tr) => tr.levelId === level.id),
  };
  const frontProj = Math.max(0, ...level.rooms.map((r) => -r.y), ...(model.exteriorGeometry?.attached.terraces ?? []).filter((tr) => tr.levelId === level.id).map((tr) => -tr.y),
    ...[onLevel.porch, onLevel.steps, ...onLevel.balconies].filter(Boolean).map((r) => -r!.y - tExt / 2));
  const rearProj = Math.max(0, ...onLevel.balconies.map((b) => b.y + b.depth - D - tExt / 2));
  const northAngle = model.site.northAngleDeg;

  const vb: [number, number, number, number] = [-margin, -D - margin - rearProj, W + 2 * margin, D + 2 * margin + frontProj + rearProj];
  const fixtures = showFixtures ? levelFixtures(level, tInt, tExt, W, D) : [];
  const fmt = (mm: number) => formatDimension(mm, system);

  return (
    <DrawingSvg viewBox={vb} title={`${level.name} plan`} className={props.className}>
      {/* Room fills & hit areas */}
      {level.rooms.map((r) => {
        const selected = props.selectedRoomId === r.id;
        return (
          <rect key={r.id} x={r.x} y={-(r.y + r.depth)} width={r.width} height={r.depth}
            fill={selected ? "rgba(31,143,130,0.16)" : r.type === "hall" ? "rgba(0,0,0,0.025)" : "transparent"}
            className={props.onRoomClick ? "cursor-pointer hover:fill-[rgba(31,143,130,0.08)]" : undefined}
            onClick={props.onRoomClick ? () => props.onRoomClick!(r.id) : undefined}>
            <title>{r.name}</title>
          </rect>
        );
      })}

      {/* Fixtures (light line weight, drawn under walls) */}
      <g stroke={INK_SOFT} strokeWidth={LW.hair} fill="none" pointerEvents="none">
        {fixtures.map((f) => <FixtureSymbol key={f.id} f={f} />)}
      </g>

      {/* Stairs: this level's (UP) and the one arriving from below (DN) */}
      {level.stairs.map((s) => <StairSymbol key={s.id} s={s} dir="UP" />)}
      {below?.stairs.map((s) => <StairSymbol key={`dn-${s.id}`} s={s} dir="DN" />)}

      {/* Porch, steps, balconies and AC units on this level */}
      <g fill="none" stroke={INK} strokeWidth={LW.light} pointerEvents="none">
        {onLevel.porch && (
          <g>
            <rect x={onLevel.porch.x} y={-(onLevel.porch.y + onLevel.porch.depth)} width={onLevel.porch.width} height={onLevel.porch.depth} />
            {onLevel.porch.columns.map((c, i) => <rect key={i} x={c.x - 150} y={-(c.y + 150)} width={300} height={300} fill={INK} />)}
            <text x={onLevel.porch.x + onLevel.porch.width / 2} y={-(onLevel.porch.y + onLevel.porch.depth / 2) + 60} fontSize={170} textAnchor="middle" fill={INK_SOFT} stroke="none" letterSpacing={10}>PORCH</text>
          </g>
        )}
        {onLevel.steps && (
          <g>
            <rect x={onLevel.steps.x} y={-(onLevel.steps.y + onLevel.steps.depth)} width={onLevel.steps.width} height={onLevel.steps.depth} />
            {Array.from({ length: Math.max(0, Math.round(onLevel.steps.depth / onLevel.steps.tread) - 1) }, (_, k) => (
              <line key={k} x1={onLevel.steps!.x} x2={onLevel.steps!.x + onLevel.steps!.width} y1={-(onLevel.steps!.y + (k + 1) * onLevel.steps!.tread)} y2={-(onLevel.steps!.y + (k + 1) * onLevel.steps!.tread)} strokeWidth={LW.hair} />
            ))}
            <text x={onLevel.steps.x + onLevel.steps.width / 2} y={-(onLevel.steps.y) + 260} fontSize={130} textAnchor="middle" fill={INK_SOFT} stroke="none">{onLevel.steps.risers} RISERS UP</text>
          </g>
        )}
        {onLevel.balconies.map((b) => (
          <g key={b.id}>
            <rect x={b.x} y={-(b.y + b.depth)} width={b.width} height={b.depth} />
            <rect x={b.x + 40} y={-(b.y + b.depth) + 40} width={b.width - 80} height={b.depth - 80} strokeWidth={LW.hair} />
            <text x={b.x + b.width / 2} y={-(b.y + b.depth / 2) + 60} fontSize={160} textAnchor="middle" fill={INK_SOFT} stroke="none" letterSpacing={10}>BALCONY</text>
          </g>
        ))}
        {onLevel.terraces.map((tr) => (
          <g key={tr.id}>
            <rect x={tr.x} y={-(tr.y + tr.depth)} width={tr.width} height={tr.depth} fill="rgba(160,150,130,0.12)" strokeWidth={LW.hair} />
            {tr.balustrade.map((e, i) => <line key={i} x1={e.a.x} y1={-e.a.y} x2={e.b.x} y2={-e.b.y} strokeWidth={LW.medium} />)}
            <text x={tr.x + tr.width / 2} y={-(tr.y + tr.depth / 2) + 60} fontSize={170} textAnchor="middle" fill={INK_SOFT} stroke="none" letterSpacing={10}>TERRACE</text>
            <text x={tr.x + tr.width / 2} y={-(tr.y + tr.depth / 2) + 260} fontSize={120} textAnchor="middle" fill={INK_FAINT} stroke="none">{((tr.width * tr.depth) / 1e6).toFixed(1)} m²</text>
          </g>
        ))}
        {onLevel.ac.map((u) => (
          <g key={u.id}>
            <rect x={u.x} y={-(u.y + u.depth)} width={u.width} height={u.depth} strokeWidth={LW.hair} />
            <text x={u.x + u.width / 2} y={-(u.y + u.depth / 2) + 45} fontSize={110} textAnchor="middle" fill={INK_SOFT} stroke="none">AC</text>
          </g>
        ))}
      </g>

      {/* Walls (poché) */}
      <g fill={INK}>
        {level.walls.map((w) => <WallShape key={w.id} level={level} wall={w} selected={props.selectedWallId === w.id} />)}
      </g>

      {/* Openings */}
      {level.walls.map((w) => <OpeningSymbols key={`o-${w.id}`} level={level} wall={w} showTags={showTags} />)}

      {/* Wall hit areas for editing */}
      {props.onWallClick && level.walls.map((w) => {
        const [ax, ay] = P(w.a.x, w.a.y), [bx, by] = P(w.b.x, w.b.y);
        return (
          <line key={`hit-${w.id}`} x1={ax} y1={ay} x2={bx} y2={by} stroke="transparent" strokeWidth={Math.max(w.thickness, 350)}
            className="cursor-pointer" onClick={(e) => { e.stopPropagation(); props.onWallClick!(w.id); }}>
            <title>{`${w.exterior ? "Exterior wall" : "Partition"} — click to select`}</title>
          </line>
        );
      })}

      {/* Room labels */}
      <g pointerEvents="none">
        {level.rooms.map((r) => <RoomLabel key={`l-${r.id}`} room={r} system={system} name={props.roomLabel?.(r) ?? r.name} hasStair={r.type === "stair"} />)}
      </g>

      {showDimensions && <PlanDimensions level={level} W={W} D={D} tExt={tExt} fmt={fmt} projFront={frontProj} projRear={rearProj} />}

      <NorthArrow x={W + margin * 0.55} y={-D - margin * 0.45} size={900} angle={-northAngle} />
      <ScaleBar x={0} y={margin * 0.72 + frontProj} metres={5} />
    </DrawingSvg>
  );
}

function WallShape({ level, wall, selected }: { level: Level; wall: Wall; selected: boolean }) {
  const { L, ux, uy, nx, ny } = wallFrame(wall);
  const t = wall.thickness;
  const openings = openingsOn(level, wall.id);
  const segments = solidIntervals(L, openings);
  return (
    <>
      {segments.map(([s, e], i) => {
        const s2 = s === 0 ? -t / 2 : s, e2 = e === L ? L + t / 2 : e;
        const at = (d: number, side: number) => P(wall.a.x + ux * d + nx * side * t / 2, wall.a.y + uy * d + ny * side * t / 2);
        return <polygon key={i} points={pts([at(s2, 1), at(e2, 1), at(e2, -1), at(s2, -1)])} fill={selected ? ACCENT : undefined} />;
      })}
    </>
  );
}

function OpeningSymbols({ level, wall, showTags }: { level: Level; wall: Wall; showTags: boolean }) {
  const { ux, uy, nx, ny } = wallFrame(wall);
  const t = wall.thickness;
  const openings = openingsOn(level, wall.id);
  const at = (d: number, side: number) => P(wall.a.x + ux * d + nx * side, wall.a.y + uy * d + ny * side);
  // Which side of the wall is outside (for exterior walls)?
  const room = level.rooms.find((r) => r.id === wall.rooms[0]);
  const roomSide = (id: string | null | undefined) => {
    const r = level.rooms.find((x) => x.id === id);
    if (!r) return 1;
    const cx = r.x + r.width / 2 - wall.a.x, cy = r.y + r.depth / 2 - wall.a.y;
    return cx * nx + cy * ny >= 0 ? 1 : -1;
  };
  const outside = wall.exterior && room ? -roomSide(room.id) : 1;

  return (
    <g>
      {openings.map((o) => {
        const mid = (o.from + o.to) / 2;
        if (o.kind === "window") {
          const w = o.ref as import("@/domain/model/types").Window;
          const tag = at(mid, outside * (t / 2 + 380));
          return (
            <g key={w.id}>
              <polygon points={pts([at(o.from, t / 2), at(o.to, t / 2), at(o.to, -t / 2), at(o.from, -t / 2)])} fill="var(--paper, #f3f1ec)" stroke={INK} strokeWidth={LW.light} />
              <line x1={at(o.from, 0)[0]} y1={at(o.from, 0)[1]} x2={at(o.to, 0)[0]} y2={at(o.to, 0)[1]} stroke={INK} strokeWidth={LW.light} />
              <line x1={at(o.from, outside * t * 0.18)[0]} y1={at(o.from, outside * t * 0.18)[1]} x2={at(o.to, outside * t * 0.18)[0]} y2={at(o.to, outside * t * 0.18)[1]} stroke={INK} strokeWidth={LW.hair} />
              {showTags && (
                <g>
                  <rect x={tag[0] - 260} y={tag[1] - 110} width={520} height={220} rx={30} fill="#fff" stroke={INK_SOFT} strokeWidth={LW.hair} />
                  <text x={tag[0]} y={tag[1] + 55} fontSize={140} textAnchor="middle" fill={INK} fontFamily="var(--font-jetbrains), monospace">{w.tag}</text>
                </g>
              )}
            </g>
          );
        }
        const d = o.ref as import("@/domain/model/types").Door;
        const side = roomSide(d.swingInto);
        if (d.kind === "garage") {
          return (
            <g key={d.id}>
              <line x1={at(o.from, side * t / 2)[0]} y1={at(o.from, side * t / 2)[1]} x2={at(o.to, side * t / 2)[0]} y2={at(o.to, side * t / 2)[1]} stroke={INK} strokeWidth={LW.light} strokeDasharray="160 80" />
              {showTags && <DoorTag p={at(mid, -side * (t / 2 + 300))} tag={d.tag} />}
            </g>
          );
        }
        const hinge = at(o.from, side * t / 2);
        const leafEnd = at(o.from, side * (t / 2 + d.width));
        const arcEnd = at(o.to, side * t / 2);
        const cross = (leafEnd[0] - hinge[0]) * (arcEnd[1] - hinge[1]) - (leafEnd[1] - hinge[1]) * (arcEnd[0] - hinge[0]);
        return (
          <g key={d.id} fill="none" stroke={INK} strokeWidth={LW.light}>
            <line x1={hinge[0]} y1={hinge[1]} x2={leafEnd[0]} y2={leafEnd[1]} strokeWidth={d.kind === "entrance" ? LW.medium : LW.light} />
            <path d={`M${leafEnd[0]} ${leafEnd[1]} A${d.width} ${d.width} 0 0 ${cross > 0 ? 1 : 0} ${arcEnd[0]} ${arcEnd[1]}`} strokeWidth={LW.hair} strokeDasharray={d.kind === "entrance" ? undefined : "60 40"} />
            {showTags && <DoorTag p={at(mid, -side * (t / 2 + 280))} tag={d.tag} />}
          </g>
        );
      })}
    </g>
  );
}

function DoorTag({ p, tag }: { p: readonly [number, number]; tag: string }) {
  return (
    <g>
      <circle cx={p[0]} cy={p[1]} r={190} fill="#fff" stroke={INK_SOFT} strokeWidth={LW.hair} />
      <text x={p[0]} y={p[1] + 50} fontSize={120} textAnchor="middle" fill={INK} stroke="none" fontFamily="var(--font-jetbrains), monospace">{tag}</text>
    </g>
  );
}

function RoomLabel({ room, system, name, hasStair }: { room: Room; system: MeasurementSystem; name: string; hasStair: boolean }) {
  const cx = room.x + room.width / 2;
  const cy = -(room.y + room.depth / 2);
  const small = Math.min(room.clearWidth, room.clearDepth) < 2300;
  const fs = small ? 170 : 220;
  if (room.type === "hall") {
    return <text x={cx} y={cy + fs / 3} fontSize={fs * 0.9} textAnchor="middle" fill={INK_SOFT} letterSpacing={20}>{name.toUpperCase()}</text>;
  }
  const dy = hasStair ? room.depth * 0.32 : 0;
  return (
    <g>
      <text x={cx} y={cy - fs * 0.35 + dy} fontSize={fs} textAnchor="middle" fill={INK} fontWeight={600} letterSpacing={10}>{name.toUpperCase()}</text>
      <text x={cx} y={cy + fs * 0.85 + dy} fontSize={fs * 0.78} textAnchor="middle" fill={INK_SOFT} fontFamily="var(--font-jetbrains), monospace">
        {formatArea(room.area, system)}
      </text>
      {!small && (
        <text x={cx} y={cy + fs * 1.85 + dy} fontSize={fs * 0.7} textAnchor="middle" fill={INK_FAINT} fontFamily="var(--font-jetbrains), monospace">
          {formatDimension(room.clearWidth, system)} × {formatDimension(room.clearDepth, system)}
        </text>
      )}
    </g>
  );
}

function StairSymbol({ s, dir }: { s: Stair; dir: "UP" | "DN" }) {
  const n1 = Math.ceil(s.risers / 2);
  const n2 = s.risers - n1;
  const run1 = (n1 - 1) * s.tread;
  const fw = s.flightWidth;
  const xL = s.x, xR = s.x + s.width - fw;
  const lines: [number, number, number, number][] = [];
  for (let i = 0; i < n1; i++) lines.push([xL, s.y + i * s.tread, xL + fw, s.y + i * s.tread]);
  for (let i = 0; i < n2; i++) lines.push([xR, s.y + i * s.tread, xR + fw, s.y + i * s.tread]);
  const landingY = s.y + run1;
  const arrow = [P(xL + fw / 2, s.y + 150), P(xL + fw / 2, landingY + fw / 2), P(xR + fw / 2, landingY + fw / 2), P(xR + fw / 2, s.y + 250)];
  return (
    <g stroke={INK_SOFT} strokeWidth={LW.hair} fill="none" pointerEvents="none" opacity={dir === "DN" ? 0.75 : 1}>
      {lines.map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={-y1} x2={x2} y2={-y2} />)}
      <rect x={xL} y={-(landingY + fw)} width={s.width} height={fw} strokeWidth={LW.hair} />
      <line x1={xL + fw} y1={-s.y} x2={xL + fw} y2={-landingY} />
      <line x1={xR} y1={-s.y} x2={xR} y2={-landingY} />
      <polyline points={pts(dir === "UP" ? arrow : [...arrow].reverse())} stroke={INK} strokeWidth={LW.light} markerEnd="url(#arrow)" />
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={INK} />
        </marker>
      </defs>
      <text x={xL + fw / 2} y={-(s.y + 450)} fontSize={150} textAnchor="middle" fill={INK} stroke="none" fontWeight={600}>{dir}</text>
      {dir === "UP" && (
        <text x={s.x + s.width / 2} y={-(s.y - 250)} fontSize={115} textAnchor="middle" fill={INK_FAINT} stroke="none" fontFamily="var(--font-jetbrains), monospace">
          {s.risers}R @ {s.riserHeight} · T {s.tread}
        </text>
      )}
    </g>
  );
}

function FixtureSymbol({ f }: { f: Fixture }) {
  const x = f.x, y = -(f.y + f.d), w = f.w, h = f.d;
  const cx = x + w / 2, cy = y + h / 2;
  switch (f.kind) {
    case "bed":
      return (<g><rect x={x} y={y} width={w} height={h} rx={60} /><rect x={x + 100} y={y + 80} width={w - 200} height={Math.min(450, h * 0.2)} rx={80} /><line x1={x} y1={y + h * 0.35} x2={x + w} y2={y + h * 0.35} /></g>);
    case "wc":
      return (<g><rect x={x} y={y} width={w} height={h * 0.3} rx={30} /><ellipse cx={cx} cy={y + h * 0.62} rx={w * 0.45} ry={h * 0.36} /></g>);
    case "basin":
      return (<g><rect x={x} y={y} width={w} height={h} rx={40} /><ellipse cx={cx} cy={cy} rx={w * 0.33} ry={h * 0.3} /></g>);
    case "shower":
      return (<g><rect x={x} y={y} width={w} height={h} /><line x1={x} y1={y} x2={x + w} y2={y + h} /><line x1={x + w} y1={y} x2={x} y2={y + h} /></g>);
    case "sink":
      return (<g><rect x={x} y={y} width={w} height={h} rx={40} /><circle cx={cx} cy={cy} r={40} /></g>);
    case "hob":
      return (<g>{[[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]].map(([a, b], i) => <circle key={i} cx={x + w * a} cy={y + h * b} r={Math.min(w, h) * 0.16} />)}</g>);
    case "car":
      return <rect x={x} y={y} width={w} height={h} rx={350} strokeDasharray="120 70" />;
    case "sofa":
      return (<g><rect x={x} y={y} width={w} height={h} rx={80} /><line x1={x + 150} y1={y + h * 0.3} x2={x + w - 150} y2={y + h * 0.3} /></g>);
    case "dining_table":
      return <rect x={x} y={y} width={w} height={h} rx={40} />;
    case "chair":
      return <rect x={x} y={y} width={w} height={h} rx={60} />;
    case "wall_cabinet":
      // Above the counter: dashed, per drawing convention for overhead items
      return <rect x={x} y={y} width={w} height={h} strokeDasharray="60 50" />;
    case "fridge":
      return (<g><rect x={x} y={y} width={w} height={h} /><line x1={x} y1={y} x2={x + w} y2={y + h} /></g>);
    case "bathtub":
      return (<g><rect x={x} y={y} width={w} height={h} rx={40} /><rect x={x + 80} y={y + 80} width={w - 160} height={h - 160} rx={Math.min(w, h) * 0.3} /></g>);
    case "rug":
      return <rect x={x} y={y} width={w} height={h} strokeDasharray="30 40" opacity={0.6} />;
    case "wardrobe":
      return (<g><rect x={x} y={y} width={w} height={h} /><line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} strokeDasharray="80 60" /></g>);
    default:
      return <rect x={x} y={y} width={w} height={h} rx={f.kind === "coffee_table" ? 60 : 0} />;
  }
}

function PlanDimensions({ level, W, D, tExt, fmt, projFront = 0, projRear = 0 }: { level: Level; W: number; D: number; tExt: number; fmt: (mm: number) => string; projFront?: number; projRear?: number }) {
  const rows = level.layout.rows;
  const front = rows[0], rear = rows[rows.length - 1];
  const chainX = (row: typeof front) => {
    const xs = [0];
    for (const b of row.bays) xs.push(xs[xs.length - 1] + b.width);
    return xs;
  };
  const ys = [0];
  for (const r of rows) ys.push(ys[ys.length - 1] + r.depth);
  const fx = chainX(front), rx = chainX(rear);
  const o = tExt / 2;
  return (
    <g>
      {/* Front (bottom): chain + overall */}
      {fx.slice(0, -1).map((x, i) => (
        <DimLine key={`f${i}`} x1={x} y1={o} x2={fx[i + 1]} y2={o} offset={900 + projFront} label={fmt(fx[i + 1] - x)} />
      ))}
      <DimLine x1={-o} y1={o} x2={W + o} y2={o} offset={1700 + projFront} label={fmt(W + tExt)} />
      {/* Rear (top) chain */}
      {rx.slice(0, -1).map((x, i) => (
        <DimLine key={`r${i}`} x1={x} y1={-D - o} x2={rx[i + 1]} y2={-D - o} offset={-900 - projRear} label={fmt(rx[i + 1] - x)} />
      ))}
      <DimLine x1={-o} y1={-D - o} x2={W + o} y2={-D - o} offset={-1700 - projRear} label={fmt(W + tExt)} />
      {/* Left: row chain + overall */}
      {ys.slice(0, -1).map((y, i) => (
        <DimLine key={`y${i}`} vertical x1={-o} y1={-y} x2={-o} y2={-ys[i + 1]} offset={-900} label={fmt(ys[i + 1] - y)} />
      ))}
      <DimLine vertical x1={-o} y1={o} x2={-o} y2={-D - o} offset={-1700} label={fmt(D + tExt)} />
    </g>
  );
}

export { INK };
