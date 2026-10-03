/**
 * Model operations.
 *
 * Every change to a design is expressed as a serialisable `ModelOp` and applied
 * with `applyOp`. The design editor, the budget optimiser and the assistant all
 * speak this one vocabulary, and the server re-applies ops itself — the client
 * never sends a finished model or a cost figure.
 */
import { z } from "zod";
import type { BuildingModel, Level, MaterialCategory, RoomType } from "./types";
import { MATERIAL_CATEGORIES } from "./types";
import { rebuildModel } from "./build";
import { validateModel } from "./validate";

const MIN_ROOM_DIM = 1200;
const MIN_STAIR_WIDTH = 2400;

export const ModelOpSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("selection"), category: z.enum(MATERIAL_CATEGORIES as [MaterialCategory, ...MaterialCategory[]]), materialId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal("selections"), selections: z.record(z.string(), z.string().max(64)) }),
  z.object({ kind: z.literal("moveWall"), levelId: z.string().max(16), wallId: z.string().max(64), delta: z.number().int().min(-3000).max(3000) }),
  z.object({ kind: z.literal("scale"), factor: z.number().min(0.7).max(1.3) }),
  z.object({ kind: z.literal("roof"), type: z.enum(["flat", "gable", "hip"]) }),
  z.object({ kind: z.literal("glazing"), factor: z.number().min(0.5).max(1.8) }),
  z.object({ kind: z.literal("removeRoom"), roomId: z.string().max(64) }),
  z.object({ kind: z.literal("renameRoom"), roomId: z.string().max(64), name: z.string().min(1).max(40) }),
  z.object({ kind: z.literal("resizeRoom"), roomId: z.string().max(64), axis: z.enum(["width", "depth"]), delta: z.number().int().min(-3000).max(3000) }),
  z.object({ kind: z.literal("projection"), group: z.number().int().min(0).max(8), depth: z.number().int().min(0).max(4000) }),
  z.object({ kind: z.literal("pool"), size: z.enum(["none", "small", "medium", "large"]) }),
  z.object({ kind: z.literal("levelDepth"), group: z.number().int().min(0).max(8), level: z.number().int().min(0).max(4), depth: z.number().int().min(-4000).max(4000) }),
]);
export type ModelOp = z.infer<typeof ModelOpSchema>;

export class ModelOpError extends Error {}

const clone = <T,>(v: T): T => structuredClone(v);

/**
 * Apply an op and check the result. An op that introduces a model inconsistency
 * (e.g. a stair room too short for its stair) is refused with the reason.
 */
export function applyOp(model: BuildingModel, op: ModelOp): BuildingModel {
  const next = applyOpUnchecked(model, op);
  if (op.kind === "selection" || op.kind === "selections" || op.kind === "renameRoom") return next;
  const before = new Set(validateModel(model).issues.filter((i) => i.severity === "error").map((i) => i.message));
  const introduced = validateModel(next).issues.find((i) => i.severity === "error" && !before.has(i.message));
  if (introduced) throw new ModelOpError(`That change isn't possible: ${introduced.message}`);
  return next;
}

function applyOpUnchecked(model: BuildingModel, op: ModelOp): BuildingModel {
  const m = clone(model);
  switch (op.kind) {
    case "selection":
      m.selections[op.category] = op.materialId;
      return m; // geometry unchanged
    case "selections":
      for (const [k, v] of Object.entries(op.selections)) {
        if ((MATERIAL_CATEGORIES as string[]).includes(k)) m.selections[k as MaterialCategory] = v;
      }
      return m;
    case "roof":
      m.roof.type = op.type;
      m.roof.pitchDeg = op.type === "flat" ? 0 : m.roof.pitchDeg || 25;
      m.roof.parapet = op.type === "flat" ? 900 : 0;
      // Re-derive the exterior: a roof tank needs a flat roof, terraces and lights follow the roof.
      return rebuildModel(m);
    case "glazing":
      m.params.glazingFactor = op.factor;
      return rebuildModel(m);
    case "renameRoom": {
      for (const l of m.levels) for (const r of l.layout.rows) for (const b of r.bays) if (b.id === op.roomId) b.name = op.name;
      return rebuildModel(m);
    }
    case "scale":
      return rebuildModel(scale(m, op.factor));
    case "removeRoom":
      return rebuildModel(removeRoom(m, op.roomId));
    case "moveWall":
      return rebuildModel(moveWall(m, op.levelId, op.wallId, op.delta));
    case "resizeRoom":
      return rebuildModel(resizeRoom(m, op.roomId, op.axis, op.delta));
    case "projection":
      return rebuildModel(setProjection(m, op.group, op.depth));
    case "pool": {
      const sizes = { small: { length: 6000, width: 3000 }, medium: { length: 8000, width: 4000 }, large: { length: 10000, width: 4500 } } as const;
      m.exterior = { ...m.exterior, pool: op.size === "none" ? null : sizes[op.size] };
      const next = rebuildModel(m);
      if (op.size !== "none" && !next.exteriorGeometry.site.pool) throw new ModelOpError(next.warnings.find((w) => /pool/.test(w)) ?? "There isn't room for a pool on this plot.");
      return next;
    }
    case "levelDepth": {
      const g = m.massing?.groups[op.group];
      if (!g) throw new ModelOpError("This design has no front volume there.");
      const floors = m.levels.length - 1;
      if (op.level > floors || floors === 0) throw new ModelOpError("There is no such upper floor.");
      // level 0 = every upper floor
      g.upper = Array.from({ length: floors }, (_, i) => (op.level === 0 || i === op.level - 1 ? op.depth : g.upper?.[i] ?? g.depth));
      assertSane(m);
      return rebuildModel(m);
    }
  }
}

function scale(m: BuildingModel, f: number): BuildingModel {
  const s = Math.sqrt(f); // factor applies to area; scale each axis by √f
  const W = Math.round((m.footprint.width * s) / 100) * 100;
  const groups = m.massing?.groups ?? [];
  const k0 = W / m.footprint.width;
  const newEdges = groups.map((g) => ({ x0: Math.round((g.x0 * k0) / 100) * 100, x1: g.x1 >= m.footprint.width ? W : Math.round((g.x1 * k0) / 100) * 100 }));
  for (const l of m.levels) {
    // Front row with massing: scale each group's rooms to fill the group's new width exactly.
    if (groups.length) {
      const front = l.layout.rows[0];
      let x = 0;
      const owner = front.bays.map((b) => { const c = x + b.width / 2; x += b.width; return groups.findIndex((g) => c >= g.x0 && c < g.x1); });
      groups.forEach((_, gi) => {
        const bays = front.bays.filter((_, i) => owner[i] === gi);
        const target = newEdges[gi].x1 - newEdges[gi].x0;
        const sum = bays.reduce((a, b) => a + b.width, 0);
        bays.forEach((b) => { b.width = Math.round((b.width * target) / sum / 100) * 100; });
        if (bays.length) bays[bays.length - 1].width += target - bays.reduce((a, b) => a + b.width, 0);
      });
      front.depth = Math.round((front.depth * s) / 100) * 100;
    }
    for (const row of l.layout.rows) {
      if (groups.length && row === l.layout.rows[0]) continue;
      if (row.kind !== "circulation") row.depth = Math.round((row.depth * s) / 100) * 100;
      const fixed = row.bays.filter((b) => b.type === "stair").reduce((a, b) => a + b.width, 0);
      const flexible = row.bays.filter((b) => b.type !== "stair").reduce((a, b) => a + b.width, 0);
      const k = flexible > 0 ? (W - fixed) / flexible : 1;
      for (const b of row.bays) if (b.type !== "stair" && row.kind !== "circulation") b.width = Math.round((b.width * k) / 100) * 100;
      if (row.kind === "circulation") row.bays[0].width = W;
    }
  }
  const D = m.levels[0].layout.rows.reduce((a, r) => a + r.depth, 0);
  if (m.massing) m.massing.groups = groups.map((g, i) => ({ ...g, ...newEdges[i], depth: Math.round((g.depth * s) / 100) * 100, ...(g.upper ? { upper: g.upper.map((u) => Math.round((u * s) / 100) * 100) } : {}) }));
  const dx = Math.round((m.footprint.width - W) / 2);
  m.site.footprintOrigin.x += dx;
  m.footprint = { width: W, depth: D };
  if (m.site.driveway && m.site.parking.covered) m.site.driveway.x += dx;
  assertSane(m);
  return m;
}

function findBay(m: BuildingModel, roomId: string) {
  for (const l of m.levels) for (const r of l.layout.rows) {
    const i = r.bays.findIndex((b) => b.id === roomId);
    if (i >= 0) return { level: l, row: r, index: i };
  }
  throw new ModelOpError("Room not found");
}

function removeRoom(m: BuildingModel, roomId: string): BuildingModel {
  const { row, index } = findBay(m, roomId);
  const bay = row.bays[index];
  const removable: RoomType[] = ["office", "storage", "family", "laundry", "dining", "guest_bedroom", "bedroom", "bathroom", "wc"];
  if (!removable.includes(bay.type)) throw new ModelOpError(`${bay.name} can't be removed.`);
  if (row.bays.length < 2) throw new ModelOpError("A row needs at least one room.");
  row.bays.splice(index, 1);
  // Neighbour absorbs the space (prefer a non-stair neighbour).
  const n = row.bays[index - 1]?.type !== "stair" && row.bays[index - 1] ? index - 1 : Math.min(index, row.bays.length - 1);
  row.bays[n].width += bay.width;
  return m;
}

/** Walls are derived, so moving one means changing the layout dimensions that produced it. */
function moveWall(m: BuildingModel, levelId: string, wallId: string, delta: number): BuildingModel {
  const level = m.levels.find((l) => l.id === levelId);
  const wall = level?.walls.find((w) => w.id === wallId);
  if (!level || !wall) throw new ModelOpError("Wall not found");
  const vertical = wall.a.x === wall.b.x;
  const W = m.footprint.width, D = m.footprint.depth;

  const groups = m.massing?.groups ?? [];
  const frontRowDepth = level.layout.rows[0].depth;
  if (vertical && groups.some((g) => g.x1 === wall.a.x && g.x1 < W) && Math.min(wall.a.y, wall.b.y) < frontRowDepth) {
    // The edge of a projecting volume: move it on every floor so the volume stays full height.
    const x = wall.a.x;
    for (const l of m.levels) {
      const front = l.layout.rows[0];
      let cx = 0, done = false;
      for (let i = 0; i < front.bays.length - 1; i++) {
        cx += front.bays[i].width;
        if (cx === x) { front.bays[i].width += delta; front.bays[i + 1].width -= delta; done = true; break; }
      }
      if (!done) throw new ModelOpError(`On ${l.name} there's no wall at the edge of this volume to move.`);
    }
    for (const g of groups) { if (g.x1 === x) g.x1 += delta; if (g.x0 === x) g.x0 += delta; }
    assertSane(m);
    return m;
  }
  if (!vertical && wall.a.y < 0) {
    // Front wall of a projecting volume: changes how far it projects.
    const g = groups.find((gg) => gg.depth === -wall.a.y && Math.min(wall.a.x, wall.b.x) >= gg.x0 && Math.max(wall.a.x, wall.b.x) <= gg.x1);
    if (!g) throw new ModelOpError("That wall isn't the front of a projecting volume.");
    const depth = g.depth - delta;
    if (depth < 0) throw new ModelOpError("The volume can't go behind the main facade — set its projection to 0 to flatten it.");
    g.depth = depth;
    assertSane(m);
    return m;
  }

  if (vertical) {
    const x = wall.a.x;
    if (x === 0 || x === W) {
      // Exterior side wall: grows/shrinks the footprint on every level.
      const grow = x === W ? delta : -delta;
      for (const l of m.levels) for (const row of l.layout.rows) {
        const bay = x === W ? row.bays[row.bays.length - 1] : row.bays[0];
        if (bay.type === "stair" && row.bays.length > 1) {
          const other = x === W ? row.bays[row.bays.length - 2] : row.bays[1];
          other.width += grow;
        } else bay.width += grow;
      }
      m.footprint.width += grow;
      if (x === 0) m.site.footprintOrigin.x += delta;
    } else {
      // Interior partition: adjust the two bays either side, in the row containing the wall.
      let y = 0;
      for (const row of level.layout.rows) {
        if (wall.a.y >= y && wall.b.y <= y + row.depth) {
          let bx = 0;
          for (let i = 0; i < row.bays.length - 1; i++) {
            bx += row.bays[i].width;
            if (bx === x) {
              if (row.bays[i].type === "stair" || row.bays[i + 1].type === "stair") {
                throw new ModelOpError("The stair width is fixed — move the wall on the other side of the stair room.");
              }
              row.bays[i].width += delta; row.bays[i + 1].width -= delta;
            }
          }
        }
        y += row.depth;
      }
    }
  } else {
    const y = wall.a.y;
    // Row boundaries are shared across levels so walls keep stacking.
    const boundaryIndex = (l: Level) => {
      let acc = 0;
      for (let i = 0; i < l.layout.rows.length; i++) { acc += l.layout.rows[i].depth; if (acc === y) return i; }
      return -1;
    };
    if (y === 0 || y === D) {
      for (const l of m.levels) {
        const row = y === 0 ? l.layout.rows[0] : l.layout.rows[l.layout.rows.length - 1];
        row.depth += y === D ? delta : -delta;
      }
      m.footprint.depth += y === D ? delta : -delta;
      if (y === 0) m.site.footprintOrigin.y += delta;
    } else {
      for (const l of m.levels) {
        const i = boundaryIndex(l);
        if (i < 0) continue;
        const [a, b] = [l.layout.rows[i], l.layout.rows[i + 1]];
        // Moving a wall of the hall shifts the hall itself; the room beyond it absorbs the change.
        if (a.kind === "circulation") { b.depth -= delta; if (l.layout.rows[i - 1]) l.layout.rows[i - 1].depth += delta; }
        else if (b.kind === "circulation") { a.depth += delta; if (l.layout.rows[i + 2]) l.layout.rows[i + 2].depth -= delta; }
        else { a.depth += delta; b.depth -= delta; }
      }
    }
  }
  assertSane(m);
  return m;
}

function resizeRoom(m: BuildingModel, roomId: string, axis: "width" | "depth", delta: number): BuildingModel {
  const { level, row, index } = findBay(m, roomId);
  const rebuilt = rebuildModel(m).levels.find((l) => l.id === level.id)!;
  const room = rebuilt.rooms.find((r) => r.id === roomId)!;
  if (axis === "width") {
    // Grow to the right if possible, otherwise to the left.
    const rightX = room.x + room.width;
    const wallX = index < row.bays.length - 1 ? rightX : room.x;
    const wall = rebuilt.walls.find((w) => w.a.x === wallX && w.b.x === wallX && w.a.y >= room.y && w.b.y <= room.y + room.depth);
    if (!wall) throw new ModelOpError("No wall to move");
    return moveWall(m, level.id, wall.id, wallX === rightX ? delta : -delta);
  }
  const bottom = room.y + room.depth;
  const wallY = bottom === m.footprint.depth ? bottom : bottom;
  const wall = rebuilt.walls.find((w) => w.a.y === wallY && w.b.y === wallY && w.a.x < room.x + room.width && w.b.x > room.x)
    ?? rebuilt.walls.find((w) => w.a.y === room.y && w.b.y === room.y && w.a.x < room.x + room.width && w.b.x > room.x);
  if (!wall) throw new ModelOpError("No wall to move");
  return moveWall(m, level.id, wall.id, wall.a.y === room.y ? -delta : delta);
}

function assertSane(m: BuildingModel) {
  for (const l of m.levels) for (const row of l.layout.rows) {
    if (row.kind !== "circulation" && row.depth < MIN_ROOM_DIM + 300) throw new ModelOpError("That would make a room too small.");
    for (const b of row.bays) {
      if (b.width < MIN_ROOM_DIM) throw new ModelOpError(`That would make ${b.name} narrower than ${MIN_ROOM_DIM} mm.`);
      if (b.type === "stair" && b.width < MIN_STAIR_WIDTH) throw new ModelOpError("The stair would be too narrow.");
    }
  }
  if (m.footprint.width < 5000 || m.footprint.depth < 5000) throw new ModelOpError("The building would be too small.");
  const tExt = m.params.wallThickness.exterior;
  const o = m.site.footprintOrigin;
  const proj = Math.max(0, ...(m.massing?.groups ?? []).map((g) => g.depth));
  if (o.x - tExt / 2 < 0 || o.y - proj - tExt / 2 < 0 || o.x + m.footprint.width + tExt / 2 > m.site.plot.width || o.y + m.footprint.depth + tExt / 2 > m.site.plot.depth) {
    throw new ModelOpError("That change would push the building beyond the plot boundary.");
  }
}

/** Plain-language description of an op, used for version labels. */
export function describeOp(op: ModelOp, model: BuildingModel, materialName?: (id: string) => string | undefined): string {
  const roomName = (id: string) => model.levels.flatMap((l) => l.rooms).find((r) => r.id === id)?.name ?? "room";
  switch (op.kind) {
    case "selection": return `${op.category.replace(/_/g, " ")} → ${materialName?.(op.materialId) ?? op.materialId}`;
    case "selections": return "Finishes package changed";
    case "moveWall": return `Wall moved ${op.delta > 0 ? "+" : ""}${op.delta} mm`;
    case "scale": return `Floor area ${op.factor < 1 ? "reduced" : "increased"} ${Math.round(Math.abs(1 - op.factor) * 100)}%`;
    case "roof": return `Roof changed to ${op.type}`;
    case "glazing": return `Window sizes ×${op.factor.toFixed(2)}`;
    case "removeRoom": return `Removed ${roomName(op.roomId)}`;
    case "renameRoom": return `Renamed ${roomName(op.roomId)} to ${op.name}`;
    case "resizeRoom": return `${roomName(op.roomId)} ${op.delta > 0 ? "enlarged" : "reduced"} (${op.axis})`;
    case "pool": return op.size === "none" ? "Pool removed" : `${op.size[0].toUpperCase()}${op.size.slice(1)} swimming pool added`;
    case "levelDepth": {
      const label = model.massing?.groups[op.group]?.label ?? "Front";
      const floor = op.level === 0 ? "Upper floors" : model.levels.find((l) => l.index === op.level)?.name ?? "Upper floor";
      return op.depth < 0 ? `${floor} set back ${(-op.depth / 1000).toFixed(1)} m (${label.toLowerCase()})` : `${floor} ${label.toLowerCase()} at ${(op.depth / 1000).toFixed(1)} m`;
    }
    case "projection": return op.depth === 0 ? `${model.massing?.groups[op.group]?.label ?? "Projection"} flattened` : `${model.massing?.groups[op.group]?.label ?? "Projection"} set to ${(op.depth / 1000).toFixed(1)} m`;
  }
}

function setProjection(m: BuildingModel, group: number, depth: number): BuildingModel {
  const g = m.massing?.groups[group];
  if (!g) throw new ModelOpError("This design has no projecting volume there.");
  if (group === 0 && m.massing!.groups.length > 1 && depth > 0 && m.massing!.groups[0].label === "Main volume") {
    throw new ModelOpError("The main volume is the reference line — change the projecting volume instead.");
  }
  g.depth = depth;
  // Upper floors can't project further than the ground floor.
  if (g.upper) g.upper = g.upper.map((u) => Math.min(u, depth));
  assertSane(m);
  return m;
}
