/**
 * Indicative fixtures & furniture, derived from room geometry and door position.
 * Used by both the plan (symbols) and the 3D scene (furnished mode). Fixtures
 * are illustrative for scale and layout — not a furniture specification.
 */
import type { Level, Room } from "./types";
import type { Mm } from "@/domain/units";
import { wallLen } from "./geometry";

export type FixtureKind =
  | "bed" | "nightstand" | "sofa" | "coffee_table" | "dining_table" | "chair" | "counter" | "wall_cabinet" | "fridge"
  | "sink" | "hob" | "wc" | "basin" | "shower" | "bathtub" | "desk" | "washer" | "car" | "wardrobe" | "tv_unit" | "rug";

/** Axis-aligned rectangle in model coordinates, plus a nominal height for 3D. */
/** Axis-aligned box in model coordinates; `z` is the base height above the floor (wall-hung items). */
export interface Fixture { id: string; roomId: string; kind: FixtureKind; x: Mm; y: Mm; w: Mm; d: Mm; h: Mm; z: Mm; fixed: boolean }

const H: Record<FixtureKind, Mm> = {
  bed: 500, nightstand: 500, sofa: 800, coffee_table: 400, dining_table: 750, chair: 850, counter: 900, wall_cabinet: 700,
  fridge: 1850, sink: 910, hob: 910, wc: 750, basin: 850, shower: 60, bathtub: 550, desk: 750, washer: 850, car: 1450,
  wardrobe: 2100, tv_unit: 450, rug: 12,
};
const FIXED: FixtureKind[] = ["counter", "wall_cabinet", "sink", "hob", "wc", "basin", "shower", "bathtub"];

export function roomFixtures(level: Level, room: Room, tInt: Mm, tExt: Mm, W: Mm, D: Mm): Fixture[] {
  const tl = room.x === 0 ? tExt : tInt, tr = room.x + room.width >= W ? tExt : tInt;
  const tf = room.y === 0 ? tExt : tInt, tb = room.y + room.depth >= D ? tExt : tInt;
  const x0 = room.x + tl / 2, x1 = room.x + room.width - tr / 2;
  const y0 = room.y + tf / 2, y1 = room.y + room.depth - tb / 2;
  const cw = x1 - x0, cd = y1 - y0;

  // Near wall = the one holding the room's door. Back = opposite.
  const door = level.doors.find((d) => d.swingInto === room.id);
  const wall = door && level.walls.find((w) => w.id === door.wallId);
  let back: "N" | "S" | "E" | "W" = "N"; // N = +y
  let doorAlong = 0; // door position along the near wall, 0..1 from its low end
  if (wall) {
    if (wall.a.y === wall.b.y) back = wall.a.y <= room.y ? "N" : "S";
    else back = wall.a.x <= room.x ? "E" : "W";
    const L = wallLen(wall);
    doorAlong = (door!.offset + door!.width / 2) / L;
  }
  // A bed head can't stand against glazing that reaches the floor (balcony/terrace doors) or a door.
  // If the wall opposite the door has one, turn the bed to a clear side wall.
  if (room.type === "master_bedroom" || room.type === "bedroom" || room.type === "guest_bedroom" || room.type === "staff") {
    const sides: ("N" | "S" | "E" | "W")[] = back === "N" || back === "S" ? [back, "E", "W"] : [back, "N", "S"];
    const clear = sides.find((sd) => !sideHasLowOpening(level, room, sd));
    if (clear) back = clear;
  }
  const alongLen = back === "N" || back === "S" ? cw : cd;
  const depthLen = back === "N" || back === "S" ? cd : cw;

  const out: Fixture[] = [];
  /**
   * Place a rect using local coordinates: `u` along the back wall (0 = low x / low y end),
   * `v` measured from the back wall into the room.
   */
  const put = (kind: FixtureKind, u: Mm, v: Mm, w: Mm, d: Mm, z: Mm = 0) => {
    let x: Mm, y: Mm, rw: Mm, rd: Mm;
    switch (back) {
      case "N": x = x0 + u; y = y1 - v - d; rw = w; rd = d; break;
      case "S": x = x0 + u; y = y0 + v; rw = w; rd = d; break;
      case "E": x = x1 - v - d; y = y0 + u; rw = d; rd = w; break;
      case "W": x = x0 + v; y = y0 + u; rw = d; rd = w; break;
    }
    out.push({ id: `${room.id}-fx${out.length}`, roomId: room.id, kind, x, y, w: rw, d: rd, h: H[kind], z, fixed: FIXED.includes(kind) });
  };
  // Keep furniture away from the door's end of the room.
  const awayFromDoor = doorAlong < 0.5 ? 1 : 0; // 1 → prefer high-u end

  switch (room.type) {
    case "master_bedroom": case "bedroom": case "guest_bedroom": {
      const bw = room.type === "master_bedroom" ? 1800 : room.type === "guest_bedroom" ? 1400 : 1500;
      if (alongLen < bw + 200 || depthLen < 2600) break;
      const u = (alongLen - bw) / 2;
      put("bed", u, 0, bw, 2050);
      if (u > 550) { put("nightstand", u - 500, 0, 450, 400); put("nightstand", u + bw + 50, 0, 450, 400); }
      if (depthLen > 3600 && alongLen > 2200) put("wardrobe", awayFromDoor ? alongLen - 1800 : 0, depthLen - 600, 1800, 600);
      break;
    }
    case "living": case "family": {
      const sw = Math.min(2400, alongLen - 800);
      if (sw < 1400) break;
      put("sofa", (alongLen - sw) / 2, 150, sw, 900);
      if (depthLen > 2800) {
        put("rug", (alongLen - Math.min(sw + 400, alongLen - 600)) / 2, 950, Math.min(sw + 400, alongLen - 600), Math.min(2000, depthLen - 2200));
        put("coffee_table", (alongLen - 1100) / 2, 1450, 1100, 600);
      }
      // Media wall opposite the sofa, kept clear of the door.
      if (depthLen > 3400) {
        const tw = Math.min(1800, alongLen - 1200);
        const doorU = doorAlong * alongLen, doorHalf = (door?.width ?? 900) / 2 + 300;
        let u = (alongLen - tw) / 2;
        if (u < doorU + doorHalf && u + tw > doorU - doorHalf) u = doorU > alongLen / 2 ? Math.max(0, doorU - doorHalf - tw) : Math.min(alongLen - tw, doorU + doorHalf);
        if (tw > 900) put("tv_unit", u, depthLen - 450, tw, 450);
      }
      break;
    }
    case "majlis": {
      // Continuous seating around three walls, open towards the door, with a low table on a rug.
      if (alongLen < 3000 || depthLen < 3000) break;
      put("sofa", 0, 0, alongLen, 850);
      const sideLen = Math.min(depthLen - 850 - 1300, 4200);
      if (sideLen >= 1500) { put("sofa", 0, 950, 850, sideLen); put("sofa", alongLen - 850, 950, 850, sideLen); }
      const rw = alongLen - 2400, rd = Math.min(sideLen, depthLen - 2400);
      if (rw > 900 && rd > 900) {
        put("rug", 1200, 1050, rw, rd);
        put("coffee_table", 1200 + rw * 0.2, 1050 + rd * 0.3, rw * 0.6, Math.min(800, rd * 0.4));
      }
      break;
    }
    case "staff": {
      const bu = awayFromDoor ? alongLen - 950 : 50;
      if (depthLen < 2400 || alongLen < 1900) break;
      put("bed", bu, 0, 900, 2000);
      if (alongLen >= 2000) put("nightstand", awayFromDoor ? bu - 500 : bu + 950, 0, 450, 400);
      if (depthLen >= 3000 && alongLen >= 2200) put("wardrobe", awayFromDoor ? 0 : alongLen - 1000, depthLen - 600, 1000, 600);
      break;
    }
    case "dining": {
      const tw = Math.min(2000, alongLen - 1600), td = 950;
      if (tw < 900 || depthLen < 2200) break;
      const tu = (alongLen - tw) / 2, tv = (depthLen - td) / 2;
      put("dining_table", tu, tv, tw, td);
      const n = Math.max(1, Math.floor(tw / 650));
      for (let i = 0; i < n; i++) {
        const cu = tu + ((i + 0.5) * tw) / n - 225;
        put("chair", cu, tv - 520, 450, 450);
        put("chair", cu, tv + td + 70, 450, 450);
      }
      break;
    }
    case "kitchen": {
      // Base run along the back wall, a fridge at one end, wall cabinets above.
      const fridgeAtEnd = awayFromDoor ? 0 : alongLen - 750;
      const runStart = awayFromDoor ? 750 : 0;
      const run = alongLen - 750;
      put("fridge", fridgeAtEnd, 0, 700, 680);
      put("counter", runStart, 0, run, 600);
      put("wall_cabinet", runStart, 0, run, 350, 1450);
      const leg = Math.min(2600, depthLen - 1300);
      if (leg > 900) put("counter", awayFromDoor ? alongLen - 600 : 0, 600, 600, leg);
      put("sink", runStart + run * 0.3 - 300, 60, 600, 480);
      if (run > 2400) put("hob", runStart + run * 0.7 - 300, 40, 600, 520);
      break;
    }
    case "bathroom": {
      const roomy = room.area >= 7 && alongLen >= 2400 && depthLen >= 1900;
      if (roomy) {
        put("bathtub", awayFromDoor ? alongLen - 1700 : 0, 0, 1700, 750);
        const rest = awayFromDoor ? 0 : 1700;
        put("wc", rest + 150, 0, 400, 650);
        if (alongLen - 1700 > 1250) put("basin", rest + 650, 0, 600, 450);
        break;
      }
      const showerW = Math.min(1000, Math.max(800, alongLen - 1500));
      if (alongLen >= 1700) put("shower", awayFromDoor ? alongLen - showerW : 0, 0, showerW, Math.min(1000, depthLen - 1000));
      const rest = awayFromDoor ? 0 : showerW;
      put("wc", rest + 150, 0, 400, 650);
      if (alongLen - showerW > 1250) put("basin", rest + 700, 0, 550, 420);
      break;
    }
    case "wc": {
      put("wc", Math.max(0, (alongLen - 400) / 2), 0, 400, 650);
      if (depthLen > 1700) put("basin", Math.max(0, (alongLen - 450) / 2), depthLen - 350, 450, 350);
      break;
    }
    case "office": {
      const dw = Math.min(1600, alongLen - 400);
      if (dw > 900) put("desk", (alongLen - dw) / 2, 0, dw, 700);
      break;
    }
    case "laundry": {
      if (alongLen >= 1300) { put("washer", 100, 0, 600, 600); put("washer", 750, 0, 600, 600); }
      break;
    }
    case "garage": {
      const cars = Math.max(1, Math.floor(alongLen / 2900));
      const step = alongLen / cars;
      for (let i = 0; i < cars; i++) put("car", i * step + (step - 1850) / 2, Math.max(300, (depthLen - 4600) / 2), 1850, 4600);
      break;
    }
  }
  // Discard anything that ended up outside the room (tiny rooms).
  return out.filter((f) => f.x >= x0 - 1 && f.y >= y0 - 1 && f.x + f.w <= x1 + 1 && f.y + f.d <= y1 + 1 && f.w > 0 && f.d > 0);
}

/** Does the room edge on this side carry a door or glazing with a sill below bed-head height? */
export function sideHasLowOpening(level: Level, room: Room, side: "N" | "S" | "E" | "W"): boolean {
  const horizontal = side === "N" || side === "S";
  const at = side === "N" ? room.y + room.depth : side === "S" ? room.y : side === "E" ? room.x + room.width : room.x;
  const lo = horizontal ? room.x : room.y, hi = horizontal ? room.x + room.width : room.y + room.depth;
  const walls = level.walls.filter((w) => horizontal
    ? w.a.y === w.b.y && w.a.y === at && Math.max(w.a.x, w.b.x) > lo && Math.min(w.a.x, w.b.x) < hi
    : w.a.x === w.b.x && w.a.x === at && Math.max(w.a.y, w.b.y) > lo && Math.min(w.a.y, w.b.y) < hi);
  const ids = new Set(walls.map((w) => w.id));
  /** Opening lies within this room's stretch of the wall */
  const within = (wallId: string, offset: number, width: number) => {
    const w = walls.find((x) => x.id === wallId)!;
    const s0 = horizontal ? Math.min(w.a.x, w.b.x) : Math.min(w.a.y, w.b.y);
    const forward = horizontal ? w.b.x >= w.a.x : w.b.y >= w.a.y;
    const L = wallLen(w);
    const a = forward ? s0 + offset : s0 + L - offset - width;
    return a < hi && a + width > lo;
  };
  return level.windows.some((wn) => ids.has(wn.wallId) && wn.sill < 700 && within(wn.wallId, wn.offset, wn.width))
    || level.doors.some((d) => ids.has(d.wallId) && within(d.wallId, d.offset, d.width));
}

export function levelFixtures(level: Level, tInt: Mm, tExt: Mm, W: Mm, D: Mm) {
  return level.rooms.flatMap((r) => roomFixtures(level, r, tInt, tExt, W, D));
}
