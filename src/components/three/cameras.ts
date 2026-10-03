/**
 * Camera presets, computed from the building model (never hard-coded per project).
 * Returns three.js-space poses: model (x, y, z) mm → three (x, z, −y) metres in plot coordinates.
 */
import type { BuildingModel, Room, RoomType } from "@/domain/model/types";
import { buildingBounds, buildingHeight, wallFrame } from "@/domain/model/geometry";

export type CameraPreset =
  | "whole" | "front" | "rear" | "left" | "right" | "top" | "entrance" | "plan"
  | "living" | "bedroom";

export const EXTERIOR_PRESETS: CameraPreset[] = ["whole", "front", "rear", "left", "right", "top", "entrance"];
export const INTERIOR_PRESETS: CameraPreset[] = ["living", "bedroom"];

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  /** Camera is inside a room: orbit becomes look-around and keyboard walking is enabled */
  interior: boolean;
  /** Level the preset needs visible as the top level (null = whole building with roof) */
  cutLevel: number | null;
  /** Elevation views: trees standing between this face and the camera are left out, as in an architectural elevation render */
  clearSide?: "front" | "rear" | "left" | "right";
}

const FOV = 45;

export function cameraPose(model: BuildingModel, preset: CameraPreset, chosenLevel: number | null): CameraPose {
  const o = model.site.footprintOrigin;
  const plinth = model.exterior?.plinth ?? 300;
  const b = buildingBounds(model).outer;
  const H = buildingHeight(model);
  const X = (x: number) => (o.x + x) / 1000;
  const Z = (y: number) => -(o.y + y) / 1000;
  const Y = (z: number) => (plinth + z) / 1000;
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const W = b.x1 - b.x0, D = b.y1 - b.y0;
  // Distance at which a face of width w and height h fills ~80% of a 45° frame (landscape-ish aspect).
  const fit = (w: number, h: number) => (Math.max(w / 1.5, h) / 2 / Math.tan((FOV / 2) * Math.PI / 180)) * 1.4 / 1000;
  const eye = Math.max(3.6, (H / 1000) * 0.5); // a little above a boundary wall, below the roof line
  const midH = Y(H * 0.42);

  switch (preset) {
    case "front": { const d = fit(W, H); return { position: [X(cx), eye, Z(b.y0) + d], target: [X(cx), midH, Z(cy)], interior: false, cutLevel: null, clearSide: "front" }; }
    case "rear": { const d = fit(W, H); return { position: [X(cx), eye, Z(b.y1) - d], target: [X(cx), midH, Z(cy)], interior: false, cutLevel: null, clearSide: "rear" }; }
    case "left": { const d = fit(D, H); return { position: [X(b.x0) - d, eye, Z(cy)], target: [X(cx), midH, Z(cy)], interior: false, cutLevel: null, clearSide: "left" }; }
    case "right": { const d = fit(D, H); return { position: [X(b.x1) + d, eye, Z(cy)], target: [X(cx), midH, Z(cy)], interior: false, cutLevel: null, clearSide: "right" }; }
    case "top": {
      const span = Math.max(model.site.plot.width, model.site.plot.depth);
      const pc = { x: model.site.plot.width / 2000, z: -model.site.plot.depth / 2000 };
      return { position: [pc.x, span / 1000 / Math.tan((FOV / 2) * Math.PI / 180) * 0.62, pc.z + 0.01], target: [pc.x, 0, pc.z], interior: false, cutLevel: null };
    }
    case "plan": {
      const lvl = chosenLevel ?? 0;
      const span = Math.max(W, D) / 1000;
      const z = Y(model.levels[lvl]?.elevation ?? 0);
      return { position: [X(cx), z + span * 1.05 + 3, Z(cy) + 0.01], target: [X(cx), z, Z(cy)], interior: false, cutLevel: lvl };
    }
    case "entrance": {
      const door = entranceDoorPoint(model);
      if (!door) return cameraPose(model, "front", chosenLevel);
      // Stand in the compound on the approach path, at eye height, looking at the door.
      const standY = Math.max(-o.y + 1500, door.y - 7500);
      return { position: [X(door.x - 1800), Y(-plinth + 1650), Z(standY)], target: [X(door.x), Y(1300), Z(door.y)], interior: false, cutLevel: null };
    }
    case "living":
    case "bedroom": {
      const types: RoomType[] = preset === "living" ? ["living", "family"] : ["master_bedroom", "bedroom", "guest_bedroom"];
      const levels = chosenLevel === null ? model.levels : [...model.levels].sort((a, c) => Math.abs(a.index - chosenLevel) - Math.abs(c.index - chosenLevel));
      for (const t of types) for (const level of levels) {
        const room = level.rooms.find((r) => r.type === t);
        if (room) return interiorPose(model, level.index, room, X, Y, Z);
      }
      return cameraPose(model, "whole", chosenLevel);
    }
    case "whole":
    default: {
      const span = Math.max(model.site.plot.width, model.site.plot.depth, H) / 1000;
      const pc = { x: X(cx), z: Z(cy) };
      return { position: [pc.x + span * 0.62, (H / 1000) + span * 0.5, pc.z + span * 0.85], target: [pc.x, (H / 1000) * 0.3, pc.z], interior: false, cutLevel: null };
    }
  }
}

/** Plan-space centre of the ground-floor entrance door, at the outer face of its wall. */
export function entranceDoorPoint(model: BuildingModel) {
  const ground = model.levels.find((l) => l.index === 0);
  const door = ground?.doors.find((d) => d.kind === "entrance");
  const wall = door && ground!.walls.find((w) => w.id === door.wallId);
  if (!door || !wall) return null;
  const { ux, uy } = wallFrame(wall);
  const s = door.offset + door.width / 2;
  return { x: wall.a.x + ux * s, y: wall.a.y + uy * s };
}

/**
 * Eye at 1.6 m in the corner of the room nearest its door, looking across the
 * diagonal — how an estate agent photographs a room. Stays inside the room bounds.
 */
function interiorPose(model: BuildingModel, levelIndex: number, room: Room, X: (x: number) => number, Y: (z: number) => number, Z: (y: number) => number): CameraPose {
  const level = model.levels.find((l) => l.index === levelIndex)!;
  const inset = Math.min(700, room.width / 4, room.depth / 4);
  const corners = [
    { x: room.x + inset, y: room.y + inset }, { x: room.x + room.width - inset, y: room.y + inset },
    { x: room.x + inset, y: room.y + room.depth - inset }, { x: room.x + room.width - inset, y: room.y + room.depth - inset },
  ];
  const door = level.doors.find((d) => d.swingInto === room.id);
  const wall = door && level.walls.find((w) => w.id === door.wallId);
  let start = corners[0];
  if (door && wall) {
    const { ux, uy } = wallFrame(wall);
    const s = door.offset + door.width / 2;
    const p = { x: wall.a.x + ux * s, y: wall.a.y + uy * s };
    start = corners.reduce((best, c) => (Math.hypot(c.x - p.x, c.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? c : best));
  }
  const far = { x: room.x + room.width - (start.x - room.x), y: room.y + room.depth - (start.y - room.y) };
  const z = level.elevation;
  // Target 0.6 m ahead along the diagonal: orbiting then turns the head rather than circling the room.
  const dx = far.x - start.x, dy = far.y - start.y, L = Math.hypot(dx, dy) || 1;
  const ahead = { x: start.x + (dx / L) * 600, y: start.y + (dy / L) * 600 };
  return {
    position: [X(start.x), Y(z + 1600), Z(start.y)],
    target: [X(ahead.x), Y(z + 1450), Z(ahead.y)],
    interior: true,
    // Keep the floors above in place: the room has a real ceiling and daylight only through its windows.
    cutLevel: null,
  };
}
