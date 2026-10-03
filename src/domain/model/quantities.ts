/**
 * Quantity take-off. Every quantity used for cost estimation is measured here,
 * from the building model, with a human-readable basis so estimates are auditable.
 */
import type { BoundaryKind, BuildingModel, Level, TankPlacement, Wall } from "./types";
import { accentWallIds } from "./facade";
import { BATH_TYPES, BEDROOM_TYPES } from "./types";

export const wallLength = (w: Wall) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);

export interface LevelQuantities {
  levelId: string;
  grossArea: number; // m², to outside face of exterior walls
  netArea: number; // m², sum of room clear areas
  exteriorWallLength: number; // m (centreline)
  interiorWallLength: number; // m
  exteriorWallArea: number; // m², gross of openings
  interiorWallArea: number; // m², one face
  windowArea: number; // m²
  exteriorDoorArea: number; // m²
  interiorDoorCount: number;
}

export interface Quantities {
  plotArea: number;
  footprintArea: number; // m² gross
  grossFloorArea: number;
  netFloorArea: number;
  finishedFloorArea: number; // net area excluding garage/storage
  levels: LevelQuantities[];
  floors: number;
  exteriorWallNetArea: number; // m², after openings
  interiorWallArea: number; // m², one face
  paintArea: number; // m², internal faces of all walls (both faces of interior walls, inner face of exterior walls) minus openings
  roofArea: number; // m² (sloped, incl. overhang)
  roofPlanArea: number; // m² (horizontal projection)
  windowArea: number;
  windowCount: number;
  interiorDoorCount: number;
  entranceDoorCount: number;
  garageDoorCount: number;
  bedrooms: number;
  bathrooms: number;
  wetRooms: number;
  lightPoints: number;
  kitchenRunLength: number; // m of worktop / base cabinet
  stairs: number;
  drivewayArea: number;
  landscapeArea: number;
  /** Feature-wall area (accent material), net of openings */
  accentArea: number;
  siteCoverage: number; // 0..1
  perimeter: number; // m, footprint outside
  external: {
    /** Boundary length by kind, each with its height (m) */
    boundary: { kind: Exclude<BoundaryKind, "none">; length: number; height: number }[];
    vehicleGates: number;
    pedestrianGates: number;
    porchArea: number;
    stepsArea: number;
    balconyArea: number;
    shadingHoodLength: number;
    drainLength: number;
    waterTanks: number;
    generatorHouses: number;
    externalLights: number;
    /** Raised ground floor fill volume, m³ */
    plinthFillVolume: number;
    acUnits: number;
    terraceArea: number;
    poolArea: number;
    poolDeckArea: number;
    pools: number;
    /** Window area behind shading screens, m² */
    shadingScreenArea: number;
    waterTankPlacement: TankPlacement;
    carportArea: number;
  };
}

const m = (mm: number) => mm / 1000;

export function levelQuantities(level: Level, model: BuildingModel): LevelQuantities {
  const tExt = model.params.wallThickness.exterior;
  let extLen = 0, intLen = 0;
  for (const w of level.walls) {
    if (w.exterior) extLen += wallLength(w);
    else intLen += wallLength(w);
  }
  const wallH = level.ceilingHeight;
  const windowArea = level.windows.reduce((s, w) => s + m(w.width) * m(w.height), 0);
  const extWallIds = new Set(level.walls.filter((w) => w.exterior).map((w) => w.id));
  const exteriorDoorArea = level.doors
    .filter((d) => extWallIds.has(d.wallId))
    .reduce((s, d) => s + m(d.width) * m(d.height), 0);
  return {
    levelId: level.id,
    // Gross area to outside faces: centreline area + half a wall all round (+ the four outer corners).
    grossArea: level.rooms.reduce((s, r) => s + m(r.width) * m(r.depth), 0) + m(extLen) * m(tExt) / 2 + m(tExt) * m(tExt),
    netArea: level.rooms.reduce((s, r) => s + r.area, 0),
    exteriorWallLength: m(extLen),
    interiorWallLength: m(intLen),
    exteriorWallArea: m(extLen) * m(level.height),
    interiorWallArea: m(intLen) * m(wallH),
    windowArea,
    exteriorDoorArea,
    interiorDoorCount: level.doors.filter((d) => d.kind === "internal").length,
  };
}

export function computeQuantities(model: BuildingModel): Quantities {
  const levels = model.levels.map((l) => levelQuantities(l, model));
  const tExt = model.params.wallThickness.exterior;
  const fw = m(model.footprint.width + tExt);
  const fd = m(model.footprint.depth + tExt);
  const footprintArea = levels.find((l) => l.levelId === model.levels.find((x) => x.index === 0)?.id)?.grossArea ?? fw * fd;
  const plotArea = m(model.site.plot.width) * m(model.site.plot.depth);
  const rooms = model.levels.flatMap((l) => l.rooms);
  const allWindows = model.levels.flatMap((l) => l.windows);
  const allDoors = model.levels.flatMap((l) => l.doors);

  const o = m(model.roof.overhang);
  // Main roof plus each projecting volume's roof (the part in front of the main block).
  const projectionRoofs = (model.massing?.groups ?? []).filter((g) => g.depth > 0)
    .reduce((s, g) => s + (m(g.x1 - g.x0 + tExt) + o) * (m(g.depth) + o), 0);
  const roofPlanArea = model.roof.type === "flat" ? footprintArea : (fw + 2 * o) * (fd + 2 * o) + projectionRoofs;
  const pitch = model.roof.type === "flat" ? 0 : (model.roof.pitchDeg * Math.PI) / 180;
  const roofArea = roofPlanArea / Math.cos(pitch);

  const windowArea = levels.reduce((s, l) => s + l.windowArea, 0);
  const extDoorArea = levels.reduce((s, l) => s + l.exteriorDoorArea, 0);
  const exteriorWallGross = levels.reduce((s, l) => s + l.exteriorWallArea, 0);
  const interiorWallArea = levels.reduce((s, l) => s + l.interiorWallArea, 0);
  const extInnerFace = model.levels.reduce(
    (s, l, i) => s + levels[i].exteriorWallLength * m(l.ceilingHeight), 0);
  const intDoorArea = allDoors.filter((d) => d.kind === "internal").reduce((s, d) => s + m(d.width) * m(d.height), 0);
  const paintArea = Math.max(0, extInnerFace - windowArea - extDoorArea + interiorWallArea * 2 - intDoorArea * 2);

  const kitchen = rooms.filter((r) => r.type === "kitchen");
  // Worktop run: an L along the two longest walls less a door zone, capped at a realistic run.
  const kitchenRunLength = kitchen.reduce(
    (s, r) => s + Math.min(m(r.clearWidth) + m(r.clearDepth) - 1.2, 9), 0);

  const lightPoints = rooms.reduce((s, r) => s + Math.max(1, Math.ceil(r.area / 9)), 0);
  const dw = model.site.driveway;
  const xg = model.exteriorGeometry;
  const rectArea = (r: { width: number; depth: number }) => m(r.width) * m(r.depth);
  // Hard landscaping: driveway, paved yard and paths (paved yard already includes the driveway area).
  const pavedYard = xg.site.paving.reduce((s, r) => s + rectArea(r), 0);
  const drivewayArea = Math.max(dw ? rectArea(dw) : 0, pavedYard) + xg.site.paths.reduce((s, r) => s + rectArea(r), 0);
  const servicesArea = xg.site.services.reduce((s, r) => s + rectArea(r), 0);
  const boundaryByKind = new Map<string, { kind: Exclude<BoundaryKind, "none">; length: number; height: number }>();
  for (const b of xg.site.boundary) {
    if (b.kind === "none") continue;
    const key = `${b.kind}-${b.height}`;
    const cur = boundaryByKind.get(key) ?? { kind: b.kind, length: 0, height: m(b.height) };
    cur.length += m(Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y));
    boundaryByKind.set(key, cur);
  }
  const external = {
    boundary: [...boundaryByKind.values()],
    vehicleGates: xg.site.gates.filter((g) => g.kind === "vehicle").length,
    pedestrianGates: xg.site.gates.filter((g) => g.kind === "pedestrian").length,
    porchArea: xg.attached.porch ? rectArea(xg.attached.porch) : 0,
    stepsArea: xg.attached.steps ? rectArea(xg.attached.steps) : 0,
    balconyArea: xg.attached.balconies.reduce((s, b) => s + rectArea(b), 0),
    shadingHoodLength: xg.attached.hoods.reduce((s, h) => s + m(Math.max(h.width, h.depth)), 0),
    drainLength: xg.site.drains.reduce((s, d) => s + m(Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)), 0),
    waterTanks: xg.site.services.filter((x) => x.kind === "water_tank").length,
    generatorHouses: xg.site.services.filter((x) => x.kind === "generator_house").length,
    externalLights: xg.site.lights.length,
    plinthFillVolume: model.exterior.plinth > 150 ? footprintArea * m(model.exterior.plinth - 150) : 0,
    acUnits: xg.attached.acUnits.length,
    terraceArea: (xg.attached.terraces ?? []).reduce((s, r) => s + rectArea(r), 0),
    poolArea: xg.site.pool ? rectArea(xg.site.pool.water) : 0,
    poolDeckArea: xg.site.pool ? rectArea(xg.site.pool.deck) - rectArea(xg.site.pool.water) : 0,
    pools: xg.site.pool ? 1 : 0,
    /** Screen area = window openings behind each shading element */
    shadingScreenArea: xg.attached.hoods.reduce((s, h) => {
      const w = model.levels.flatMap((l) => l.windows).find((x) => x.id === h.windowId);
      return s + (w ? m(w.width) * m(w.height) : 0);
    }, 0),
    waterTankPlacement: (xg.site.services.find((x) => x.kind === "water_tank")?.placement ?? "stand") as TankPlacement,
    carportArea: (xg.site.carports ?? []).reduce((s, c) => s + rectArea(c), 0),
  };

  return {
    plotArea,
    footprintArea,
    grossFloorArea: levels.reduce((s, l) => s + l.grossArea, 0),
    netFloorArea: levels.reduce((s, l) => s + l.netArea, 0),
    finishedFloorArea: rooms.filter((r) => r.type !== "garage").reduce((s, r) => s + r.area, 0),
    levels,
    floors: model.levels.length,
    exteriorWallNetArea: Math.max(0, exteriorWallGross - windowArea - extDoorArea),
    interiorWallArea,
    paintArea,
    roofArea,
    roofPlanArea,
    windowArea,
    windowCount: allWindows.length,
    interiorDoorCount: allDoors.filter((d) => d.kind === "internal").length,
    entranceDoorCount: allDoors.filter((d) => d.kind === "entrance").length,
    garageDoorCount: allDoors.filter((d) => d.kind === "garage").length,
    bedrooms: rooms.filter((r) => BEDROOM_TYPES.includes(r.type)).length,
    bathrooms: rooms.filter((r) => BATH_TYPES.includes(r.type)).length,
    wetRooms: rooms.filter((r) => [...BATH_TYPES, "kitchen", "laundry"].includes(r.type)).length,
    lightPoints,
    kitchenRunLength,
    stairs: model.levels.reduce((s, l) => s + l.stairs.length, 0),
    drivewayArea,
    landscapeArea: Math.max(0, plotArea - footprintArea - drivewayArea - servicesArea - external.porchArea - external.stepsArea - (xg.site.pool ? rectArea(xg.site.pool.deck) : 0)),
    accentArea: (() => {
      const ids = accentWallIds(model);
      let a = 0;
      for (const l of model.levels) for (const w of l.walls) {
        if (!ids.has(w.id)) continue;
        const openings = [...l.doors.filter((d) => d.wallId === w.id).map((d) => m(d.width) * m(d.height)), ...l.windows.filter((x) => x.wallId === w.id).map((x) => m(x.width) * m(x.height))];
        a += m(wallLength(w)) * m(l.height) - openings.reduce((s, v) => s + v, 0);
      }
      return Math.max(0, a);
    })(),
    siteCoverage: footprintArea / plotArea,
    perimeter: (levels[0]?.exteriorWallLength ?? 2 * (fw + fd)) + 4 * m(tExt),
    external,
  };
}
