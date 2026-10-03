/**
 * Shared geometry for renderers. Both the 2D drawings and the 3D scene call
 * these functions, so they cannot disagree about where a window or ridge is.
 */
import type { BuildingModel, Door, Level, Wall, Window } from "./types";
import type { Mm } from "@/domain/units";

export const wallLen = (w: Wall) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
export const isVertical = (w: Wall) => w.a.x === w.b.x;

/** Unit direction along the wall and its left-hand normal. */
export function wallFrame(w: Wall) {
  const L = wallLen(w) || 1;
  const ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L;
  return { L, ux, uy, nx: -uy, ny: ux };
}

export interface Opening { kind: "door" | "window"; from: Mm; to: Mm; bottom: Mm; top: Mm; ref: Door | Window }

export function openingsOn(level: Level, wallId: string): Opening[] {
  const out: Opening[] = [];
  for (const d of level.doors) if (d.wallId === wallId) out.push({ kind: "door", from: d.offset, to: d.offset + d.width, bottom: 0, top: d.height, ref: d });
  for (const w of level.windows) if (w.wallId === wallId) out.push({ kind: "window", from: w.offset, to: w.offset + w.width, bottom: w.sill, top: w.sill + w.height, ref: w });
  return out.sort((a, b) => a.from - b.from);
}

/** Solid intervals along a wall, i.e. the wall length minus openings (plan cut at ~1 m). */
export function solidIntervals(L: Mm, openings: Opening[]): [Mm, Mm][] {
  const out: [Mm, Mm][] = [];
  let cursor = 0;
  for (const o of openings) {
    if (o.from > cursor) out.push([cursor, o.from]);
    cursor = Math.max(cursor, o.to);
  }
  if (cursor < L) out.push([cursor, L]);
  return out;
}

/** Roof form, shared by elevations, sections and 3D. Coordinates are building-local. */
export function roofGeometry(model: BuildingModel) {
  const t = model.params.wallThickness.exterior;
  const o = model.roof.overhang;
  const W = model.footprint.width + t; // outside faces
  const D = model.footprint.depth + t;
  const levels = model.levels;
  const top = levels.reduce((s, l) => Math.max(s, l.elevation + l.height), 0);
  const ridgeAlongX = W >= D;
  const span = (ridgeAlongX ? D : W) + 2 * o;
  const pitch = (model.roof.pitchDeg * Math.PI) / 180;
  const rise = model.roof.type === "flat" ? 0 : (span / 2) * Math.tan(pitch);
  return {
    /** outside-face extents relative to centreline origin */
    x0: -t / 2, y0: -t / 2, W, D, overhang: o,
    eaveZ: top,
    ridgeZ: top + rise,
    rise,
    ridgeAlongX,
    parapetZ: model.roof.type === "flat" ? top + model.roof.parapet : top,
    /** Hip ridge is shorter than the building by the span on each end */
    hipRidgeLength: Math.max(0, (ridgeAlongX ? W : D) + 2 * o - span),
  };
}

export type ElevationSide = "front" | "rear" | "left" | "right";

/**
 * Project exterior walls onto an elevation plane.
 * Returns the horizontal coordinate `u` (left→right as seen by the viewer) for a model point.
 */
export function elevationProjector(model: BuildingModel, side: ElevationSide) {
  const W = model.footprint.width, D = model.footprint.depth;
  const facing = (w: Wall, level: Level) => w.exterior && wallOutward(level, w) === side;
  switch (side) {
    case "front": return { width: W, u: (x: Mm, _y: Mm) => x, facing };
    case "rear": return { width: W, u: (x: Mm, _y: Mm) => W - x, facing };
    case "left": return { width: D, u: (_x: Mm, y: Mm) => D - y, facing };
    case "right": return { width: D, u: (_x: Mm, y: Mm) => y, facing };
  }
}

/** Horizontal extent of the building's outline as seen in an elevation. */
export function elevationRange(model: BuildingModel, side: ElevationSide) {
  const p = elevationProjector(model, side);
  const b = buildingBounds(model).outer;
  const us = [p.u(b.x0, b.y0), p.u(b.x1, b.y1), p.u(b.x0, b.y1), p.u(b.x1, b.y0)];
  return { u0: Math.min(...us), u1: Math.max(...us) };
}

export function buildingHeight(model: BuildingModel) {
  const r = roofGeometry(model);
  return model.roof.type === "flat" ? r.parapetZ : r.ridgeZ;
}

/* ------------------------------------------------------------------ massing */

/** A massing group's projection on a given floor (negative = set back behind the main facade). */
export function groupDepthAt(g: { depth: Mm; upper?: Mm[] }, levelIndex: number): Mm {
  return levelIndex === 0 ? g.depth : (g.upper?.[levelIndex - 1] ?? g.depth);
}

/** Projection depth on a floor for a front-row room whose centreline spans [x0, x1]. */
export function projectionAt(model: Pick<BuildingModel, "massing">, x0: Mm, x1: Mm, levelIndex = 0): Mm {
  const cx = (x0 + x1) / 2;
  const g = model.massing?.groups.find((gg) => cx >= gg.x0 && cx < gg.x1);
  return g ? groupDepthAt(g, levelIndex) : 0;
}

type R = { x: Mm; y: Mm; width: Mm; depth: Mm };

/**
 * Parts of `lower` rooms not covered by `upper` rooms (centreline rectangles).
 * Used for terraces and roofs over set-back floors. Returns merged rectangles.
 */
export function exposedRects(lower: R[], upper: R[]): R[] {
  const out: R[] = [];
  for (const r of lower) {
    const xs = [r.x, r.x + r.width], ys = [r.y, r.y + r.depth];
    for (const u of upper) {
      for (const x of [u.x, u.x + u.width]) if (x > r.x && x < r.x + r.width) xs.push(x);
      for (const y of [u.y, u.y + u.depth]) if (y > r.y && y < r.y + r.depth) ys.push(y);
    }
    xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
      if (xs[i + 1] - xs[i] < 1 || ys[j + 1] - ys[j] < 1) continue;
      if (upper.some((u) => cx > u.x && cx < u.x + u.width && cy > u.y && cy < u.y + u.depth)) continue;
      out.push({ x: xs[i], y: ys[j], width: xs[i + 1] - xs[i], depth: ys[j + 1] - ys[j] });
    }
  }
  // Merge cells that share a full edge (left-right first, then top-bottom).
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < out.length; i++) for (let j = 0; j < out.length; j++) {
      if (i === j) continue;
      const a = out[i], b = out[j];
      if (a.y === b.y && a.depth === b.depth && a.x + a.width === b.x) { out[i] = { ...a, width: a.width + b.width }; out.splice(j, 1); merged = true; break outer; }
      if (a.x === b.x && a.width === b.width && a.y + a.depth === b.y) { out[i] = { ...a, depth: a.depth + b.depth }; out.splice(j, 1); merged = true; break outer; }
    }
  }
  return out;
}

/** Centreline extents of all rooms on all levels (the building outline's bounding box). */
export function buildingBounds(model: BuildingModel) {
  let x0 = 0, y0 = 0, x1 = model.footprint.width, y1 = model.footprint.depth;
  for (const l of model.levels) for (const r of l.rooms) {
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.width); y1 = Math.max(y1, r.y + r.depth);
  }
  const t = model.params.wallThickness.exterior;
  return { x0, y0, x1, y1, outer: { x0: x0 - t / 2, y0: y0 - t / 2, x1: x1 + t / 2, y1: y1 + t / 2 } };
}

/** Which way an exterior wall faces, judged from the room it encloses. */
export function wallOutward(level: Level, wall: Wall): ElevationSide {
  const room = level.rooms.find((r) => r.id === wall.rooms[0]);
  if (wall.a.y === wall.b.y) {
    const roomCy = room ? room.y + room.depth / 2 : 0;
    return roomCy > wall.a.y ? "front" : "rear";
  }
  const roomCx = room ? room.x + room.width / 2 : 0;
  return roomCx > wall.a.x ? "left" : "right";
}

export interface RoofBlock {
  id: string;
  /** Outer-face rectangle of the walls below (mm, building-local) */
  x0: Mm; y0: Mm; x1: Mm; y1: Mm;
  /** Which edges get an overhang (a block that runs into the main roof has none at the back) */
  overhang: { front: Mm; rear: Mm; left: Mm; right: Mm };
  ridgeAlongX: boolean;
  main: boolean;
}

/** The main roof plus one roof block per projecting massing group. */
export function roofBlocks(model: BuildingModel): RoofBlock[] {
  const t = model.params.wallThickness.exterior;
  const W = model.footprint.width, D = model.footprint.depth;
  const o = model.roof.overhang;
  const main: RoofBlock = { id: "main", x0: -t / 2, y0: -t / 2, x1: W + t / 2, y1: D + t / 2, overhang: { front: o, rear: o, left: o, right: o }, ridgeAlongX: W + t >= D + t, main: true };
  const blocks = [main];
  for (const [i, g] of (model.massing?.groups ?? []).entries()) {
    if (g.depth <= 0) continue;
    // Run the projection's roof back into the main roof so the two intersect cleanly.
    blocks.push({
      id: `proj-${i}`, x0: g.x0 - t / 2, y0: -g.depth - t / 2, x1: g.x1 + t / 2, y1: Math.min(D / 2, g.depth + D / 4),
      overhang: { front: o, rear: 0, left: g.x0 <= 0 ? o : Math.min(o, 300), right: g.x1 >= W ? o : Math.min(o, 300) },
      ridgeAlongX: false, main: false,
    });
  }
  return blocks;
}

export type V3 = { x: Mm; y: Mm; z: Mm };

/**
 * Roof surfaces of a block as polygons (model coordinates). Shared by the 3D
 * scene and the elevations, so both show the same roof.
 */
export function roofFaces(model: BuildingModel, b: RoofBlock): { slopes: V3[][]; gables: V3[][] } {
  const top = model.levels.reduce((s, l) => Math.max(s, l.elevation + l.height), 0);
  if (model.roof.type === "flat") return { slopes: [], gables: [] };
  const pitch = (model.roof.pitchDeg * Math.PI) / 180;
  const X0 = b.x0 - b.overhang.left, X1 = b.x1 + b.overhang.right, Y0 = b.y0 - b.overhang.front, Y1 = b.y1 + b.overhang.rear;
  const span = b.ridgeAlongX ? (b.y1 - b.y0) : (b.x1 - b.x0);
  const rise = (span / 2) * Math.tan(pitch);
  const zr = top + rise;
  const eaveDrop = (ov: Mm) => top - ov * Math.tan(pitch);
  const v = (x: Mm, y: Mm, z: Mm): V3 => ({ x, y, z });
  const slopes: V3[][] = [], gables: V3[][] = [];
  const hip = model.roof.type === "hip";
  if (b.ridgeAlongX) {
    const ym = (b.y0 + b.y1) / 2;
    const inset = hip ? (b.y1 - b.y0) / 2 : 0;
    const ra = v(X0 + (hip ? inset + b.overhang.left : 0), ym, zr), rb = v(X1 - (hip ? inset + b.overhang.right : 0), ym, zr);
    const zf = eaveDrop(b.overhang.front), zb = eaveDrop(b.overhang.rear);
    slopes.push([v(X0, Y0, zf), v(X1, Y0, zf), rb, ra], [v(X1, Y1, zb), v(X0, Y1, zb), ra, rb]);
    if (hip) slopes.push([v(X0, Y1, zb), v(X0, Y0, zf), ra], [v(X1, Y0, zf), v(X1, Y1, zb), rb]);
    else for (const x of [b.x0, b.x1]) gables.push([v(x, b.y0, top), v(x, b.y1, top), v(x, ym, zr)]);
  } else {
    const xm = (b.x0 + b.x1) / 2;
    const inset = hip ? (b.x1 - b.x0) / 2 : 0;
    // A projecting block's back end runs into the main roof: no hip/gable there.
    const backHip = hip && b.main;
    const ra = v(xm, Y0 + (hip ? inset + b.overhang.front : 0), zr), rb = v(xm, Y1 - (backHip ? inset + b.overhang.rear : 0), zr);
    const zl = eaveDrop(b.overhang.left), zrr = eaveDrop(b.overhang.right);
    slopes.push([v(X0, Y1, zl), v(X0, Y0, zl), ra, rb], [v(X1, Y0, zrr), v(X1, Y1, zrr), rb, ra]);
    if (hip) slopes.push([v(X0, Y0, zl), v(X1, Y0, zrr), ra]);
    else gables.push([v(b.x0, b.y0, top), v(b.x1, b.y0, top), v(xm, b.y0, zr)]);
    if (backHip) slopes.push([v(X1, Y1, zrr), v(X0, Y1, zl), rb]);
    else if (!hip && b.main) gables.push([v(b.x0, b.y1, top), v(b.x1, b.y1, top), v(xm, b.y1, zr)]);
  }
  return { slopes, gables };
}
