/**
 * Derivation of building elements from the parametric layout.
 *
 * `rebuildModel()` is deterministic: the same layout always yields the same
 * rooms, walls, openings and stairs (with stable ids), so drawings, 3D and
 * cost stay in lock-step with the model.
 */
import type {
  BuildingModel, Door, Level, Room, RoomType, Stair, Wall, Window,
} from "./types";
import { BATH_TYPES, HABITABLE } from "./types";
import type { Mm } from "@/domain/units";
import { deriveExterior } from "./exterior";
import { projectionAt } from "./geometry";

const round = (v: number) => Math.round(v);

/** Height of the head of doors and windows above finished floor. */
const HEAD_HEIGHT: Mm = 2100;
const DOOR_WIDTH: Partial<Record<RoomType, Mm>> = {
  bathroom: 800, wc: 750, storage: 800, laundry: 800, living: 1200, dining: 1200, family: 1200,
};
const OPEN_TO_CIRCULATION: RoomType[] = ["stair"];
const MAX_RISER: Mm = 175;
const TREAD: Mm = 275;

export function rebuildModel(model: BuildingModel): BuildingModel {
  const warnings: string[] = [];
  const doorCounter = { n: 0 };
  const windowCounter = { n: 0 };
  // Floors are rebuilt bottom-up so each one can see the roof (terrace) of the floor below.
  const sorted = model.levels.slice().sort((a, b) => a.index - b.index);
  const levels: Level[] = [];
  sorted.forEach((level, i) => {
    levels.push(rebuildLevel(level, model, i < sorted.length - 1, warnings, doorCounter, windowCounter, levels[i - 1] ?? null));
  });
  const withLevels = { ...model, levels };
  const { geometry, warnings: exteriorWarnings } = deriveExterior(withLevels);
  return { ...withLevels, exteriorGeometry: geometry, warnings: [...warnings, ...exteriorWarnings] };
}

function rebuildLevel(
  level: Level,
  model: BuildingModel,
  hasLevelAbove: boolean,
  warnings: string[],
  doorCounter: { n: number },
  windowCounter: { n: number },
  below: Level | null,
): Level {
  const W = model.footprint.width;
  const D = model.footprint.depth;
  const tExt = model.params.wallThickness.exterior;
  const tInt = model.params.wallThickness.interior;

  // Normalise the layout so rows fill the footprint exactly (last row / bay absorbs rounding).
  const rows = level.layout.rows.map((r) => ({ ...r, bays: r.bays.map((b) => ({ ...b })) }));
  const depthSum = rows.reduce((s, r) => s + r.depth, 0);
  if (rows.length) rows[rows.length - 1].depth += D - depthSum;
  for (const r of rows) {
    const wSum = r.bays.reduce((s, b) => s + b.width, 0);
    if (r.bays.length) r.bays[r.bays.length - 1].width += W - wSum;
  }

  const circulationIds = new Set<string>();
  const rooms: Room[] = [];
  let y = 0;
  for (const row of rows) {
    let x = 0;
    for (const bay of row.bays) {
      if (row.kind === "circulation") circulationIds.add(bay.id);
      const tl = x === 0 ? tExt : tInt;
      const tr = x + bay.width >= W ? tExt : tInt;
      const tf = y === 0 ? tExt : tInt;
      const tb = y + row.depth >= D ? tExt : tInt;
      // Front-row rooms in a projecting massing group extend forward of the main facade.
      const proj = y === 0 && row.kind === "rooms" ? projectionAt(model, x, x + bay.width, level.index) : 0;
      const clearWidth = round(bay.width - tl / 2 - tr / 2);
      const clearDepth = round(row.depth + proj - tf / 2 - tb / 2);
      rooms.push({
        id: bay.id, levelId: level.id, type: bay.type, name: bay.name,
        x, y: y - proj, width: bay.width, depth: row.depth + proj, clearWidth, clearDepth,
        area: Math.max(0, (clearWidth * clearDepth) / 1e6),
      });
      x += bay.width;
    }
    y += row.depth;
  }

  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const isCirc = (id: string) => circulationIds.has(id);

  // ---- Walls ---------------------------------------------------------------
  const walls: Wall[] = [];
  const pushWalls = (orientation: "h" | "v") => {
    const lines = new Map<number, { from: number; to: number; roomId: string }[]>();
    for (const r of rooms) {
      const edges = orientation === "h"
        ? [{ at: r.y, from: r.x, to: r.x + r.width }, { at: r.y + r.depth, from: r.x, to: r.x + r.width }]
        : [{ at: r.x, from: r.y, to: r.y + r.depth }, { at: r.x + r.width, from: r.y, to: r.y + r.depth }];
      for (const e of edges) {
        const list = lines.get(e.at) ?? [];
        list.push({ from: e.from, to: e.to, roomId: r.id });
        lines.set(e.at, list);
      }
    }
    const sortedLines = [...lines.keys()].sort((a, b) => a - b);
    for (const at of sortedLines) {
      const edges = lines.get(at)!;
      const breaks = [...new Set(edges.flatMap((e) => [e.from, e.to]))].sort((a, b) => a - b);
      type Piece = { from: number; to: number; rooms: string[] };
      const pieces: Piece[] = [];
      for (let i = 0; i < breaks.length - 1; i++) {
        const from = breaks[i], to = breaks[i + 1];
        const rs = edges.filter((e) => e.from <= from && e.to >= to).map((e) => e.roomId).sort();
        if (!rs.length) continue;
        const last = pieces[pieces.length - 1];
        if (last && last.to === from && last.rooms.join() === rs.join()) last.to = to;
        else pieces.push({ from, to, rooms: rs });
      }
      for (const p of pieces) {
        const exterior = p.rooms.length === 1;
        // Stairs open directly onto circulation — no wall.
        if (!exterior && p.rooms.length === 2) {
          const [r1, r2] = p.rooms.map((id) => roomById.get(id)!);
          const openPair =
            (isCirc(r1.id) && OPEN_TO_CIRCULATION.includes(r2.type)) ||
            (isCirc(r2.id) && OPEN_TO_CIRCULATION.includes(r1.type));
          if (openPair) continue;
        }
        const id = `${level.id}-w${orientation}${at}-${p.from}`;
        walls.push({
          id, levelId: level.id,
          a: orientation === "h" ? { x: p.from, y: at } : { x: at, y: p.from },
          b: orientation === "h" ? { x: p.to, y: at } : { x: at, y: p.to },
          thickness: exterior ? tExt : tInt,
          height: level.height,
          exterior,
          rooms: p.rooms,
        });
      }
    }
  };
  pushWalls("h");
  pushWalls("v");

  const wallLength = (w: Wall) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);

  // ---- Doors ---------------------------------------------------------------
  const doors: Door[] = [];
  const addDoor = (wall: Wall, width: Mm, kind: Door["kind"], swingInto: string | null, atStart = true) => {
    const L = wallLength(wall);
    const margin = 150;
    if (L < width + 2 * margin) {
      const r = swingInto ? roomById.get(swingInto) : undefined;
      warnings.push(`${level.name}: no space for a ${width} mm door into ${r?.name ?? "a room"} (wall is ${round(L)} mm).`);
      return;
    }
    const offset = atStart ? margin : round(L - margin - width);
    doorCounter.n++;
    doors.push({
      id: `${level.id}-d${doors.length + 1}`,
      tag: `D${String(doorCounter.n).padStart(2, "0")}`,
      wallId: wall.id, offset, width,
      height: kind === "garage" ? 2400 : HEAD_HEIGHT,
      kind, swingInto,
      connects: [wall.rooms[0] ?? null, wall.rooms[1] ?? null],
    });
  };

  const ground = level.index === 0;
  if (ground) {
    // Main entrance: front wall of the living room (or first front-row habitable room).
    const frontRooms = rooms.filter((r) => r.y <= 0);
    const entryRoom =
      frontRooms.find((r) => r.type === "living") ?? frontRooms.find((r) => r.type !== "garage");
    const entryWall = entryRoom && walls.find((w) => w.exterior && w.rooms[0] === entryRoom.id && w.a.y === entryRoom.y && w.b.y === entryRoom.y);
    if (entryWall) addDoor(entryWall, 1000, "entrance", entryRoom!.id, entryRoom!.x !== 0);
    const garage = frontRooms.find((r) => r.type === "garage");
    const garageWall = garage && walls.find((w) => w.exterior && w.rooms[0] === garage.id && w.a.y === garage.y && w.b.y === garage.y);
    if (garageWall) {
      const L = wallLength(garageWall);
      const gw = Math.min(round((L - 600) / 100) * 100, 2600 * Math.max(1, Math.round(garage.clearWidth / 3000)));
      addDoor(garageWall, gw, "garage", garage.id);
      if (doors[doors.length - 1]?.wallId === garageWall.id) doors[doors.length - 1].offset = round((L - gw) / 2);
    }
  }

  const neighbourPreference: RoomType[] = ["living", "family", "dining", "kitchen", "bedroom", "master_bedroom"];
  for (const room of rooms) {
    if (isCirc(room.id) || OPEN_TO_CIRCULATION.includes(room.type)) continue;
    const shared = walls.filter((w) => !w.exterior && w.rooms.includes(room.id));
    const toCirc = shared.filter((w) => w.rooms.some((id) => id !== room.id && isCirc(id)));
    let target = toCirc.sort((a, b) => wallLength(b) - wallLength(a))[0];
    if (!target) {
      for (const pref of neighbourPreference) {
        target = shared.find((w) => w.rooms.some((id) => id !== room.id && roomById.get(id)?.type === pref))!;
        if (target) break;
      }
    }
    if (!target) {
      warnings.push(`${level.name}: ${room.name} has no access — add a hallway connection.`);
      continue;
    }
    addDoor(target, DOOR_WIDTH[room.type] ?? 900, "internal", room.id, true);
  }

  // ---- Windows -------------------------------------------------------------
  const windows: Window[] = [];
  const windowRooms: RoomType[] = [...HABITABLE, ...BATH_TYPES, "laundry", "stair", "hall"];
  for (const room of rooms) {
    if (!windowRooms.includes(room.type)) continue;
    const extWalls = walls.filter((w) => w.exterior && w.rooms[0] === room.id);
    for (const wall of extWalls) {
      const L = wallLength(wall);
      const small = BATH_TYPES.includes(room.type) || room.type === "laundry" || room.type === "hall";
      if (L < (small ? 1200 : 1500)) continue;
      // Free intervals on the wall after doors (+300 mm clearance).
      const blocked = doors
        .filter((d) => d.wallId === wall.id)
        .map((d) => [d.offset - 300, d.offset + d.width + 300] as [number, number])
        .sort((a, b) => a[0] - b[0]);
      let cursor = 300;
      let best: [number, number] = [0, 0];
      for (const [s, e] of [...blocked, [L - 300, L - 300] as [number, number]]) {
        if (s - cursor > best[1] - best[0]) best = [cursor, s];
        cursor = Math.max(cursor, e);
      }
      const free = best[1] - best[0];
      const target = small ? 600 : round((L * 0.38 * model.params.glazingFactor) / 100) * 100;
      const width = Math.min(Math.max(target, small ? 600 : 900), free, small ? 900 : 3000);
      if (width < (small ? 600 : 900)) continue;
      const height = small ? 600 : room.type === "stair" ? 1200 : 1500;
      const sill = small ? 1500 : room.type === "stair" ? 1200 : HEAD_HEIGHT + 300 - height;
      // A room looking out over the roof of the floor below gets a door onto that terrace.
      const terraceDepth = below && !small ? terraceDepthOutside(wall, room, below, model.params.wallThickness.exterior) : 0;
      if (terraceDepth >= 1200 && !windows.some((w) => w.wallId === wall.id && w.terrace)) {
        const tw = Math.min(Math.max(width, 1600), free);
        windowCounter.n++;
        windows.push({
          id: `${level.id}-win${windows.length + 1}`,
          tag: `W${String(windowCounter.n).padStart(2, "0")}`,
          wallId: wall.id, offset: round(best[0] + (free - tw) / 2), width: tw, height: HEAD_HEIGHT + 300, sill: 0,
          roomId: room.id, balconyDoor: true, terrace: true,
        });
        continue;
      }
      // A room with a balcony gets a full-height glazed door on its front/rear wall instead of a window.
      const balcony = level.index > 0 && !small && (model.exterior?.balconyRoomIds ?? []).includes(room.id)
        && wall.a.y === wall.b.y && (wall.a.y === room.y || wall.a.y === room.y + room.depth) && !windows.some((w) => w.roomId === room.id && w.balconyDoor);
      if (balcony) {
        const bw = Math.min(Math.max(width, 1600), free);
        windowCounter.n++;
        windows.push({
          id: `${level.id}-win${windows.length + 1}`,
          tag: `W${String(windowCounter.n).padStart(2, "0")}`,
          wallId: wall.id, offset: round(best[0] + (free - bw) / 2), width: bw, height: HEAD_HEIGHT + 300, sill: 0,
          roomId: room.id, balconyDoor: true,
        });
        continue;
      }
      windowCounter.n++;
      windows.push({
        id: `${level.id}-win${windows.length + 1}`,
        tag: `W${String(windowCounter.n).padStart(2, "0")}`,
        wallId: wall.id,
        offset: round(best[0] + (free - width) / 2),
        width, height, sill, roomId: room.id,
      });
    }
  }

  // ---- Stairs --------------------------------------------------------------
  const stairs: Stair[] = [];
  if (hasLevelAbove) {
    for (const room of rooms.filter((r) => r.type === "stair")) {
      const risers = Math.ceil(level.height / MAX_RISER);
      const riserHeight = level.height / risers;
      const flightWidth = Math.min(1200, round((room.clearWidth - 100) / 2));
      const n1 = Math.ceil(risers / 2);
      const run = (n1 - 1) * TREAD;
      const required = run + flightWidth;
      if (flightWidth < 900) warnings.push(`${level.name}: stair flights are only ${flightWidth} mm wide (900 mm is a common minimum).`);
      if (required > room.clearDepth) warnings.push(`${level.name}: stair needs ${required} mm of depth but the stair room has ${room.clearDepth} mm.`);
      const tl = room.x === 0 ? model.params.wallThickness.exterior : model.params.wallThickness.interior;
      const tf = room.y === 0 ? model.params.wallThickness.exterior : model.params.wallThickness.interior;
      stairs.push({
        id: `${level.id}-st1`, roomId: room.id, kind: "u_shaped",
        x: room.x + tl / 2, y: room.y + tf / 2,
        width: room.clearWidth, depth: Math.min(room.clearDepth, required),
        flightWidth, risers, riserHeight: round(riserHeight), tread: TREAD,
        firstFlightDir: 1,
      });
    }
  }

  // Sanity checks that users should know about (plain language, not code compliance).
  for (const r of rooms) {
    if ((r.type === "bedroom" || r.type === "guest_bedroom") && r.area < 7) warnings.push(`${r.name} is ${r.area.toFixed(1)} m² — smaller than a typical bedroom (≈9 m²+).`);
    if (r.type === "master_bedroom" && r.area < 11) warnings.push(`${r.name} is ${r.area.toFixed(1)} m² — compact for a main bedroom.`);
    if (!isCirc(r.id) && Math.min(r.clearWidth, r.clearDepth) < 1500 && r.type !== "wc" && r.type !== "storage") {
      warnings.push(`${r.name} is only ${Math.min(r.clearWidth, r.clearDepth)} mm wide.`);
    }
  }

  return {
    ...level,
    layout: { rows },
    rooms, walls, doors, windows, stairs,
  };
}

/** How far the roof of the floor below extends outside this wall (0 if it doesn't). */
function terraceDepthOutside(wall: Wall, room: Room, below: Level, t: Mm): Mm {
  const horizontal = wall.a.y === wall.b.y;
  const mid = horizontal ? (wall.a.x + wall.b.x) / 2 : (wall.a.y + wall.b.y) / 2;
  // Outward direction: away from the room.
  const dir = horizontal ? (room.y + room.depth / 2 > wall.a.y ? -1 : 1) : (room.x + room.width / 2 > wall.a.x ? -1 : 1);
  let depth = 0;
  for (const r of below.rooms) {
    if (horizontal) {
      if (mid <= r.x || mid >= r.x + r.width) continue;
      const edge = dir < 0 ? r.y : r.y + r.depth;
      const d = dir < 0 ? wall.a.y - edge : edge - wall.a.y;
      if (d > depth && (dir < 0 ? r.y < wall.a.y - t / 2 : r.y + r.depth > wall.a.y + t / 2)) depth = d;
    } else {
      if (mid <= r.y || mid >= r.y + r.depth) continue;
      const edge = dir < 0 ? r.x : r.x + r.width;
      const d = dir < 0 ? wall.a.x - edge : edge - wall.a.x;
      if (d > depth && (dir < 0 ? r.x < wall.a.x - t / 2 : r.x + r.width > wall.a.x + t / 2)) depth = d;
    }
  }
  return depth > t ? depth - t / 2 : 0;
}
