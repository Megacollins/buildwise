/**
 * Deterministic validation of the building model.
 *
 * No AI involved: every rule is plain geometry or bookkeeping, so the same
 * model always produces the same report.
 *
 *  - error   → the model is internally inconsistent (an opening off its wall,
 *              overlapping rooms, a stair that doesn't reach the next floor…).
 *              The server refuses to save a model with errors.
 *  - warning → geometrically valid, but a person should look at it
 *              (no window in a bedroom, steep stair, indicative setbacks…).
 *
 * Passing these checks means the model is self-consistent. It does NOT mean the
 * design complies with any building code — that requires professional review.
 */
import type { BuildingModel, Room, Wall } from "./types";
import { BATH_TYPES, HABITABLE } from "./types";
import { buildingBounds, exposedRects, groupDepthAt, wallLen } from "./geometry";

export type Severity = "error" | "warning";

export interface ValidationIssue {
  rule: RuleId;
  severity: Severity;
  message: string;
  levelId?: string;
  elementIds: string[];
}

export type RuleId =
  | "unique-ids" | "level-heights" | "layout-fills-footprint"
  | "room-boundaries" | "rooms-in-footprint" | "rooms-no-overlap" | "rooms-cover-footprint" | "room-areas"
  | "massing-aligned" | "floors-supported" | "setback-roof" | "pool-placement" | "carport-clear"
  | "walls-geometry" | "walls-reference-rooms" | "walls-connected" | "exterior-envelope-closed"
  | "openings-on-walls" | "openings-no-overlap" | "openings-serve-rooms" | "opening-heights"
  | "rooms-accessible" | "entrance-exists"
  | "stairs-in-room" | "stairs-connect-levels" | "stairs-fit" | "stair-proportions"
  | "footprint-in-plot" | "setbacks" | "driveway-in-plot" | "daylight"
  | "exterior-in-plot" | "entrance-clear" | "boundary-access" | "services-clear" | "balconies-accessible";

export const RULES: { id: RuleId; label: string; group: string }[] = [
  { id: "unique-ids", label: "Every element has a unique id", group: "Model" },
  { id: "level-heights", label: "Floor levels stack correctly; ceilings fit within storey heights", group: "Model" },
  { id: "layout-fills-footprint", label: "Room layout spans the footprint exactly", group: "Model" },
  { id: "room-boundaries", label: "Rooms have valid, positive boundaries", group: "Rooms" },
  { id: "rooms-in-footprint", label: "Rooms lie within the building footprint", group: "Rooms" },
  { id: "rooms-no-overlap", label: "Rooms on a level do not overlap", group: "Rooms" },
  { id: "rooms-cover-footprint", label: "Rooms cover the whole floor with no gaps", group: "Rooms" },
  { id: "room-areas", label: "Room areas and clear dimensions match the geometry", group: "Rooms" },
  { id: "massing-aligned", label: "Front volumes line up with their edges on every floor", group: "Rooms" },
  { id: "floors-supported", label: "Every part of an upper floor sits on the floor below (no overhangs)", group: "Rooms" },
  { id: "setback-roof", label: "The roof form can follow the top floor's outline", group: "Rooms" },
  { id: "walls-geometry", label: "Walls are straight, orthogonal and have thickness", group: "Walls" },
  { id: "walls-reference-rooms", label: "Walls separate rooms that exist and touch them", group: "Walls" },
  { id: "walls-connected", label: "Every wall end connects to another wall", group: "Walls" },
  { id: "exterior-envelope-closed", label: "Exterior walls form a closed envelope", group: "Walls" },
  { id: "openings-on-walls", label: "Doors and windows sit within an existing wall", group: "Openings" },
  { id: "openings-no-overlap", label: "Openings on the same wall do not overlap", group: "Openings" },
  { id: "openings-serve-rooms", label: "Doors and windows belong to rooms on that wall", group: "Openings" },
  { id: "opening-heights", label: "Door and window heights fit below the ceiling", group: "Openings" },
  { id: "rooms-accessible", label: "Every room can be entered", group: "Circulation" },
  { id: "entrance-exists", label: "The ground floor has an entrance from outside", group: "Circulation" },
  { id: "stairs-in-room", label: "Stairs lie inside their stair room", group: "Stairs" },
  { id: "stairs-connect-levels", label: "Stairs rise exactly one storey to a stair room above", group: "Stairs" },
  { id: "stairs-fit", label: "Stair flights and landing fit in the available length", group: "Stairs" },
  { id: "stair-proportions", label: "Riser and tread sizes are within common guidelines", group: "Stairs" },
  { id: "footprint-in-plot", label: "The building lies within the plot boundary", group: "Site" },
  { id: "setbacks", label: "The building respects the indicative setbacks", group: "Site" },
  { id: "driveway-in-plot", label: "The driveway lies within the plot", group: "Site" },
  { id: "exterior-in-plot", label: "Porch, steps, balconies and services lie within the plot", group: "Site" },
  { id: "entrance-clear", label: "The entrance steps and porch are clear of the driveway", group: "Site" },
  { id: "boundary-access", label: "The boundary has openings for the driveway and for people", group: "Site" },
  { id: "services-clear", label: "Water tank and generator house are clear of the house and driveway", group: "Site" },
  { id: "carport-clear", label: "A carport stays within the plot, clear of the house, with no post standing in a parking bay; a roof tank sits on a flat roof", group: "Site" },
  { id: "pool-placement", label: "The pool and deck are within the plot and clear of the house, driveway and services", group: "Site" },
  { id: "balconies-accessible", label: "Every balcony has a door from its room", group: "Openings" },
  { id: "daylight", label: "Habitable rooms and bathrooms have a window", group: "Comfort" },
];

export interface ValidationReport {
  valid: boolean;
  errors: number;
  warnings: number;
  issues: ValidationIssue[];
  /** Per-rule outcome, in RULES order */
  results: { id: RuleId; label: string; group: string; status: "pass" | "warning" | "error" }[];
}

const TOL = 1; // mm

const roomRect = (r: Room) => ({ x0: r.x, y0: r.y, x1: r.x + r.width, y1: r.y + r.depth });
const overlapArea = (a: Room, b: Room) => {
  const A = roomRect(a), B = roomRect(b);
  const w = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
  const d = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
  return w > TOL && d > TOL ? w * d : 0;
};
/** Does the room have an edge lying on this wall's line, overlapping it? */
function roomTouchesWall(r: Room, w: Wall) {
  const R = roomRect(r);
  if (w.a.y === w.b.y) {
    const onLine = Math.abs(w.a.y - R.y0) <= TOL || Math.abs(w.a.y - R.y1) <= TOL;
    return onLine && Math.min(w.a.x, w.b.x) < R.x1 - TOL && Math.max(w.a.x, w.b.x) > R.x0 + TOL;
  }
  const onLine = Math.abs(w.a.x - R.x0) <= TOL || Math.abs(w.a.x - R.x1) <= TOL;
  return onLine && Math.min(w.a.y, w.b.y) < R.y1 - TOL && Math.max(w.a.y, w.b.y) > R.y0 + TOL;
}
/** Is point p on wall w (including its ends)? */
function pointOnWall(p: { x: number; y: number }, w: Wall) {
  if (w.a.y === w.b.y) return Math.abs(p.y - w.a.y) <= TOL && p.x >= Math.min(w.a.x, w.b.x) - TOL && p.x <= Math.max(w.a.x, w.b.x) + TOL;
  return Math.abs(p.x - w.a.x) <= TOL && p.y >= Math.min(w.a.y, w.b.y) - TOL && p.y <= Math.max(w.a.y, w.b.y) + TOL;
}

export function validateModel(model: BuildingModel): ValidationReport {
  const issues: ValidationIssue[] = [];
  const add = (rule: RuleId, severity: Severity, message: string, elementIds: string[] = [], levelId?: string) =>
    issues.push({ rule, severity, message, elementIds, levelId });

  const W = model.footprint.width, D = model.footprint.depth;
  const tExt = model.params.wallThickness.exterior, tInt = model.params.wallThickness.interior;
  const maxProj = Math.max(0, ...(model.massing?.groups ?? []).map((g) => g.depth));
  const levels = [...model.levels].sort((a, b) => a.index - b.index);

  // ---- Model ---------------------------------------------------------------
  const seen = new Map<string, number>();
  for (const l of levels) {
    for (const id of [l.id, ...l.rooms.map((r) => r.id), ...l.walls.map((w) => w.id), ...l.doors.map((d) => d.id), ...l.windows.map((w) => w.id), ...l.stairs.map((s) => s.id)]) {
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
  }
  for (const [id, n] of seen) if (n > 1) add("unique-ids", "error", `Element id "${id}" is used ${n} times.`, [id]);

  let expectedElevation = 0;
  levels.forEach((l, i) => {
    if (l.index !== i) add("level-heights", "error", `Level "${l.name}" has index ${l.index}, expected ${i}.`, [l.id], l.id);
    if (Math.abs(l.elevation - expectedElevation) > TOL) add("level-heights", "error", `${l.name} is at ${l.elevation} mm but the floors below add up to ${expectedElevation} mm.`, [l.id], l.id);
    if (l.ceilingHeight <= 0 || l.ceilingHeight >= l.height) add("level-heights", "error", `${l.name}: ceiling height ${l.ceilingHeight} mm must be less than the storey height ${l.height} mm.`, [l.id], l.id);
    if (l.height - l.ceilingHeight < model.params.slabThickness) add("level-heights", "warning", `${l.name}: only ${l.height - l.ceilingHeight} mm left for the floor structure above (slab is ${model.params.slabThickness} mm).`, [l.id], l.id);
    expectedElevation += l.height;

    const depthSum = l.layout.rows.reduce((s, r) => s + r.depth, 0);
    if (Math.abs(depthSum - D) > TOL) add("layout-fills-footprint", "error", `${l.name}: rows total ${depthSum} mm deep but the footprint is ${D} mm.`, [l.id], l.id);
    for (const row of l.layout.rows) {
      const wSum = row.bays.reduce((s, b) => s + b.width, 0);
      if (Math.abs(wSum - W) > TOL) add("layout-fills-footprint", "error", `${l.name}: a row totals ${wSum} mm wide but the footprint is ${W} mm.`, [row.id], l.id);
    }
  });

  for (const l of levels) {
    // ---- Rooms -------------------------------------------------------------
    for (const r of l.rooms) {
      if (!(r.width > 0 && r.depth > 0 && r.clearWidth > 0 && r.clearDepth > 0)) add("room-boundaries", "error", `${r.name} has a non-positive size.`, [r.id], l.id);
      if (r.x < -TOL || r.y < -maxProj - TOL || r.x + r.width > W + TOL || r.y + r.depth > D + TOL) add("rooms-in-footprint", "error", `${r.name} extends outside the building footprint.`, [r.id], l.id);
      const tl = r.x === 0 ? tExt : tInt, tr = r.x + r.width >= W ? tExt : tInt;
      const inFrontRow = l.layout.rows[0]?.bays.some((b) => b.id === r.id) ?? r.y <= 0;
      const tf = inFrontRow ? tExt : tInt, tb = r.y + r.depth >= D ? tExt : tInt;
      const cw = r.width - tl / 2 - tr / 2, cd = r.depth - tf / 2 - tb / 2;
      if (Math.abs(cw - r.clearWidth) > TOL || Math.abs(cd - r.clearDepth) > TOL) add("room-areas", "error", `${r.name}: stated clear size doesn't match its walls.`, [r.id], l.id);
      if (Math.abs((r.clearWidth * r.clearDepth) / 1e6 - r.area) > 0.01) add("room-areas", "error", `${r.name}: stated area ${r.area.toFixed(2)} m² doesn't match ${(r.clearWidth * r.clearDepth / 1e6).toFixed(2)} m² from its dimensions.`, [r.id], l.id);
    }
    for (let i = 0; i < l.rooms.length; i++) for (let j = i + 1; j < l.rooms.length; j++) {
      const a = l.rooms[i], b = l.rooms[j];
      const ov = overlapArea(a, b);
      if (ov > 0) add("rooms-no-overlap", "error", `${a.name} and ${b.name} overlap by ${(ov / 1e6).toFixed(2)} m².`, [a.id, b.id], l.id);
    }
    // The main block must be covered exactly; projecting volumes add to it in front.
    const covered = l.rooms.reduce((s, r) => s + r.width * (r.depth - Math.max(0, -r.y)), 0);
    const setback = (model.massing?.groups ?? []).reduce((s, g) => s + Math.max(0, -groupDepthAt(g, l.index)) * (g.x1 - g.x0), 0);
    if (Math.abs(covered - (W * D - setback)) > 1e4) add("rooms-cover-footprint", "error", `${l.name}: rooms cover ${(covered / 1e6).toFixed(2)} m² of a ${((W * D - setback) / 1e6).toFixed(2)} m² floor.`, [l.id], l.id);
    // Projecting volumes must run full height: on every floor, front rooms line up with each group's edges.
    for (const g of (model.massing?.groups ?? []).filter((x) => groupDepthAt(x, l.index) !== 0)) {
      const d = groupDepthAt(g, l.index);
      const inGroup = l.rooms.filter((r) => r.y === -d && r.x + r.width / 2 >= g.x0 && r.x + r.width / 2 < g.x1);
      const minX = Math.min(...inGroup.map((r) => r.x)), maxX = Math.max(...inGroup.map((r) => r.x + r.width));
      const span = inGroup.reduce((s, r) => s + r.width, 0);
      if (!inGroup.length || Math.abs(minX - g.x0) > TOL || Math.abs(maxX - g.x1) > TOL || Math.abs(span - (g.x1 - g.x0)) > TOL) {
        add("massing-aligned", "error", `${l.name}: the front rooms don't line up with the ${g.label.toLowerCase()} (${((g.x1 - g.x0) / 1000).toFixed(2)} m wide), so the volume isn't consistent on this floor.`, [l.id], l.id);
      }
    }

    // ---- Walls -------------------------------------------------------------
    const roomIds = new Set(l.rooms.map((r) => r.id));
    for (const w of l.walls) {
      const len = wallLen(w);
      if (len <= TOL || w.thickness <= 0 || (w.a.x !== w.b.x && w.a.y !== w.b.y)) add("walls-geometry", "error", `Wall ${w.id} has invalid geometry.`, [w.id], l.id);
      if (w.exterior !== (w.rooms.length === 1)) add("walls-reference-rooms", "error", `Wall ${w.id}: exterior walls must face exactly one room, interior walls two.`, [w.id], l.id);
      for (const rid of w.rooms) {
        const r = l.rooms.find((x) => x.id === rid);
        if (!roomIds.has(rid) || !r) add("walls-reference-rooms", "error", `Wall ${w.id} refers to a room that doesn't exist.`, [w.id], l.id);
        else if (!roomTouchesWall(r, w)) add("walls-reference-rooms", "error", `Wall ${w.id} is not on the boundary of ${r.name}.`, [w.id, r.id], l.id);
      }

    }
    for (const w of l.walls) {
      for (const p of [w.a, w.b]) {
        const connected = l.walls.some((o) => o !== w && pointOnWall(p, o));
        if (!connected) add("walls-connected", "error", `A wall end at (${p.x}, ${p.y}) on ${l.name} is not connected to any other wall.`, [w.id], l.id);
      }
    }
    // The envelope is closed when every exterior wall end meets another exterior wall.
    const ext = l.walls.filter((w) => w.exterior);
    for (const w of ext) for (const p of [w.a, w.b]) {
      if (!ext.some((o2) => o2 !== w && pointOnWall(p, o2))) add("exterior-envelope-closed", "error", `${l.name}: the outer wall has a gap at (${p.x}, ${p.y}).`, [w.id], l.id);
    }
    const extLen = ext.reduce((s, w) => s + wallLen(w), 0);
    const bboxPerimeter = 2 * ((Math.max(...l.rooms.map((r) => r.x + r.width)) - Math.min(...l.rooms.map((r) => r.x))) + (Math.max(...l.rooms.map((r) => r.y + r.depth)) - Math.min(...l.rooms.map((r) => r.y))));
    // An orthogonal outline's perimeter is at least its bounding box's (equal for rectangles and L-shapes).
    if (extLen < bboxPerimeter - TOL * 8) add("exterior-envelope-closed", "error", `${l.name}: exterior walls total ${(extLen / 1000).toFixed(2)} m — less than the outline needs.`, [l.id], l.id);

    // ---- Openings ----------------------------------------------------------
    const byWall = new Map<string, { id: string; from: number; to: number; name: string }[]>();
    const openings = [
      ...l.doors.map((d) => ({ id: d.id, tag: d.tag, wallId: d.wallId, offset: d.offset, width: d.width, bottom: 0, top: d.height, room: d.swingInto, isDoor: true })),
      ...l.windows.map((w) => ({ id: w.id, tag: w.tag, wallId: w.wallId, offset: w.offset, width: w.width, bottom: w.sill, top: w.sill + w.height, room: w.roomId as string | null, isDoor: false })),
    ];
    for (const o of openings) {
      const wall = l.walls.find((w) => w.id === o.wallId);
      if (!wall) { add("openings-on-walls", "error", `${o.tag} is attached to a wall that doesn't exist.`, [o.id], l.id); continue; }
      const L = wallLen(wall);
      if (o.width <= 0 || o.offset < -TOL || o.offset + o.width > L + TOL) add("openings-on-walls", "error", `${o.tag} (${o.width} mm) doesn't fit within its ${Math.round(L)} mm wall.`, [o.id, wall.id], l.id);
      if (o.room && !wall.rooms.includes(o.room)) add("openings-serve-rooms", "error", `${o.tag} opens into a room that isn't on its wall.`, [o.id, wall.id], l.id);
      if (!o.isDoor && o.room === null) add("openings-serve-rooms", "error", `${o.tag} doesn't belong to a room.`, [o.id], l.id);
      if (o.bottom < 0 || o.top > l.ceilingHeight || o.top <= o.bottom) add("opening-heights", "error", `${o.tag} runs from ${o.bottom} to ${o.top} mm, above the ${l.ceilingHeight} mm ceiling or inverted.`, [o.id], l.id);
      const list = byWall.get(wall.id) ?? [];
      list.push({ id: o.id, from: o.offset, to: o.offset + o.width, name: o.tag });
      byWall.set(wall.id, list);
    }
    for (const [wallId, list] of byWall) {
      list.sort((a, b) => a.from - b.from);
      for (let i = 1; i < list.length; i++) if (list[i].from < list[i - 1].to - TOL) {
        add("openings-no-overlap", "error", `${list[i - 1].name} and ${list[i].name} overlap on the same wall.`, [list[i - 1].id, list[i].id, wallId], l.id);
      }
    }

    // ---- Circulation -------------------------------------------------------
    const circulation = new Set(l.layout.rows.filter((r) => r.kind === "circulation").flatMap((r) => r.bays.map((b) => b.id)));
    for (const r of l.rooms) {
      if (circulation.has(r.id) || r.type === "stair") continue;
      const entered = l.doors.some((d) => d.swingInto === r.id || d.connects.includes(r.id));
      if (!entered) add("rooms-accessible", "error", `${r.name} has no door.`, [r.id], l.id);
    }
    if (l.index === 0 && !l.doors.some((d) => d.kind === "entrance")) add("entrance-exists", "error", "The ground floor has no entrance door.", [l.id], l.id);

    // ---- Stairs ------------------------------------------------------------
    const above = levels.find((x) => x.index === l.index + 1);
    for (const s of l.stairs) {
      const room = l.rooms.find((r) => r.id === s.roomId);
      if (!room) { add("stairs-in-room", "error", `Stair ${s.id} refers to a missing room.`, [s.id], l.id); continue; }
      if (s.x < room.x - TOL || s.y < room.y - TOL || s.x + s.width > room.x + room.width + TOL || s.y + s.depth > room.y + room.depth + TOL) {
        add("stairs-in-room", "error", `The stair extends outside ${room.name}.`, [s.id, room.id], l.id);
      }
      if (!above) add("stairs-connect-levels", "error", `The stair on ${l.name} has no floor above it.`, [s.id], l.id);
      else {
        const target = above.rooms.find((r) => r.type === "stair" && r.x <= s.x + TOL && r.y <= s.y + TOL && r.x + r.width >= s.x + s.width - TOL && r.y + r.depth >= s.y + s.depth - TOL);
        if (!target) add("stairs-connect-levels", "error", `The stair on ${l.name} doesn't arrive in a stair opening on ${above.name}.`, [s.id], l.id);
      }
      if (Math.abs(s.risers * s.riserHeight - l.height) > s.risers) add("stairs-connect-levels", "error", `${s.risers} risers × ${s.riserHeight} mm = ${s.risers * s.riserHeight} mm, but the storey is ${l.height} mm.`, [s.id], l.id);
      const n1 = Math.ceil(s.risers / 2);
      const needed = (n1 - 1) * s.tread + s.flightWidth;
      if (needed > room.clearDepth + TOL) add("stairs-fit", "error", `The stair needs ${needed} mm of length but ${room.name} has ${room.clearDepth} mm.`, [s.id, room.id], l.id);
      if (2 * s.flightWidth > s.width + TOL) add("stairs-fit", "error", "The two stair flights are wider than the stair.", [s.id], l.id);
      if (s.riserHeight > 190 || s.tread < 250 || s.flightWidth < 900) add("stair-proportions", "warning", `Stair: ${s.riserHeight} mm risers, ${s.tread} mm treads, ${s.flightWidth} mm flights — outside common guidelines (≤190 / ≥250 / ≥900 mm). Confirm against local requirements.`, [s.id], l.id);
    }
    // A stair opening above must have a stair arriving from below.
    const below = levels.find((x) => x.index === l.index - 1);
    for (const r of l.rooms.filter((x) => x.type === "stair")) {
      const servedFromBelow = below?.stairs.some((s) => r.x <= s.x + TOL && r.y <= s.y + TOL && r.x + r.width >= s.x + s.width - TOL);
      const servesAbove = l.stairs.some((s) => s.roomId === r.id);
      if (!servedFromBelow && !servesAbove) add("stairs-connect-levels", "error", `${r.name} on ${l.name} has no stair in it.`, [r.id], l.id);
    }

    // ---- Comfort -----------------------------------------------------------
    for (const r of l.rooms) {
      if (![...HABITABLE, ...BATH_TYPES].includes(r.type)) continue;
      if (!l.windows.some((w) => w.roomId === r.id)) add("daylight", "warning", `${r.name} has no window (no exterior wall long enough). Consider mechanical ventilation or rearranging rooms.`, [r.id], l.id);
    }
  }

  // ---- Floors stack ----------------------------------------------------------
  for (let i = 1; i < levels.length; i++) {
    const overhang = exposedRects(levels[i].rooms, levels[i - 1].rooms).filter((r) => r.width > TOL && r.depth > TOL);
    for (const r of overhang) {
      add("floors-supported", "error", `${levels[i].name} overhangs the floor below by ${(r.width / 1000).toFixed(2)} × ${(r.depth / 1000).toFixed(2)} m — upper floors must sit on the floor below.`, [levels[i].id], levels[i].id);
    }
  }
  if (model.roof.type !== "flat") {
    const top = levels[levels.length - 1];
    const topCovered = top.rooms.reduce((s, r) => s + r.width * (r.depth - Math.max(0, -r.y)), 0);
    if (topCovered < W * D - 1e4) add("setback-roof", "error", "A set-back top floor needs a flat roof in this version — the pitched roof can't follow the set-back yet.", [top.id], top.id);
  }

  // ---- Site ----------------------------------------------------------------
  const { plot, setbacks, footprintOrigin: o, driveway } = model.site;
  const ob = buildingBounds(model).outer;
  const outer = { x0: o.x + ob.x0, y0: o.y + ob.y0, x1: o.x + ob.x1, y1: o.y + ob.y1 };
  if (outer.x0 < -TOL || outer.y0 < -TOL || outer.x1 > plot.width + TOL || outer.y1 > plot.depth + TOL) {
    add("footprint-in-plot", "error", "The building extends beyond the plot boundary.", []);
  } else {
    const short: string[] = [];
    if (outer.x0 < setbacks.left - TOL) short.push(`left ${Math.round(outer.x0)} mm (indicative ${setbacks.left})`);
    if (plot.width - outer.x1 < setbacks.right - TOL) short.push(`right ${Math.round(plot.width - outer.x1)} mm (indicative ${setbacks.right})`);
    if (plot.depth - outer.y1 < setbacks.rear - TOL) short.push(`rear ${Math.round(plot.depth - outer.y1)} mm (indicative ${setbacks.rear})`);
    if (short.length) add("setbacks", "warning", `Closer to the boundary than the indicative setbacks: ${short.join(", ")}. Confirm with the local planning authority.`, []);
  }
  if (driveway && (driveway.x < -TOL || driveway.y < -TOL || driveway.x + driveway.width > plot.width + TOL || driveway.y + driveway.depth > plot.depth + TOL)) {
    add("driveway-in-plot", "error", "The driveway extends beyond the plot.", []);
  }

  // ---- Exterior ------------------------------------------------------------
  const xg = model.exteriorGeometry;
  if (xg) {
    const inPlot = (r: { x: number; y: number; width: number; depth: number }) =>
      r.x >= -TOL && r.y >= -TOL && r.x + r.width <= plot.width + TOL && r.y + r.depth <= plot.depth + TOL;
    const toSite = (r: { x: number; y: number; width: number; depth: number }) => ({ ...r, x: r.x + o.x, y: r.y + o.y });
    const overlap = (a: { x: number; y: number; width: number; depth: number }, b: { x: number; y: number; width: number; depth: number }) =>
      a.x < b.x + b.width - TOL && a.x + a.width > b.x + TOL && a.y < b.y + b.depth - TOL && a.y + a.depth > b.y + TOL;
    const attached = [
      ...(xg.attached.porch ? [{ name: "The porch", r: xg.attached.porch }] : []),
      ...(xg.attached.steps ? [{ name: "The entrance steps", r: xg.attached.steps }] : []),
      ...xg.attached.balconies.map((b) => ({ name: "A balcony", r: b })),
      ...xg.attached.acUnits.map((a) => ({ name: "An AC unit", r: a })),
    ];
    for (const a of attached) if (!inPlot(toSite(a.r))) add("exterior-in-plot", "error", `${a.name} extends beyond the plot boundary.`, []);
    for (const sv of xg.site.services) if (!inPlot(sv)) add("exterior-in-plot", "error", `The ${sv.kind.replace("_", " ")} is outside the plot.`, [sv.id]);

    for (const a of attached.filter((x) => x.name === "The porch" || x.name === "The entrance steps")) {
      const ground = model.levels.find((l) => l.index === 0)!;
      if (ground.rooms.some((r) => overlap(a.r, { x: r.x - tExt / 2 + TOL, y: r.y - tExt / 2 + TOL, width: r.width + tExt - 2 * TOL, depth: r.depth + tExt - 2 * TOL }))) {
        add("entrance-clear", "error", `${a.name} runs into the building.`, []);
      }
    }
    if (driveway && !model.site.parking.covered) {
      for (const a of attached.filter((x) => x.name === "The porch" || x.name === "The entrance steps")) {
        if (overlap(toSite(a.r), driveway)) add("entrance-clear", "error", `${a.name} sits in the driveway.`, []);
      }
    }
    const frontWalls = xg.site.boundary.filter((b) => b.id.startsWith("bnd-front"));
    if (frontWalls.length && driveway) {
      const cx = driveway.x + driveway.width / 2;
      const blocked = frontWalls.some((b) => Math.min(b.a.x, b.b.x) < cx && Math.max(b.a.x, b.b.x) > cx);
      if (blocked) add("boundary-access", "error", "The front boundary wall blocks the driveway — it needs a gate or opening.", []);
    }
    if (frontWalls.length) {
      const total = frontWalls.reduce((s, b) => s + Math.abs(b.b.x - b.a.x), 0);
      if (total >= plot.width - TOL) add("boundary-access", "error", "The front boundary has no opening for people to enter.", []);
    }
    const bldgRect = { x: outer.x0, y: outer.y0, width: outer.x1 - outer.x0, depth: outer.y1 - outer.y0 };
    for (const sv of xg.site.services.filter((x) => x.placement === "roof")) {
      const onRoof = sv.x >= bldgRect.x - TOL && sv.y >= bldgRect.y - TOL && sv.x + sv.width <= bldgRect.x + bldgRect.width + TOL && sv.y + sv.depth <= bldgRect.y + bldgRect.depth + TOL;
      if (model.roof.type !== "flat" || !onRoof) add("carport-clear", "error", "The roof water tank needs a flat roof to stand on.", [sv.id]);
    }
    for (const cp of xg.site.carports ?? []) {
      if (!inPlot(cp)) add("carport-clear", "error", "The carport extends beyond the plot.", [cp.id]);
      if (overlap(cp, bldgRect)) add("carport-clear", "error", "The carport overlaps the house.", [cp.id]);
      for (const p of cp.posts) if (xg.site.parkingBays.some((b) => p.x > b.x + TOL && p.x < b.x + b.width - TOL && p.y > b.y + TOL && p.y < b.y + b.depth - TOL)) {
        add("carport-clear", "error", "A carport post stands inside a parking bay.", [cp.id]);
        break;
      }
    }
    for (const sv of xg.site.services.filter((x) => x.placement !== "roof")) {
      if (overlap(sv, bldgRect)) add("services-clear", "error", `The ${sv.kind.replace("_", " ")} overlaps the house.`, [sv.id]);
      if (driveway && overlap(sv, driveway)) add("services-clear", "error", `The ${sv.kind.replace("_", " ")} sits in the driveway.`, [sv.id]);
    }
    if (xg.site.pool) {
      const { water, deck } = xg.site.pool;
      const inside = (a: typeof water, b: typeof deck) => a.x >= b.x - TOL && a.y >= b.y - TOL && a.x + a.width <= b.x + b.width + TOL && a.y + a.depth <= b.y + b.depth + TOL;
      if (!inside(water, deck)) add("pool-placement", "error", "The pool extends beyond its deck.", []);
      if (!inPlot(deck)) add("pool-placement", "error", "The pool deck extends beyond the plot.", []);
      if (overlap(deck, { x: outer.x0, y: outer.y0, width: outer.x1 - outer.x0, depth: outer.y1 - outer.y0 })) add("pool-placement", "error", "The pool deck overlaps the house.", []);
      if (driveway && overlap(deck, driveway)) add("pool-placement", "error", "The pool deck overlaps the driveway.", []);
      if (xg.site.services.some((sv) => sv.placement !== "roof" && overlap(deck, sv))) add("pool-placement", "error", "The pool deck overlaps a service building.", []);
      const toBoundary = Math.min(water.x, water.y, plot.width - water.x - water.width, plot.depth - water.y - water.depth);
      if (toBoundary < 1500) add("pool-placement", "warning", `The pool is ${(toBoundary / 1000).toFixed(1)} m from the boundary — check local rules for pool setbacks and safety barriers.`, []);
    }
    for (const b of xg.attached.balconies) {
      const lvl = model.levels.find((l) => l.id === b.levelId);
      if (!lvl?.windows.some((w) => w.roomId === b.roomId && w.balconyDoor)) add("balconies-accessible", "error", "A balcony has no door from its room.", [b.id]);
    }
  }

  const results = RULES.map((r) => {
    const mine = issues.filter((i) => i.rule === r.id);
    const status: "pass" | "warning" | "error" = mine.some((i) => i.severity === "error") ? "error" : mine.length ? "warning" : "pass";
    return { ...r, status };
  });
  const errors = issues.filter((i) => i.severity === "error").length;
  return { valid: errors === 0, errors, warnings: issues.length - errors, issues, results };
}
