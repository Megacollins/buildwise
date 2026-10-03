"use client";

/**
 * Walls and openings. Every opening comes from the model's door/window data;
 * this file only decides how it is built: reveal depth, frame, mullions, sill, leaf.
 */
import type { ReactNode } from "react";
import type { Door, Level, Wall } from "@/domain/model/types";
import { openingsOn, solidIntervals, wallFrame, wallOutward, type Opening } from "@/domain/model/geometry";
import { Box, outwardVector, type Mats } from "../core";

export function WallMeshes({ level, wall, top, mats, finished, accent, slimFrames }: {
  level: Level; wall: Wall; top: number; mats: Mats; finished: boolean; accent: boolean; slimFrames: boolean;
}) {
  const { L, ux, uy } = wallFrame(wall);
  const t = wall.thickness;
  const openings = openingsOn(level, wall.id);
  const horizontal = uy === 0;
  const material = wall.exterior ? (accent && finished ? mats.accent : mats.ext) : mats.int;
  // Outward sign along the wall normal (model x for vertical walls, y for horizontal walls).
  const out = wall.exterior ? (horizontal ? outwardVector(wallOutward(level, wall)).y : outwardVector(wallOutward(level, wall)).x) : 0;

  /** Box along the wall between distances [s,e], heights [z0,z1], perpendicular band [n0,n1] from the centreline. */
  const piece = (key: string, s: number, e: number, z0: number, z1: number, mat = material, n0 = -t / 2, n1 = t / 2): ReactNode => {
    const a = { x: wall.a.x + ux * s, y: wall.a.y + uy * s }, b = { x: wall.a.x + ux * e, y: wall.a.y + uy * e };
    const lo = Math.min(n0, n1), hi = Math.max(n0, n1);
    return horizontal
      ? <Box key={key} x0={Math.min(a.x, b.x)} x1={Math.max(a.x, b.x)} y0={wall.a.y + lo} y1={wall.a.y + hi} z0={z0} z1={z1} material={mat} />
      : <Box key={key} x0={wall.a.x + lo} x1={wall.a.x + hi} y0={Math.min(a.y, b.y)} y1={Math.max(a.y, b.y)} z0={z0} z1={z1} material={mat} />;
  };

  const parts: ReactNode[] = [];
  solidIntervals(L, openings).forEach(([s, e], i) => parts.push(piece(`s${i}`, s === 0 ? -t / 2 : s, e === L ? L + t / 2 : e, 0, top)));

  openings.forEach((op: Opening, i) => {
    if (op.bottom > 0) parts.push(piece(`b${i}`, op.from, op.to, 0, op.bottom));
    if (op.top < top) parts.push(piece(`t${i}`, op.from, op.to, op.top, top));
    if (!finished) return;
    const k = `o${i}`;
    if (op.kind === "window") parts.push(...windowParts(k, op, wall.exterior ? out : 1, t, mats, slimFrames, piece));
    else parts.push(...doorParts(k, op, out, t, mats, wall, level, piece));
  });
  return <>{parts}</>;
}

type PieceFn = (key: string, s: number, e: number, z0: number, z1: number, mat?: Mats[keyof Mats], n0?: number, n1?: number) => ReactNode;

/** Glazed window or glazed door: set back in a reveal, framed, divided by mullions, with an exterior sill. */
function windowParts(k: string, op: Opening, out: number, t: number, mats: Mats, slim: boolean, piece: PieceFn): ReactNode[] {
  const reveal = Math.min(150, t * 0.55);
  const plane = out * (t / 2 - reveal); // glass plane, measured from the wall centreline
  const fw = slim ? 45 : 70, fd = 70;
  const isDoor = op.bottom === 0;
  const width = op.to - op.from;
  const panes = isDoor ? (width >= 1600 ? 2 : 1) : width > 1400 ? Math.round(width / 1100) : 1;
  let n = 0;
  const P = (s: number, e: number, z0: number, z1: number, mat = mats.frame, d = fd) => piece(`${k}-${n++}`, s, e, z0, z1, mat, plane - d / 2, plane + d / 2);
  const parts: ReactNode[] = [
    P(op.from, op.to, op.bottom + fw, op.top - fw, mats.glass, 20),
    P(op.from, op.from + fw, op.bottom, op.top), P(op.to - fw, op.to, op.bottom, op.top),
    P(op.from, op.to, op.top - fw, op.top), P(op.from, op.to, op.bottom, op.bottom + fw),
  ];
  for (let p = 1; p < panes; p++) {
    const x = op.from + (p * width) / panes;
    parts.push(P(x - fw / 2, x + fw / 2, op.bottom, op.top));
  }
  // Tall fixed windows get a transom at door-head height for scale.
  if (!isDoor && op.top - op.bottom >= 1800) parts.push(P(op.from, op.to, op.top - 600 - fw / 2, op.top - 600 + fw / 2));
  if (!isDoor) {
    // Exterior sill: from the glass plane out past the wall face, with a small drip projection.
    parts.push(piece(`${k}-sill`, op.from - 40, op.to + 40, op.bottom - 45, op.bottom, mats.trim, plane, out * (t / 2 + 50)));
  } else {
    parts.push(piece(`${k}-thr`, op.from, op.to, 0, 25, mats.steel, plane - 60, plane + 60));
  }
  return parts;
}

function doorParts(k: string, op: Opening, out: number, t: number, mats: Mats, wall: Wall, level: Level, piece: PieceFn): ReactNode[] {
  const d = op.ref as Door;
  const reveal = Math.min(120, t * 0.45);
  if (d.kind === "entrance") {
    const plane = out * (t / 2 - reveal);
    const fw = 70;
    const handleAt = op.to - fw - 120;
    return [
      piece(`${k}-fl`, op.from, op.from + fw, 0, op.top, mats.frame, plane - 50, plane + 50),
      piece(`${k}-fr`, op.to - fw, op.to, 0, op.top, mats.frame, plane - 50, plane + 50),
      piece(`${k}-fh`, op.from, op.to, op.top - fw, op.top, mats.frame, plane - 50, plane + 50),
      piece(`${k}-leaf`, op.from + fw, op.to - fw, 20, op.top - fw, mats.door, plane - 28, plane + 28),
      // Long pull handle on the outside face
      piece(`${k}-hdl`, handleAt, handleAt + 35, 850, 1950, mats.steel, plane + out * 60, plane + out * 95),
      piece(`${k}-thr`, op.from, op.to, 0, 25, mats.steel, -t / 2, t / 2),
    ];
  }
  if (d.kind === "garage") {
    const plane = out * (t / 2 - reveal);
    const sections = 5, h = op.top / sections;
    const parts: ReactNode[] = [];
    for (let s = 0; s < sections; s++) parts.push(piece(`${k}-g${s}`, op.from + 20, op.to - 20, s * h + 10, (s + 1) * h - 10, mats.garage, plane - 25, plane + 25));
    return parts;
  }
  // Internal door: leaf standing open at 90°, hinged on the side the plan shows, swinging into its room.
  const room = level.rooms.find((r) => r.id === d.swingInto);
  if (!room) return [];
  const horizontal = wall.a.y === wall.b.y;
  const side = horizontal ? (room.y + room.depth / 2 > wall.a.y ? 1 : -1) : (room.x + room.width / 2 > wall.a.x ? 1 : -1);
  const n0 = side * (t / 2), n1 = side * (t / 2 + (op.to - op.from) - 20);
  return [
    piece(`${k}-leaf`, op.from + 5, op.from + 45, 10, op.top - 15, mats.door, n0, n1),
    piece(`${k}-head`, op.from, op.to, op.top - 40, op.top, mats.trim, -t / 2 - 10, t / 2 + 10),
  ];
}
