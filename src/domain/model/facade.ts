/**
 * Facade composition, derived from the model — never placed by hand.
 * The accent (feature) material goes on the exterior walls of rooms in projecting
 * or set-back volumes and/or on the entrance wall, depending on the design language.
 */
import type { BuildingModel } from "./types";
import { projectionAt } from "./geometry";

export function accentWallIds(model: BuildingModel): Set<string> {
  const ids = new Set<string>();
  const rule = model.exterior?.facade?.accent ?? "none";
  if (rule === "none" || !model.selections.accent_finish) return ids;
  for (const level of model.levels) {
    if (rule === "projections_and_entrance") {
      const front = new Set(level.layout.rows[0]?.bays.map((b) => b.id) ?? []);
      for (const w of level.walls) {
        if (!w.exterior) continue;
        const room = level.rooms.find((r) => r.id === w.rooms[0]);
        if (room && front.has(room.id) && projectionAt(model, room.x, room.x + room.width, level.index) !== 0) ids.add(w.id);
      }
    }
    if (level.index === 0) {
      const entrance = level.doors.find((d) => d.kind === "entrance");
      if (entrance) ids.add(entrance.wallId);
    }
  }
  return ids;
}
