/**
 * Rule-based concept generator.
 *
 * Turns structured requirements + plot + region into complete building models.
 * This is deliberately deterministic and explainable; an AI layer may later
 * *propose* requirements or edits, but geometry is always produced here.
 *
 * Layout strategy (MVP): a "front row / hall / rear row" plan on a rectangular
 * footprint. Every room touches the hall, so every room is reachable, the
 * stair sits in the same position on every level, and all walls align
 * vertically between floors where possible.
 */
import type {
  BuildingModel, LayoutBay, LayoutRow, Level, MassingKind, RoomType,
} from "@/domain/model/types";
import { MODEL_SCHEMA_VERSION } from "@/domain/model/types";
import { rebuildModel } from "@/domain/model/build";
import { estimateCost, type CostEstimate } from "@/domain/cost/engine";
import type { Region } from "@/domain/regions/types";
import type { QualityTier, RegionalMaterial } from "@/domain/materials/types";
import type { PlotInput, Requirements } from "./requirements";
import type { Mm } from "@/domain/units";
import { validateModel, type ValidationReport } from "@/domain/model/validate";
import { pickBalconyRooms, resolveDesignLanguage } from "./design-language";

const STOREY_HEIGHT: Mm = 3200;
const CEILING_HEIGHT: Mm = 2900;
const HALL_DEPTH: Mm = 1300;
const STAIR_WIDTH: Mm = 2700;
const MIN_REAR_DEPTH_WITH_STAIR: Mm = 4100;
const PARKING_BAY = { width: 2700, depth: 5500 };

const TARGET_AREA: Record<RoomType, number> = {
  living: 26, dining: 13, kitchen: 13, master_bedroom: 18, bedroom: 13, guest_bedroom: 12,
  bathroom: 5, wc: 2.8, office: 9, laundry: 5, storage: 4, family: 15, garage: 18, stair: 10, hall: 0,
  majlis: 22, staff: 9,
};
const MIN_WIDTH: Record<RoomType, Mm> = {
  living: 3800, dining: 3000, kitchen: 2800, master_bedroom: 3600, bedroom: 3000, guest_bedroom: 3000,
  bathroom: 1900, wc: 1300, office: 2600, laundry: 2000, storage: 1500, family: 3200, garage: 3300,
  stair: STAIR_WIDTH, hall: 0, majlis: 3600, staff: 2600,
};
const ROOM_LABEL: Record<RoomType, string> = {
  living: "Living room", dining: "Dining", kitchen: "Kitchen", master_bedroom: "Main bedroom",
  bedroom: "Bedroom", guest_bedroom: "Guest bedroom", bathroom: "Bathroom", wc: "Guest WC",
  office: "Home office", laundry: "Laundry", storage: "Store", family: "Family lounge",
  garage: "Garage", stair: "Stair", hall: "Hall", majlis: "Majlis", staff: "Staff room",
};

interface ProgramRoom { type: RoomType; name: string; area: number; row: "front" | "rear" | "any" }

/** Distribute rooms across levels. */
function buildProgram(req: Requirements, areaFactor: number, staffNames: string[]): ProgramRoom[][] {
  const floors = req.floors;
  const levels: ProgramRoom[][] = Array.from({ length: floors }, () => []);
  const room = (type: RoomType, row: ProgramRoom["row"], name?: string): ProgramRoom => ({
    type, row, name: name ?? ROOM_LABEL[type],
    area: TARGET_AREA[type] * (type === "garage" ? Math.max(1, req.parking) : areaFactor),
  });
  const g = levels[0];
  g.push(room("living", "front"));
  // Formal reception near the entrance, so guests don't pass through family rooms.
  if (req.majlis) g.push(room("majlis", "front"));
  if (req.garage && req.parking > 0) g.push(room("garage", "front", req.parking > 1 ? `Garage (${req.parking} cars)` : "Garage"));
  g.push(room("kitchen", "rear"));
  if (req.separateDining) g.push(room("dining", "any"));
  if (req.office) g.push(room("office", "any"));
  if (req.laundry) g.push(room("laundry", "rear"));
  if (req.storage) g.push(room("storage", "rear"));
  // Staff rooms on the ground floor at the back, each with its own bathroom (not counted in the family's brief).
  for (let i = 0; i < req.staffRooms; i++) {
    const name = staffNames[i] ?? `Staff room ${i + 1}`;
    g.push(room("staff", "rear", name));
    g.push(room("bathroom", "rear", /room$/.test(name) ? name.replace(/room$/, "bathroom") : `${name} bathroom`));
  }
  if (floors > 1) for (const l of levels) l.push(room("stair", "rear"));

  // Bedrooms
  let bedroomsLeft = req.bedrooms;
  let bathsLeft = req.bathrooms;
  let bedNo = 1;
  const addBed = (lvl: ProgramRoom[], type: RoomType) => {
    lvl.push(room(type, "any", type === "master_bedroom" ? ROOM_LABEL.master_bedroom : type === "guest_bedroom" ? ROOM_LABEL.guest_bedroom : `Bedroom ${++bedNo}`));
    bedroomsLeft--;
  };
  if (floors === 1) {
    addBed(g, "master_bedroom");
    while (bedroomsLeft > 0) addBed(g, "bedroom");
    for (let i = 0; i < bathsLeft; i++) g.push(room("bathroom", "rear", bathsLeft > 1 ? `Bathroom ${i + 1}` : "Bathroom"));
    bathsLeft = 0;
  } else {
    const groundBed = req.guestRoomDownstairs || req.bedrooms >= 4;
    if (groundBed) {
      addBed(g, "guest_bedroom");
      g.push(room("bathroom", "rear", "Guest bathroom"));
      bathsLeft--;
    } else {
      g.push(room("wc", "rear"));
    }
    const uppers = levels.slice(1);
    if (req.familyLounge) uppers[0].push(room("family", "front"));
    uppers[0].push(room("master_bedroom", "front"));
    bedroomsLeft--;
    let i = 0;
    while (bedroomsLeft > 0) { addBed(uppers[i % uppers.length], "bedroom"); i++; }
    let b = 1;
    // Spread bathrooms across upper floors, at least one per upper floor.
    let j = 0;
    while (bathsLeft > 0) {
      uppers[j % uppers.length].push(room("bathroom", "rear", `Bathroom ${b++}`));
      bathsLeft--; j++;
    }
  }
  return levels;
}

/** Split a row width among bays by target area, respecting minimum widths. */
function distributeWidths(rooms: ProgramRoom[], W: Mm, warnings: string[], levelName: string): Mm[] {
  const mins = rooms.map((r) => MIN_WIDTH[r.type]);
  const minSum = mins.reduce((a, b) => a + b, 0);
  if (minSum > W) {
    warnings.push(`${levelName}: ${rooms.map((r) => r.name).join(", ")} don't comfortably fit in one ${(W / 1000).toFixed(1)} m row — some rooms are narrower than recommended.`);
    // Squeeze everything except the stair, whose width must stay fixed so it lines up between floors.
    const stairW = rooms.reduce((s, r, i) => s + (r.type === "stair" ? mins[i] : 0), 0);
    const flexMin = minSum - stairW;
    const k = flexMin > 0 ? Math.max(0, W - stairW) / flexMin : 1;
    const out = rooms.map((r, i) => (r.type === "stair" ? mins[i] : Math.floor((mins[i] * k) / 100) * 100));
    const lastFlex = out.map((_, i) => i).filter((i) => rooms[i].type !== "stair").pop();
    if (lastFlex !== undefined) out[lastFlex] += W - out.reduce((a, b) => a + b, 0);
    return out;
  }
  const fixed = rooms.map((r) => r.type === "stair");
  const widths = rooms.map((r, i) => (fixed[i] ? mins[i] : 0));
  let free = rooms.map((_, i) => !fixed[i]);
  for (let iter = 0; iter < rooms.length; iter++) {
    const remaining = W - widths.reduce((s, w, i) => s + (free[i] ? 0 : w), 0);
    const areaSum = rooms.reduce((s, r, i) => s + (free[i] ? r.area : 0), 0);
    let clamped = false;
    for (let i = 0; i < rooms.length; i++) {
      if (!free[i]) continue;
      const w = (remaining * rooms[i].area) / areaSum;
      if (w < mins[i]) { widths[i] = mins[i]; free = free.map((f, k) => (k === i ? false : f)); clamped = true; }
      else widths[i] = w;
    }
    if (!clamped) break;
  }
  const rounded = widths.map((w) => Math.round(w / 100) * 100);
  rounded[rounded.length - 1] += W - rounded.reduce((a, b) => a + b, 0);
  return rounded;
}

export interface GenerateInput {
  requirements: Requirements;
  plot: PlotInput;
  region: Region;
  /** Area multiplier on target room sizes (1 = typical) */
  areaFactor?: number;
  glazingFactor?: number;
  tier?: QualityTier;
  conceptName?: string;
  strategy?: string;
  selections: BuildingModel["selections"];
  /** Front massing: a plain rectangle, a projecting bay, or an L-shape (falls back to simple if it can't fit). */
  massing?: MassingKind;
}

interface MassingPlan { kind: MassingKind; boundary: Mm; depth: Mm; splits: number[] }

/**
 * Choose a shared group boundary X so that on every floor the last k front rooms
 * fit to the right of X and the rest fit to the left — the projecting volume
 * (right group) then lines up on every floor and runs the full height.
 */
function planMassing(kind: MassingKind, fronts: ProgramRoom[][], W: Mm, frontD: Mm, style: string): MassingPlan | null {
  if (kind === "simple" || fronts.some((f) => f.length < 2)) return null;
  const minW = (rs: ProgramRoom[]) => rs.reduce((s, r) => s + MIN_WIDTH[r.type], 0);
  const target = kind === "projecting_bay" ? W - Math.max(3600, Math.round(W * 0.3)) : Math.round(W * 0.5);
  const options = fronts.map((f) => (kind === "projecting_bay" ? [1] : Array.from({ length: f.length - 1 }, (_, k) => k + 1)));
  let best: { X: Mm; splits: number[]; cost: number } | null = null;
  const walk = (i: number, splits: number[]) => {
    if (i === fronts.length) {
      const lo = Math.max(...fronts.map((f, j) => minW(f.slice(0, f.length - splits[j]))));
      const hi = Math.min(...fronts.map((f, j) => W - minW(f.slice(f.length - splits[j]))));
      if (lo > hi) return;
      const X = Math.round(Math.min(Math.max(target, lo), hi) / 100) * 100;
      if (X < lo || X > hi) return;
      const cost = Math.abs(X - target);
      if (!best || cost < best.cost) best = { X, splits: [...splits], cost };
      return;
    }
    for (const k of options[i]) walk(i + 1, [...splits, k]);
  };
  walk(0, []);
  if (!best) return null;
  const { X, splits } = best as { X: Mm; splits: number[] };
  const subtle = style === "traditional" || style === "mediterranean";
  const depth = kind === "projecting_bay" ? (subtle ? 900 : 1200) : Math.max(2400, Math.min(3000, Math.round((frontD * 0.65) / 100) * 100));
  return { kind, boundary: X, depth, splits };
}

export function generateModel(input: GenerateInput): BuildingModel {
  const { requirements: req, plot, region } = input;
  const areaFactor = input.areaFactor ?? 1;
  const warnings: string[] = [];
  const tExt = region.constructionPractice.exteriorWallThickness;
  const tInt = region.constructionPractice.interiorWallThickness;
  const sb = region.planning.defaultSetbacks;

  const openParking = req.parking > 0 && !req.garage;
  // Room in front of the house for the porch and entrance steps (plus a clear 1.5 m).
  const arch = region.architecture;
  const entranceDepth = (arch.porch.depth || 0) + Math.max(1, Math.ceil(arch.plinth.height / 170) - 1) * 300 + 1500;
  const frontYard = Math.max(sb.front, openParking ? PARKING_BAY.depth + 500 : req.garage ? 5500 : 0, entranceDepth);
  const buildableW = plot.width - sb.left - sb.right - tExt;
  const buildableD = plot.depth - frontYard - sb.rear - tExt;
  if (buildableW < 6000 || buildableD < 6000) {
    warnings.push("The plot is very tight once setbacks and parking are allowed for — expect a compact design.");
  }

  const program = buildProgram(req, areaFactor, region.architecture.program.staffRoomNames);

  const rowMin = (rooms: ProgramRoom[]) => rooms.reduce((s, r) => s + MIN_WIDTH[r.type], 0);
  const rowArea = (rooms: ProgramRoom[]) => rooms.reduce((s, r) => s + r.area, 0);
  const rowsOf = (rooms: ProgramRoom[]) => {
    const front = rooms.filter((r) => r.row === "front");
    // Stair first so it sits in the same position (left of the rear row) on every level.
    const rear = [...rooms.filter((r) => r.type === "stair"), ...rooms.filter((r) => r.row === "rear" && r.type !== "stair")];
    // Flexible rooms go to whichever row has less width committed, largest first.
    for (const r of rooms.filter((r) => r.row === "any").sort((a, b) => b.area - a.area)) {
      (rowMin(front) <= rowMin(rear) ? front : rear).push(r);
    }
    // Garage sits at the end of the frontage with its own driveway, never between living spaces.
    front.sort((x, y) => Number(x.type === "garage") - Number(y.type === "garage"));
    return { front, rear };
  };
  const levelRows = program.map(rowsOf);
  const maxCoverageArea = region.planning.maxSiteCoverage * plot.width * plot.depth;
  const minRear = req.floors > 1 ? MIN_REAR_DEPTH_WITH_STAIR : 3000;

  // Search footprint widths; score how close each room comes to a comfortable
  // proportion (≤ 1.6:1) and how well the plan fits the plot.
  type Candidate = { W: Mm; frontD: Mm; rearD: Mm; score: number };
  let best: Candidate | null = null;
  const minW = Math.max(...levelRows.flatMap((lr) => [rowMin(lr.front), rowMin(lr.rear)]));
  for (let W = 6000; W <= Math.floor(buildableW / 100) * 100; W += 100) {
    const frontD = Math.max(3000, Math.round(Math.max(...levelRows.map((lr) => (rowArea(lr.front) * 1e6) / W)) / 100) * 100);
    const rearD = Math.max(minRear, Math.round(Math.max(...levelRows.map((lr) => (rowArea(lr.rear) * 1e6) / W)) / 100) * 100);
    const D = frontD + HALL_DEPTH + rearD;
    let score = 0;
    for (const lr of levelRows) {
      for (const [rooms, depth] of [[lr.front, frontD], [lr.rear, rearD]] as const) {
        const total = rowArea(rooms);
        for (const r of rooms) {
          const w = Math.max(MIN_WIDTH[r.type], (W * r.area) / total);
          const ratio = Math.max(w, depth) / Math.min(w, depth);
          score += r.area * Math.max(0, ratio - 1.6) ** 2;
        }
      }
    }
    if (W < minW) score += (minW - W) / 10;
    if (D > buildableD) score += (D - buildableD) / 5;
    if ((W + tExt) * (D + tExt) > maxCoverageArea) score += ((W + tExt) * (D + tExt) - maxCoverageArea) / 1e5;
    if (!best || score < best.score) best = { W, frontD, rearD, score };
  }
  if (!best) best = { W: Math.max(6000, Math.floor(buildableW / 100) * 100), frontD: 3500, rearD: minRear, score: 0 };
  const W = best.W;
  let { frontD, rearD } = best;
  let D = frontD + HALL_DEPTH + rearD;
  if (D > buildableD) {
    const scale = (buildableD - HALL_DEPTH) / (frontD + rearD);
    frontD = Math.max(3000, Math.floor((frontD * scale) / 100) * 100);
    rearD = Math.max(minRear, Math.floor((rearD * scale) / 100) * 100);
    D = frontD + HALL_DEPTH + rearD;
    warnings.push("The building depth is limited by the plot and setbacks — rooms are smaller than targeted.");
  }
  // Per level, move flexible rooms between rows so each row's width demand
  // (area ÷ depth) is as close as possible to the footprint width.
  for (const lr of levelRows) {
    for (let iter = 0; iter < 6; iter++) {
      const demand = (rooms: ProgramRoom[], d: Mm) => (rowArea(rooms) * 1e6) / d;
      const imbalance = () => Math.abs(demand(lr.front, frontD) - W) + Math.abs(demand(lr.rear, rearD) - W);
      const before = imbalance();
      let moved = false;
      for (const [from, to] of [[lr.front, lr.rear], [lr.rear, lr.front]] as const) {
        const candidates = from.filter((r) => r.row === "any").sort((a, b) => a.area - b.area);
        for (const r of candidates) {
          if (rowMin(to) + MIN_WIDTH[r.type] > W) continue;
          from.splice(from.indexOf(r), 1); to.push(r);
          if (imbalance() < before - 1) { moved = true; break; }
          to.splice(to.indexOf(r), 1); from.push(r);
        }
        if (moved) break;
      }
      if (!moved) break;
    }
    lr.front.sort((x, y) => Number(x.type === "garage") - Number(y.type === "garage"));
  }

  if ((W + tExt) * (D + tExt) > maxCoverageArea) {
    warnings.push(`Footprint exceeds the indicative ${Math.round(region.planning.maxSiteCoverage * 100)}% site-coverage limit for this region — confirm with the local planning authority.`);
  }

  // A row with nothing assigned (e.g. three floors but a small brief) becomes an honest flexible room.
  for (const lr of levelRows) for (const row of [lr.front, lr.rear]) if (row.length === 0) row.push({ type: "family", name: "Flexible room", area: TARGET_AREA.family, row: "any" });

  // Front massing needs at least two front rooms per floor (one each side of the volume's edge).
  // Bring a flexible room forward from the back row where one is free.
  if ((input.massing ?? "simple") !== "simple") {
    for (const lr of levelRows) {
      if (lr.front.length >= 2) continue;
      const candidate = lr.rear.filter((r) => r.row === "any").sort((a, b) => b.area - a.area)[0];
      const rearLeft = lr.rear.filter((r) => r !== candidate);
      if (candidate && rearLeft.length >= 1 && lr.front.reduce((s2, r) => s2 + MIN_WIDTH[r.type], 0) + MIN_WIDTH[candidate.type] <= W) {
        lr.rear.splice(lr.rear.indexOf(candidate), 1);
        lr.front.push(candidate);
        lr.front.sort((x, y) => Number(x.type === "garage") - Number(y.type === "garage"));
      }
    }
  }

  // Front massing: projecting volume on the right, entrance side recessed.
  let plan = planMassing(input.massing ?? "simple", levelRows.map((lr) => lr.front), W, frontD, req.style);
  if (plan && D + plan.depth > buildableD) {
    const fit = Math.floor((buildableD - D) / 100) * 100;
    plan = fit >= 900 ? { ...plan, depth: Math.min(plan.depth, fit) } : null;
    if (!plan) warnings.push("Not enough depth on the plot for a projecting volume — this concept uses a simple rectangular form.");
  } else if (input.massing && input.massing !== "simple" && !plan) {
    warnings.push("The front rooms can't line up across floors for a projecting volume — this concept uses a simple rectangular form.");
  }
  const P = plan?.depth ?? 0;

  const levels: Level[] = program.map((_, i) => {
    const id = `L${i}`;
    const name = i === 0 ? "Ground floor" : i === 1 ? "First floor" : "Second floor";
    const { front, rear } = levelRows[i];
    const mkBays = (rooms: ProgramRoom[], row: string, width: Mm = W, offset = 0): LayoutBay[] => {
      const widths = distributeWidths(rooms, width, warnings, name);
      return rooms.map((r, k) => ({ id: `${id}-${row}${k + 1 + offset}`, type: r.type, name: r.name, width: widths[k] }));
    };
    const frontBays = plan
      ? [
          ...mkBays(front.slice(0, front.length - plan.splits[i]), "f", plan.boundary),
          ...mkBays(front.slice(front.length - plan.splits[i]), "f", W - plan.boundary, front.length - plan.splits[i]),
        ]
      : mkBays(front, "f");
    const rows: LayoutRow[] = [
      { id: `${id}-front`, kind: "rooms", depth: frontD, bays: frontBays },
      { id: `${id}-hall`, kind: "circulation", depth: HALL_DEPTH, bays: [{ id: `${id}-hall`, type: "hall", name: i === 0 ? "Entrance hall" : "Landing", width: W }] },
      { id: `${id}-rear`, kind: "rooms", depth: rearD, bays: mkBays(rear, "r") },
    ];
    return {
      id, index: i, name, elevation: i * STOREY_HEIGHT, height: STOREY_HEIGHT, ceilingHeight: CEILING_HEIGHT,
      layout: { rows }, rooms: [], walls: [], doors: [], windows: [], stairs: [],
    };
  });

  const originX = sb.left + tExt / 2 + Math.max(0, (buildableW - W) / 2);
  // The projecting volume sits in the front yard; the main facade is set back by its depth.
  const originY = frontYard + P + tExt / 2;
  const garageBay = levels[0].layout.rows[0].bays.find((b) => b.type === "garage");
  let garageX = 0;
  if (garageBay) for (const b of levels[0].layout.rows[0].bays) { if (b === garageBay) break; garageX += b.width; }
  const driveway = req.parking > 0
    ? garageBay
      ? { x: Math.round(originX + garageX), y: 0, width: garageBay.width, depth: Math.round(frontYard) }
      : { x: Math.round(originX + W - Math.min(W, req.parking * PARKING_BAY.width)), y: 0, width: Math.min(W, req.parking * PARKING_BAY.width), depth: Math.round(frontYard - 500) }
    : null;

  // Style × region → roof, glazing, balconies, exterior elements, materials (with reasons).
  const lang = resolveDesignLanguage(req.style, region, input.selections, { useTypicalMaterials: (input.tier ?? "standard") === "standard" || input.tier === "basic" });
  const balconyRoomIds = pickBalconyRooms(levels, lang.balconies);
  // Terraces need a flat roof over the lower part; they suit the modern family of styles.
  const terraceStyles = ["modern", "contemporary", "minimalist", "luxury", "industrial"];
  const terraceWing = !!plan && plan.kind === "l_shape" && levels.length > 1 && lang.roof.type === "flat";
  const mainSetback = terraceWing && terraceStyles.includes(req.style) && areaFactor > 1.05 && frontD - 1800 >= 3300 ? 1800 : 0;
  const model: BuildingModel = {
    schemaVersion: MODEL_SCHEMA_VERSION,
    units: "mm",
    meta: { conceptName: input.conceptName ?? "Concept", style: req.style, strategy: input.strategy ?? "" },
    site: {
      plot: { width: plot.width, depth: plot.depth },
      setbacks: { ...sb, front: frontYard },
      northAngleDeg: plot.northAngleDeg,
      footprintOrigin: { x: Math.round(originX), y: Math.round(originY) },
      parking: { spaces: req.parking, covered: req.garage },
      driveway,
    },
    footprint: { width: W, depth: D },
    params: {
      glazingFactor: +((input.glazingFactor ?? 1) * lang.glazing).toFixed(2),
      wallThickness: { exterior: tExt, interior: tInt },
      slabThickness: 200,
      hallDepth: HALL_DEPTH,
    },
    levels,
    roof: lang.roof,
    selections: lang.selections,
    exterior: {
      ...lang.exterior, balconyRoomIds,
      // Pool size scales with the concept; placement (or an honest "doesn't fit") happens in deriveExterior.
      carport: req.carport && openParking,
      pool: req.pool ? (areaFactor < 0.95 ? { length: 6000, width: 3000 } : areaFactor <= 1.05 ? { length: 8000, width: 4000 } : { length: 10000, width: 4500 }) : null,
    },
    massing: plan
      ? { kind: plan.kind, groups: [
          { x0: 0, x1: plan.boundary, depth: 0, label: "Main volume", ...(mainSetback ? { upper: levels.slice(1).map(() => -mainSetback) } : {}) },
          { x0: plan.boundary, x1: W, depth: P, label: plan.kind === "l_shape" ? "Front wing" : "Projecting bay",
            ...(terraceWing ? { upper: levels.slice(1).map(() => 0) } : {}) },
        ] }
      : { kind: "simple", groups: [{ x0: 0, x1: W, depth: 0, label: "Main volume" }] },
    exteriorGeometry: EMPTY_EXTERIOR,
    designNotes: [
      ...lang.notes,
      ...(plan ? [plan.kind === "l_shape"
        ? `Form: an L-shape — a ${(P / 1000).toFixed(1)} m front wing with the entrance tucked into the inner corner, giving a sheltered arrival and a less boxy street front.${terraceWing ? " The wing is single-storey, so its roof becomes a terrace for the rooms upstairs." : ""}`
        : `Form: a ${(P / 1000).toFixed(1)} m projecting bay breaks up the facade and brings more light into the rooms inside it.`] : []),
      ...(mainSetback ? [`Upper floor set back ${(mainSetback / 1000).toFixed(1)} m: a terrace runs along the front, shading the ground-floor glazing.`] : []),
      ...(req.majlis || req.staffRooms ? [`Rooms: ${region.architecture.program.why}`] : []),
      ...(req.carport ? [openParking ? `Carport: ${region.architecture.carport.why}` : "Carport: not added — parking is in a garage, so there are no open bays to cover."] : []),
      ...(req.pool ? ["Pool: placed in the garden clear of the house and services. Pools usually need a safety barrier and approval — confirm local requirements."] : []),
    ],
    warnings: [],
  };
  let built = rebuildModel(model);
  // Keep the driveway clear of the entrance: slide it beside the porch, on whichever side has room.
  const { porch, steps } = built.exteriorGeometry.attached;
  const dw = built.site.driveway;
  const entry = [porch, steps].filter((r): r is NonNullable<typeof r> => !!r);
  if (dw && !garageBay && entry.length) {
    const ox = built.site.footprintOrigin.x;
    const p0 = Math.min(...entry.map((r) => r.x + ox)), p1 = Math.max(...entry.map((r) => r.x + r.width + ox));
    if (dw.x < p1 && dw.x + dw.width > p0) {
      const edge = (region.architecture.boundary.sides === "none" ? 0 : 300) + 300;
      const right = p1 + 300, left = p0 - 300 - dw.width;
      const x = right + dw.width <= plot.width - edge ? right : left >= edge ? left : null;
      if (x !== null) built = rebuildModel({ ...built, site: { ...built.site, driveway: { ...dw, x: Math.round(x) } } });
    }
  }
  return { ...built, warnings: [...warnings, ...built.warnings] };
}

const EMPTY_EXTERIOR: BuildingModel["exteriorGeometry"] = {
  attached: { steps: null, porch: null, balconies: [], hoods: [], acUnits: [], terraces: [] },
  site: { boundary: [], gates: [], paving: [], paths: [], drains: [], trees: [], services: [], lights: [], pool: null, planting: { beds: [], shrubs: [] }, parkingBays: [] },
};

export interface Concept {
  key: "A" | "B" | "C";
  name: string;
  strategy: string;
  model: BuildingModel;
  estimate: CostEstimate;
  highlights: string[];
  fit: string[];
  /** Deterministic model check. A concept with errors is shown as not feasible and can't be chosen. */
  validation: ValidationReport;
  feasible: boolean;
}

/**
 * Produce three concepts. Concept A actively searches for the largest design
 * that fits the budget; B is a balanced design; C is a generous design.
 */
export function generateConcepts(opts: {
  requirements: Requirements;
  plot: PlotInput;
  region: Region;
  catalog: RegionalMaterial[];
  budget: number | null;
  selectionsForTier: (tier: QualityTier) => BuildingModel["selections"];
}): Concept[] {
  const { requirements, plot, region, catalog, budget, selectionsForTier } = opts;
  const make = (areaFactor: number, tier: QualityTier, glazing: number, name: string, strategy: string, massing: MassingKind = "simple") => {
    const model = generateModel({
      requirements, plot, region, areaFactor, glazingFactor: glazing, tier, massing,
      conceptName: name, strategy, selections: selectionsForTier(tier),
    });
    return { model, estimate: estimateCost(model, region, catalog) };
  };

  // A — budget-fit search over area factor and finish tier.
  let a = make(0.9, "standard", 0.9, "Compact", "Efficient plan sized to your budget");
  if (budget) {
    const candidates: [number, QualityTier][] = [];
    for (const tier of ["standard", "basic"] as QualityTier[]) for (let f = 1.0; f >= 0.72; f -= 0.04) candidates.push([f, tier]);
    let found = false;
    for (const [f, tier] of candidates) {
      const c = make(f, tier, 0.9, "Compact", "Efficient plan sized to your budget");
      if (c.estimate.expected <= budget && validateModel(c.model).valid) { a = c; found = true; break; }
    }
    if (!found) a = make(0.72, "basic", 0.85, "Compact", "Smallest practical plan with basic finishes");
  }
  const b = make(1.0, "standard", 1.0, "Balanced", "Comfortable rooms, standard finishes and a projecting bay", "projecting_bay");
  const c = make(1.2, "premium", 1.25, "Generous", "An L-shaped house: larger rooms, more glazing and premium finishes", "l_shape");

  const describe = (key: Concept["key"], name: string, x: { model: BuildingModel; estimate: CostEstimate }): Concept => {
    const q = x.estimate.quantities;
    const highlights = [
      `${q.bedrooms} bedrooms · ${q.bathrooms} bathrooms`,
      `${q.floors} ${q.floors === 1 ? "storey" : "storeys"} · ${x.model.roof.type} roof`,
      `${Math.round(q.siteCoverage * 100)}% site coverage`,
    ];
    const fit: string[] = [];
    if (q.bedrooms >= requirements.bedrooms) fit.push(`Provides all ${requirements.bedrooms} requested bedrooms.`);
    if (requirements.parking) fit.push(requirements.garage ? `Garage for ${requirements.parking} car(s) with its own driveway.` : `Open parking for ${requirements.parking} car(s) in the front yard.`);
    if (budget) {
      const diff = x.estimate.expected - budget;
      fit.push(diff <= 0
        ? "Expected cost is within your target budget."
        : x.estimate.total[0] <= budget
          ? "Your budget falls inside this concept's estimate range."
          : "Exceeds your target budget — see optimisation options after selecting.");
    }
    if (key === "A") fit.push("Smallest footprint, least material — the most cost-efficient option.");
    if (key === "C") fit.push("More natural light and larger living spaces.");
    if (requirements.pool) {
      const pl = x.model.exteriorGeometry.site.pool;
      fit.push(pl ? `Pool ${(pl.water.width / 1000).toFixed(1)} × ${(pl.water.depth / 1000).toFixed(1)} m in the garden.` : "No room for the requested pool on this plot — see design notes.");
    }
    if (requirements.majlis) fit.push("Majlis at the front of the ground floor, near the entrance.");
    if (requirements.staffRooms) fit.push(`${requirements.staffRooms} staff ${requirements.staffRooms === 1 ? "room" : "rooms"} with own bathroom${requirements.staffRooms === 1 ? "" : "s"} at the back of the ground floor.`);
    const cp = x.model.exteriorGeometry.site.carports ?? [];
    if (requirements.carport && cp.length) fit.push(`Carport over ${x.model.exteriorGeometry.site.parkingBays.length} parking bay${x.model.exteriorGeometry.site.parkingBays.length === 1 ? "" : "s"}.`);
    const terraces = x.model.exteriorGeometry.attached.terraces;
    if (terraces.length) fit.push(`${terraces.reduce((s2, tr) => s2 + (tr.width * tr.depth) / 1e6, 0).toFixed(0)} m² of roof terrace upstairs.`);
    const validation = validateModel(x.model);
    if (!validation.valid) {
      // Be explicit rather than offer a plan that can't work.
      const errors = validation.issues.filter((i) => i.severity === "error");
      const noDoor = errors.filter((i) => i.rule === "rooms-accessible").map((i) => i.message.replace(/ has no door\.$/, ""));
      const reason = noDoor.length
        ? `there isn't enough width for all the rooms, so ${noDoor.slice(0, 3).join(", ")}${noDoor.length > 3 ? ` and ${noDoor.length - 3} more` : ""} would be too narrow to fit a door.`
        : errors.slice(0, 2).map((i) => i.message).join(" ");
      fit.length = 0;
      fit.push(
        `This brief doesn't fit on this plot with ${requirements.floors} ${requirements.floors === 1 ? "storey" : "storeys"}: ${reason}`,
        "Try adding a floor, reducing the number of rooms, or a wider plot.",
      );
    }
    return { key, name, strategy: x.model.meta.strategy, model: x.model, estimate: x.estimate, highlights, fit, validation, feasible: validation.valid };
  };
  return [describe("A", "Compact", a), describe("B", "Balanced", b), describe("C", "Generous", c)];
}
