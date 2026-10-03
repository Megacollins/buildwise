"use client";

/**
 * Elements attached to the building, all from model.exteriorGeometry.attached:
 * entrance steps, porch, balconies, terraces, window surrounds (from hoods) and AC units.
 */
import type { BuildingModel, Point } from "@/domain/model/types";
import { Box, m, type Mats } from "../core";
import { latticeMaterial, plainMaterial } from "../textures";

type Balustrade = "glass" | "metal" | "masonry";

/** Balustrade along straight edges at a floor level. Shared by balconies and terraces. */
export function BalustradeRun({ edges, z, kind, mats, inset = 0 }: { edges: { a: Point; b: Point }[]; z: number; kind: Balustrade; mats: Mats; inset?: number }) {
  return (
    <>
      {edges.map((e, i) => {
        const horizontal = e.a.y === e.b.y;
        const lo = horizontal ? Math.min(e.a.x, e.b.x) : Math.min(e.a.y, e.b.y);
        const hi = horizontal ? Math.max(e.a.x, e.b.x) : Math.max(e.a.y, e.b.y);
        const at = (s0: number, s1: number, n0: number, n1: number, z0: number, z1: number, mat: Mats[keyof Mats], key: string) => horizontal
          ? <Box key={key} x0={s0} x1={s1} y0={e.a.y + n0} y1={e.a.y + n1} z0={z0} z1={z1} material={mat} castShadow={mat !== mats.balGlass} />
          : <Box key={key} x0={e.a.x + n0} x1={e.a.x + n1} y0={s0} y1={s1} z0={z0} z1={z1} material={mat} castShadow={mat !== mats.balGlass} />;
        const len = hi - lo;
        const parts = [];
        if (kind === "masonry") {
          parts.push(at(lo, hi, inset - 75, inset + 75, z, z + 1000, mats.ext, `w${i}`));
          parts.push(at(lo - 20, hi + 20, inset - 95, inset + 95, z + 1000, z + 1060, mats.trim, `c${i}`));
        } else {
          const posts = Math.max(2, Math.ceil(len / 1500) + 1);
          for (let p = 0; p < posts; p++) {
            const s = lo + (p * (len - 50)) / (posts - 1);
            parts.push(at(s, s + 50, inset - 25, inset + 25, z, z + 1100, mats.steel, `p${i}-${p}`));
          }
          parts.push(at(lo, hi, inset - 30, inset + 30, z + 1060, z + 1110, mats.steel, `tr${i}`));
          if (kind === "glass") {
            parts.push(at(lo + 50, hi - 50, inset - 8, inset + 8, z + 90, z + 1040, mats.balGlass, `g${i}`));
          } else {
            parts.push(at(lo, hi, inset - 20, inset + 20, z + 80, z + 120, mats.metal, `br${i}`));
            const n = Math.floor(len / 115);
            for (let b = 1; b < n; b++) {
              const s = lo + b * (len / n);
              parts.push(at(s - 10, s + 10, inset - 10, inset + 10, z + 120, z + 1060, mats.metal, `b${i}-${b}`));
            }
          }
        }
        return <group key={i}>{parts}</group>;
      })}
    </>
  );
}

export function Attached({ model, mats, finished, visibleLevels }: { model: BuildingModel; mats: Mats; finished: boolean; visibleLevels: string[] }) {
  const a = model.exteriorGeometry.attached;
  const plinth = model.exterior.plinth;
  const kind = model.exterior.balustrade as Balustrade;
  const t = model.params.wallThickness.exterior;
  const slab = model.params.slabThickness;
  const windows = new Map(model.levels.flatMap((l) => l.windows.map((w) => [w.id, { w, l }] as const)));
  const cx = model.footprint.width / 2, cy = model.footprint.depth / 2;
  const form = model.exterior.shadingForm ?? "surround";

  return (
    <group>
      {/* Entrance steps: each riser a solid block running back to the porch/door */}
      {a.steps && Array.from({ length: a.steps.risers }, (_, k) => (
        <Box key={`st${k}`} x0={a.steps!.x} x1={a.steps!.x + a.steps!.width} y0={a.steps!.y + k * a.steps!.tread} y1={a.steps!.y + a.steps!.depth}
          z0={-plinth} z1={-plinth + (k + 1) * a.steps!.riserHeight} material={finished ? mats.stone : mats.slab} />
      ))}

      {a.porch && (
        <group>
          <Box x0={a.porch.x} x1={a.porch.x + a.porch.width} y0={a.porch.y} y1={a.porch.y + a.porch.depth} z0={-plinth} z1={0} material={finished ? mats.stone : mats.slab} />
          {a.porch.columns.map((c, i) => (
            <group key={i}>
              <Box x0={c.x - 150} x1={c.x + 150} y0={c.y - 150} y1={c.y + 150} z0={0} z1={a.porch!.canopyTop} material={mats.column} />
              {finished && <Box x0={c.x - 190} x1={c.x + 190} y0={c.y - 190} y1={c.y + 190} z0={0} z1={150} material={mats.stone} />}
            </group>
          ))}
          {/* Canopy slab with a feature fascia on its front edge */}
          <Box x0={a.porch.x - 150} x1={a.porch.x + a.porch.width + 150} y0={a.porch.y - 150} y1={a.porch.y + a.porch.depth} z0={a.porch.canopyTop} z1={a.porch.canopyTop + 220} material={mats.trim} />
          {finished && <Box x0={a.porch.x - 170} x1={a.porch.x + a.porch.width + 170} y0={a.porch.y - 170} y1={a.porch.y - 150} z0={a.porch.canopyTop - 20} z1={a.porch.canopyTop + 240} material={mats.accent} castShadow={false} />}
          {finished && [0.3, 0.7].map((f, i) => (
            <mesh key={i} position={[m(a.porch!.x + a.porch!.width * f), m(a.porch!.canopyTop - 5), -m(a.porch!.y + a.porch!.depth / 2)]} rotation={[Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.07, 16]} />
              <meshStandardMaterial color="#fff6e0" emissive="#ffd9a0" emissiveIntensity={1.2} />
            </mesh>
          ))}
        </group>
      )}

      {a.balconies.filter((b) => visibleLevels.includes(b.levelId)).map((b) => {
        const front = b.side === "front";
        const outerY = front ? b.y : b.y + b.depth;
        const edges: { a: Point; b: Point }[] = [
          { a: { x: b.x, y: outerY }, b: { x: b.x + b.width, y: outerY } },
          { a: { x: b.x, y: b.y }, b: { x: b.x, y: b.y + b.depth } },
          { a: { x: b.x + b.width, y: b.y }, b: { x: b.x + b.width, y: b.y + b.depth } },
        ];
        return (
          <group key={b.id}>
            <Box x0={b.x} x1={b.x + b.width} y0={b.y} y1={b.y + b.depth} z0={b.elevation - 180} z1={b.elevation} material={mats.trim} />
            {finished && <Box x0={b.x + 30} x1={b.x + b.width - 30} y0={b.y + 30} y1={b.y + b.depth - 30} z0={b.elevation} z1={b.elevation + 15} material={mats.stone} castShadow={false} />}
            {finished && <BalustradeRun edges={edges} z={b.elevation} kind={kind} mats={mats} inset={0} />}
          </group>
        );
      })}

      {(a.terraces ?? []).filter((tr) => visibleLevels.includes(tr.levelId)).map((tr) => {
        const openEdge = (pred: (e: { a: Point; b: Point }) => boolean) => tr.balustrade.some(pred);
        const x0 = tr.x - (openEdge((e) => e.a.x === tr.x && e.b.x === tr.x) ? t / 2 : 0), x1 = tr.x + tr.width + (openEdge((e) => e.a.x === tr.x + tr.width && e.b.x === tr.x + tr.width) ? t / 2 : 0);
        const y0 = tr.y - (openEdge((e) => e.a.y === tr.y && e.b.y === tr.y) ? t / 2 : 0), y1 = tr.y + tr.depth + (openEdge((e) => e.a.y === tr.y + tr.depth && e.b.y === tr.y + tr.depth) ? t / 2 : 0);
        return (
          <group key={tr.id}>
            <Box x0={x0} x1={x1} y0={y0} y1={y1} z0={tr.elevation - slab} z1={tr.elevation} material={mats.slab} />
            {finished && <Box x0={x0} x1={x1} y0={y0} y1={y1} z0={tr.elevation} z1={tr.elevation + 20} material={mats.stone} castShadow={false} />}
            {finished && <BalustradeRun edges={tr.balustrade} z={tr.elevation} kind={kind} mats={mats} />}
          </group>
        );
      })}

      {/* Window shading, built per the design's shading form, on the model's hood footprints:
          surround = projecting head + side fins; overhang = head only; screen = perforated panel at the outer edge. */}
      {finished && a.hoods.filter((h) => visibleLevels.includes(h.levelId)).map((h) => {
        const win = windows.get(h.windowId);
        const zBottom = win ? win.l.elevation + win.w.sill - 60 : h.z - 1500;
        const alongX = h.width > h.depth;
        if (form === "overhang") {
          return <Box key={h.id} x0={h.x} x1={h.x + h.width} y0={h.y} y1={h.y + h.depth} z0={h.z} z1={h.z + 100} material={mats.trim} />;
        }
        if (form === "screen") {
          // Outer edge = the hood edge away from the building centre.
          const out = alongX ? (h.y + h.depth / 2 < cy ? -1 : 1) : (h.x + h.width / 2 < cx ? -1 : 1);
          const edge = alongX ? (out < 0 ? h.y : h.y + h.depth) : (out < 0 ? h.x : h.x + h.width);
          const lattice = latticeMaterial("#c9b391");
          return (
            <group key={h.id}>
              <Box x0={h.x} x1={h.x + h.width} y0={h.y} y1={h.y + h.depth} z0={h.z} z1={h.z + 120} material={mats.trim} />
              {alongX
                ? <Box x0={h.x + 60} x1={h.x + h.width - 60} y0={edge - out * 50} y1={edge - out * 20} z0={zBottom} z1={h.z} material={lattice} />
                : <Box x0={edge - out * 50} x1={edge - out * 20} y0={h.y + 60} y1={h.y + h.depth - 60} z0={zBottom} z1={h.z} material={lattice} />}
              {alongX ? (
                <>
                  <Box x0={h.x} x1={h.x + 60} y0={h.y} y1={h.y + h.depth} z0={zBottom} z1={h.z} material={mats.trim} />
                  <Box x0={h.x + h.width - 60} x1={h.x + h.width} y0={h.y} y1={h.y + h.depth} z0={zBottom} z1={h.z} material={mats.trim} />
                </>
              ) : (
                <>
                  <Box x0={h.x} x1={h.x + h.width} y0={h.y} y1={h.y + 60} z0={zBottom} z1={h.z} material={mats.trim} />
                  <Box x0={h.x} x1={h.x + h.width} y0={h.y + h.depth - 60} y1={h.y + h.depth} z0={zBottom} z1={h.z} material={mats.trim} />
                </>
              )}
            </group>
          );
        }
        return (
          <group key={h.id}>
            <Box x0={h.x} x1={h.x + h.width} y0={h.y} y1={h.y + h.depth} z0={h.z} z1={h.z + 120} material={mats.trim} />
            {alongX ? (
              <>
                <Box x0={h.x} x1={h.x + 100} y0={h.y} y1={h.y + h.depth} z0={zBottom} z1={h.z} material={mats.trim} />
                <Box x0={h.x + h.width - 100} x1={h.x + h.width} y0={h.y} y1={h.y + h.depth} z0={zBottom} z1={h.z} material={mats.trim} />
              </>
            ) : (
              <>
                <Box x0={h.x} x1={h.x + h.width} y0={h.y} y1={h.y + 100} z0={zBottom} z1={h.z} material={mats.trim} />
                <Box x0={h.x} x1={h.x + h.width} y0={h.y + h.depth - 100} y1={h.y + h.depth} z0={zBottom} z1={h.z} material={mats.trim} />
              </>
            )}
          </group>
        );
      })}

      {/* AC outdoor units: casing, fan grille on the outer face, brackets or a pad */}
      {finished && a.acUnits.map((u) => {
        const z0 = u.z === 0 ? -plinth + 100 : u.z;
        const alongX = u.width > u.depth;
        const outward = alongX ? (u.y + u.depth / 2 < cy ? -1 : 1) : (u.x + u.width / 2 < cx ? -1 : 1);
        const face = alongX ? (outward < 0 ? u.y : u.y + u.depth) : (outward < 0 ? u.x : u.x + u.width);
        const fanPos: [number, number, number] = alongX
          ? [m(u.x + u.width * 0.42), m(z0 + u.h * 0.5), -m(face + outward * 6)]
          : [m(face + outward * 6), m(z0 + u.h * 0.5), -m(u.y + u.depth * 0.42)];
        return (
          <group key={u.id}>
            <Box x0={u.x} x1={u.x + u.width} y0={u.y} y1={u.y + u.depth} z0={z0} z1={z0 + u.h} material={plainMaterial("#e6e6e3", { roughness: 0.45 })} />
            <mesh position={fanPos} rotation={alongX ? [0, 0, 0] : [0, Math.PI / 2, 0]}>
              <circleGeometry args={[0.2, 24]} />
              <meshStandardMaterial color="#3a3d40" roughness={0.6} side={2} />
            </mesh>
            {u.z === 0
              ? <Box x0={u.x - 80} x1={u.x + u.width + 80} y0={u.y - 80} y1={u.y + u.depth + 80} z0={-plinth} z1={-plinth + 100} material={mats.slab} />
              : [0.15, 0.85].map((f, i) => alongX
                ? <Box key={i} x0={u.x + u.width * f - 20} x1={u.x + u.width * f + 20} y0={u.y} y1={u.y + u.depth} z0={z0 - 60} z1={z0} material={mats.metal} />
                : <Box key={i} x0={u.x} x1={u.x + u.width} y0={u.y + u.depth * f - 20} y1={u.y + u.depth * f + 20} z0={z0 - 60} z1={z0} material={mats.metal} />)}
          </group>
        );
      })}
    </group>
  );
}
