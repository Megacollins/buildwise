/**
 * Cost engine.
 *
 * Pure and deterministic: estimate = f(building model, regional rates, material catalog).
 * No AI is involved. Every line records its quantity, rate range and basis so
 * the estimate is auditable and reproducible on the server.
 */
import type { BuildingModel, MaterialCategory } from "@/domain/model/types";
import { computeQuantities, type Quantities } from "@/domain/model/quantities";
import type { Range, Region, DataStatus } from "@/domain/regions/types";
import type { RegionalMaterial } from "@/domain/materials/types";

export const COST_ENGINE_VERSION = "1.0.0";

export type CostGroup =
  | "site" | "foundation" | "structure" | "walls" | "roofing" | "doors" | "windows"
  | "electrical" | "plumbing" | "hvac" | "flooring" | "painting" | "ceilings" | "kitchen"
  | "bathrooms" | "external_works" | "labour" | "other";

export interface CostLine {
  id: string;
  group: CostGroup;
  label: string;
  quantity: number;
  unit: string;
  rate: Range;
  amount: Range;
  basis: string;
  /** Material driving this line, if any */
  materialId?: string;
  dataStatus: DataStatus;
}

export interface CostEstimate {
  engineVersion: string;
  regionId: string;
  currency: string;
  lines: CostLine[];
  groups: { group: CostGroup; amount: Range }[];
  subtotal: Range;
  total: Range;
  /** Mid-point of the range — a reference value, not a quote */
  expected: number;
  perM2: Range;
  grossFloorArea: number;
  dataStatus: DataStatus;
  missing: string[];
  quantities: Quantities;
}

const add = (a: Range, b: Range): Range => [a[0] + b[0], a[1] + b[1]];
const mul = (r: Range, q: number): Range => [r[0] * q, r[1] * q];

const CATEGORY_GROUP: Record<MaterialCategory, CostGroup> = {
  flooring: "flooring", wall_paint: "painting", exterior_finish: "walls", accent_finish: "walls", roofing: "roofing",
  windows: "windows", doors: "doors", ceiling: "ceilings", lighting: "electrical",
  cabinets: "kitchen", countertops: "kitchen", bathroom_fixtures: "bathrooms",
  driveway: "external_works", landscaping: "external_works",
};

export function estimateCost(
  model: BuildingModel,
  region: Region,
  catalog: RegionalMaterial[],
): CostEstimate {
  const q = computeQuantities(model);
  const r = region.rates;
  const lines: CostLine[] = [];
  const missing: string[] = [];
  const status = region.dataStatus;

  const line = (l: Omit<CostLine, "amount" | "dataStatus"> & { dataStatus?: DataStatus }) => {
    if (l.quantity <= 0) return;
    lines.push({ ...l, amount: mul(l.rate, l.quantity), dataStatus: l.dataStatus ?? status });
  };

  // --- Construction (supply & install rates from region) ---------------------
  line({ id: "site-prep", group: "site", label: "Site clearance & setting out", quantity: q.plotArea, unit: "m²", rate: r.sitePrepPerM2Plot, basis: "Plot area" });
  const foundationFactor = 1 + r.foundationStoreyFactor * (q.floors - 1);
  line({ id: "foundation", group: "foundation", label: `Foundations & ground slab (${q.floors}-storey loading)`, quantity: q.footprintArea, unit: "m²", rate: mul(r.foundationPerM2Footprint, foundationFactor), basis: `Footprint area × storey factor ${foundationFactor.toFixed(2)}` });
  line({ id: "structure", group: "structure", label: "Structure: frame, floors & slabs", quantity: q.grossFloorArea, unit: "m²", rate: r.structurePerM2Gfa, basis: "Gross floor area" });
  line({ id: "ext-walls", group: "walls", label: "External walls", quantity: q.exteriorWallNetArea, unit: "m²", rate: r.externalWallPerM2, basis: "External wall area less openings" });
  line({ id: "int-walls", group: "walls", label: "Internal partitions", quantity: q.interiorWallArea, unit: "m²", rate: r.internalWallPerM2, basis: "Internal wall length × ceiling height" });
  line({ id: "roof-structure", group: "roofing", label: `Roof structure (${model.roof.type})`, quantity: q.roofArea, unit: "m²", rate: mul(r.roofStructurePerM2, r.roofTypeFactor[model.roof.type]), basis: `Roof area incl. overhang × ${r.roofTypeFactor[model.roof.type]} (${model.roof.type})` });
  line({ id: "stairs", group: "structure", label: "Staircase", quantity: q.stairs, unit: "each", rate: r.stairEach, basis: "Stairs in model" });
  line({ id: "entrance-door", group: "doors", label: "Main entrance door", quantity: q.entranceDoorCount, unit: "each", rate: r.entranceDoorEach, basis: "Entrance doors in model" });
  line({ id: "garage-door", group: "doors", label: "Garage door", quantity: q.garageDoorCount, unit: "each", rate: r.garageDoorEach, basis: "Garage doors in model" });
  line({ id: "electrical", group: "electrical", label: "Electrical installation (wiring, boards, outlets)", quantity: q.grossFloorArea, unit: "m²", rate: r.electricalPerM2Gfa, basis: "Gross floor area" });
  line({ id: "plumbing", group: "plumbing", label: "Plumbing & drainage", quantity: q.wetRooms, unit: "wet room", rate: r.plumbingPerWetRoom, basis: "Bathrooms, WCs, kitchen & laundry" });
  line({ id: "hvac", group: "hvac", label: q.external.acUnits ? `Cooling & ventilation (${q.external.acUnits} split AC units)` : "Heating / cooling / ventilation", quantity: q.grossFloorArea, unit: "m²", rate: r.hvacPerM2Gfa, basis: "Gross floor area" });

  // --- External works & attached elements ------------------------------------
  const x = r.external, qx = q.external;
  const BOUNDARY_LABEL = { masonry_wall: "Perimeter fence wall", low_wall: "Low boundary wall", fence: "Boundary fence", hedge: "Hedge planting" } as const;
  for (const b of qx.boundary) {
    const factor = b.kind === "hedge" ? 1 : b.height / (x.boundaryRefHeight / 1000);
    line({ id: `boundary-${b.kind}-${b.height}`, group: "external_works", label: `${BOUNDARY_LABEL[b.kind]} (${b.height.toFixed(1)} m high)`, quantity: b.length, unit: "m", rate: mul(x.boundaryPerM[b.kind], factor), basis: `Boundary length; rate scaled to height (×${factor.toFixed(2)})` });
  }
  line({ id: "vehicle-gate", group: "external_works", label: "Vehicle gate", quantity: qx.vehicleGates, unit: "each", rate: x.vehicleGateEach, basis: "Gates in model" });
  line({ id: "pedestrian-gate", group: "external_works", label: "Pedestrian gate", quantity: qx.pedestrianGates, unit: "each", rate: x.pedestrianGateEach, basis: "Gates in model" });
  line({ id: "plinth", group: "foundation", label: `Raised ground floor (${model.exterior.plinth} mm): fill & compaction`, quantity: qx.plinthFillVolume, unit: "m³", rate: x.plinthFillPerM3, basis: "Footprint × height above a standard 150 mm" });
  line({ id: "porch", group: "structure", label: "Entrance porch & canopy", quantity: qx.porchArea, unit: "m²", rate: x.porchPerM2, basis: "Porch area" });
  line({ id: "steps", group: "structure", label: "Entrance steps", quantity: qx.stepsArea, unit: "m²", rate: x.stepsPerM2, basis: "Steps area" });
  line({ id: "balconies", group: "structure", label: `Balconies with ${model.exterior.balustrade} balustrade`, quantity: qx.balconyArea, unit: "m²", rate: mul(x.balconyPerM2, model.exterior.balustrade === "glass" ? 1.25 : model.exterior.balustrade === "masonry" ? 0.95 : 1), basis: "Balcony area" });
  const shadingForm = model.exterior.shadingForm ?? "surround";
  if (shadingForm === "screen" && x.screenPerM2) {
    line({ id: "hoods", group: "windows", label: "Perforated window screens", quantity: qx.shadingScreenArea, unit: "m²", rate: x.screenPerM2, basis: "Screen area over shaded windows" });
  } else {
    line({ id: "hoods", group: "windows", label: shadingForm === "overhang" ? "Window overhangs" : shadingForm === "screen" ? "Window screens (priced as hoods — no screen rate for this region)" : "Window surrounds & hoods", quantity: qx.shadingHoodLength, unit: "m", rate: x.shadingHoodPerM, basis: "Total shading length over windows" });
  }
  line({ id: "drains", group: "external_works", label: "Surface-water drains", quantity: qx.drainLength, unit: "m", rate: x.drainPerM, basis: "Perimeter drain length" });
  const tankAt = qx.waterTankPlacement;
  const tankRate = tankAt === "stand" ? x.waterTankEach : x.waterTankByType?.[tankAt];
  line({
    id: "water-tank", group: "plumbing",
    label: tankAt === "roof" ? "Roof water tank (sectional, on the flat roof)" : tankAt === "underground" ? "Underground water tank" : "Water tank on raised stand",
    quantity: qx.waterTanks, unit: "each", rate: tankRate ?? x.waterTankEach,
    basis: tankRate ? "Services in model" : "Services in model — no rate for this tank type in this region; raised-stand rate used",
  });
  line({ id: "carport", group: "external_works", label: "Carport (posts, beams, roof)", quantity: qx.carportArea, unit: "m²", rate: x.carportPerM2, basis: "Covered area over the parking bays" });
  line({ id: "generator-house", group: "electrical", label: "Generator house", quantity: qx.generatorHouses, unit: "each", rate: x.generatorHouseEach, basis: "Services in model" });
  line({ id: "terraces", group: "roofing", label: `Roof terraces (waterproofing, insulation, paving)`, quantity: qx.terraceArea, unit: "m²", rate: x.terracePerM2, basis: "Exposed roof of lower floors" });
  line({ id: "terrace-balustrade", group: "structure", label: `Terrace balustrade (${model.exterior.balustrade})`, quantity: (model.exteriorGeometry.attached.terraces ?? []).reduce((s, tr) => s + tr.balustrade.reduce((a, e) => a + Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) / 1000, 0), 0), unit: "m", rate: x.balustradePerM[model.exterior.balustrade], basis: "Length of open terrace edges" });
  line({ id: "pool", group: "external_works", label: "Swimming pool (shell, lining, finishes)", quantity: qx.poolArea, unit: "m²", rate: x.poolPerM2, basis: "Water surface area" });
  line({ id: "pool-deck", group: "external_works", label: "Pool deck", quantity: qx.poolDeckArea, unit: "m²", rate: x.poolDeckPerM2, basis: "Deck around the pool" });
  line({ id: "pool-equipment", group: "external_works", label: "Pool pump, filtration & controls", quantity: qx.pools, unit: "each", rate: x.poolEquipmentEach, basis: "Pools in model" });
  line({ id: "external-lights", group: "electrical", label: "External & security lighting", quantity: qx.externalLights, unit: "each", rate: x.externalLightEach, basis: "Light points in model" });

  // --- Finishes (material supply prices from catalog) ------------------------
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const finishQty: Record<MaterialCategory, { quantity: number; unit: string; basis: string }> = {
    flooring: { quantity: q.finishedFloorArea, unit: "m²", basis: "Net room area (excl. garage)" },
    wall_paint: { quantity: q.paintArea, unit: "m²", basis: "Internal wall faces less openings" },
    exterior_finish: { quantity: Math.max(0, q.exteriorWallNetArea - q.accentArea), unit: "m²", basis: "External wall area less openings and feature walls" },
    accent_finish: { quantity: q.accentArea, unit: "m²", basis: "Feature walls: projecting volumes and the entrance wall" },
    roofing: { quantity: q.roofArea, unit: "m²", basis: "Roof area incl. overhang" },
    windows: { quantity: q.windowArea, unit: "m²", basis: `${q.windowCount} windows` },
    doors: { quantity: q.interiorDoorCount, unit: "each", basis: "Internal doors" },
    ceiling: { quantity: q.netFloorArea, unit: "m²", basis: "Net room area" },
    lighting: { quantity: q.lightPoints, unit: "point", basis: "≈1 point per 9 m² per room" },
    cabinets: { quantity: q.kitchenRunLength, unit: "m", basis: "Kitchen run (L-shape)" },
    countertops: { quantity: q.kitchenRunLength, unit: "m", basis: "Kitchen run (L-shape)" },
    bathroom_fixtures: { quantity: q.bathrooms, unit: "set", basis: "Bathrooms & WCs" },
    driveway: { quantity: q.drivewayArea, unit: "m²", basis: "Driveway, paved yard and paths" },
    landscaping: { quantity: q.landscapeArea, unit: "m²", basis: "Open plot area" },
  };

  let finishSupply: Range = [0, 0];
  for (const [category, sel] of Object.entries(finishQty) as [MaterialCategory, (typeof finishQty)[MaterialCategory]][]) {
    if (sel.quantity <= 0) continue;
    const materialId = model.selections[category];
    const material = materialId ? byId.get(materialId) : undefined;
    if (!material || !material.price) {
      missing.push(category);
      continue;
    }
    const amount = mul(material.price.price, sel.quantity);
    finishSupply = add(finishSupply, amount);
    lines.push({
      id: `mat-${category}`, group: CATEGORY_GROUP[category],
      label: material.name, quantity: sel.quantity, unit: sel.unit,
      rate: material.price.price, amount, basis: `${sel.basis} — supply only`,
      materialId: material.id, dataStatus: material.price.dataStatus,
    });
  }
  if (finishSupply[1] > 0) {
    lines.push({
      id: "finishes-labour", group: "labour", label: "Installation labour for finishes",
      quantity: r.finishesLabourFactor, unit: "× supply", rate: finishSupply,
      amount: mul(finishSupply, r.finishesLabourFactor),
      basis: `${Math.round(r.finishesLabourFactor * 100)}% of finish supply cost`, dataStatus: status,
    });
  }

  const construction = lines.reduce<Range>((s, l) => add(s, l.amount), [0, 0]);
  lines.push({
    id: "preliminaries", group: "other", label: "Preliminaries & site overheads",
    quantity: r.preliminariesFactor, unit: "× subtotal", rate: construction,
    amount: mul(construction, r.preliminariesFactor),
    basis: `${Math.round(r.preliminariesFactor * 100)}% of construction subtotal`, dataStatus: status,
  });
  lines.push({
    id: "contingency", group: "other", label: "Design & construction contingency",
    quantity: r.contingencyFactor, unit: "× subtotal", rate: construction,
    amount: mul(construction, r.contingencyFactor),
    basis: `${Math.round(r.contingencyFactor * 100)}% of construction subtotal`, dataStatus: status,
  });

  const total = lines.reduce<Range>((s, l) => add(s, l.amount), [0, 0]);
  const groupMap = new Map<CostGroup, Range>();
  for (const l of lines) groupMap.set(l.group, add(groupMap.get(l.group) ?? [0, 0], l.amount));
  const groups = [...groupMap.entries()]
    .map(([group, amount]) => ({ group, amount }))
    .sort((a, b) => b.amount[1] - a.amount[1]);

  const statuses = new Set(lines.map((l) => l.dataStatus));
  const dataStatus: DataStatus = statuses.has("sample") ? "sample" : statuses.has("partner_supplied") ? "partner_supplied" : "verified";

  return {
    engineVersion: COST_ENGINE_VERSION,
    regionId: region.id,
    currency: region.currency,
    lines,
    groups,
    subtotal: construction,
    total,
    expected: (total[0] + total[1]) / 2,
    perM2: [total[0] / q.grossFloorArea, total[1] / q.grossFloorArea],
    grossFloorArea: q.grossFloorArea,
    dataStatus,
    missing,
    quantities: q,
  };
}

export type BudgetStatus = "under" | "within_range" | "over";

export function budgetStatus(estimate: CostEstimate, budget: number | null) {
  if (!budget) return null;
  const [low, high] = estimate.total;
  const status: BudgetStatus = high <= budget ? "under" : low <= budget ? "within_range" : "over";
  return {
    status,
    budget,
    /** Positive = over budget, relative to the expected (mid-point) value */
    difference: estimate.expected - budget,
    differencePct: (estimate.expected - budget) / budget,
  };
}
