"use client";

/**
 * Roof system. Surfaces come from the shared roofFaces() (also used by the
 * elevations); this adds build-up: thickness/soffit, fascia boards and gutters
 * along every eave, and parapets with coping for flat roofs.
 */
import { useMemo } from "react";
import * as THREE from "three";
import type { BuildingModel } from "@/domain/model/types";
import { roofBlocks, roofFaces, roofGeometry, type V3 } from "@/domain/model/geometry";
import { Box, m, type Mats } from "../core";
import { plainMaterial } from "../textures";

const THICK = 180;

function polysToGeometry(polys: V3[][], dz: number, uv: boolean) {
  const pos: number[] = [], uvs: number[] = [];
  const P = (p: V3) => [m(p.x), m(p.z + dz), -m(p.y)];
  for (const poly of polys) {
    const a = poly[0], b = poly[1];
    const ex = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const el = Math.hypot(ex.x, ex.y, ex.z) || 1;
    const u = (p: V3) => ((p.x - a.x) * ex.x + (p.y - a.y) * ex.y + (p.z - a.z) * ex.z) / el;
    const v = (p: V3) => { const al = u(p); return Math.hypot(p.x - a.x - (ex.x / el) * al, p.y - a.y - (ex.y / el) * al, p.z - a.z - (ex.z / el) * al); };
    for (let i = 1; i < poly.length - 1; i++) for (const q of [poly[0], poly[i], poly[i + 1]]) {
      pos.push(...P(q));
      if (uv) uvs.push(u(q) / 1000, v(q) / 1000);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/** Horizontal eave edges of a slope (both ends at the slope's lowest height), with outward direction. */
function eaveEdges(poly: V3[]) {
  const zmin = Math.min(...poly.map((p) => p.z));
  const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length, cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
  const out: { a: V3; b: V3; nx: number; ny: number }[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (Math.abs(a.z - zmin) > 1 || Math.abs(b.z - zmin) > 1) continue;
    const horizontal = Math.abs(a.y - b.y) < 1;
    const nx = horizontal ? 0 : Math.sign(a.x - cx), ny = horizontal ? Math.sign(a.y - cy) : 0;
    out.push({ a, b, nx, ny });
  }
  return out;
}

export function RoofMesh({ model, mats, finished }: { model: BuildingModel; mats: Mats; finished: boolean }) {
  const r = roofGeometry(model);
  const t = model.params.wallThickness.exterior;
  const slab = model.params.slabThickness;
  const top = r.eaveZ;
  const topLevel = model.levels.reduce((a, b) => (b.index > a.index ? b : a));

  const blocks = useMemo(() => {
    if (model.roof.type === "flat") return [];
    return roofBlocks(model).map((b) => {
      const f = roofFaces(model, b);
      return {
        id: b.id,
        top: polysToGeometry(f.slopes, 0, true),
        under: polysToGeometry(f.slopes, -THICK, false),
        gables: f.gables.length ? polysToGeometry(f.gables, 0, false) : null,
        eaves: f.slopes.flatMap(eaveEdges),
      };
    });
  }, [model]);

  return (
    <group>
      {topLevel.rooms.map((rm) => (
        <Box key={`ts-${rm.id}`} x0={rm.x - t / 2} y0={rm.y - t / 2} z0={top - slab} x1={rm.x + rm.width + t / 2} y1={rm.y + rm.depth + t / 2} z1={top} material={mats.slab} />
      ))}
      {model.roof.type === "flat" ? (
        <group>
          {topLevel.walls.filter((w) => w.exterior).map((w) => {
            const horizontal = w.a.y === w.b.y;
            const [x0, x1] = horizontal ? [Math.min(w.a.x, w.b.x) - t / 2, Math.max(w.a.x, w.b.x) + t / 2] : [w.a.x - t / 2, w.a.x + t / 2];
            const [y0, y1] = horizontal ? [w.a.y - t / 2, w.a.y + t / 2] : [Math.min(w.a.y, w.b.y) - t / 2, Math.max(w.a.y, w.b.y) + t / 2];
            return (
              <group key={`pp-${w.id}`}>
                <Box x0={x0} y0={y0} x1={x1} y1={y1} z0={top} z1={r.parapetZ} material={mats.ext} />
                {finished && <Box x0={x0 - 50} y0={y0 - 50} x1={x1 + 50} y1={y1 + 50} z0={r.parapetZ} z1={r.parapetZ + 70} material={mats.trim} castShadow={false} />}
              </group>
            );
          })}
          {topLevel.rooms.map((rm) => (
            <Box key={`mb-${rm.id}`} x0={rm.x + t / 2} y0={rm.y + t / 2} x1={rm.x + rm.width - t / 2} y1={rm.y + rm.depth - t / 2} z0={top} z1={top + 40}
              material={finished ? plainMaterial("#7b7e80", { roughness: 0.95 }) : mats.slab} castShadow={false} />
          ))}
        </group>
      ) : (
        blocks.map((b) => (
          <group key={b.id}>
            <mesh geometry={b.top} material={mats.roof} castShadow receiveShadow />
            <mesh geometry={b.under} material={mats.soffit} receiveShadow />
            {b.gables && <mesh geometry={b.gables} material={mats.ext} castShadow receiveShadow />}
            {b.eaves.map((e, i) => {
              const along = Math.abs(e.a.y - e.b.y) < 1;
              const [x0, x1] = along ? [Math.min(e.a.x, e.b.x), Math.max(e.a.x, e.b.x)] : [e.a.x + e.nx * 0, e.a.x + e.nx * 30];
              const [y0, y1] = along ? [e.a.y, e.a.y + e.ny * 30] : [Math.min(e.a.y, e.b.y), Math.max(e.a.y, e.b.y)];
              const z = e.a.z;
              return (
                <group key={i}>
                  {/* Fascia board closing the roof edge */}
                  <Box x0={Math.min(x0, x1)} x1={Math.max(x0, x1)} y0={Math.min(y0, y1)} y1={Math.max(y0, y1)} z0={z - THICK - 60} z1={z + 20} material={mats.fascia} castShadow={false} />
                  {/* Gutter */}
                  {finished && (along
                    ? <Box x0={Math.min(x0, x1)} x1={Math.max(x0, x1)} y0={e.a.y + e.ny * 30} y1={e.a.y + e.ny * 140} z0={z - THICK - 40} z1={z - THICK + 60} material={mats.gutter} castShadow={false} />
                    : <Box x0={e.a.x + e.nx * 30} x1={e.a.x + e.nx * 140} y0={Math.min(e.a.y, e.b.y)} y1={Math.max(e.a.y, e.b.y)} z0={z - THICK - 40} z1={z - THICK + 60} material={mats.gutter} castShadow={false} />)}
                </group>
              );
            })}
          </group>
        ))
      )}
    </group>
  );
}
