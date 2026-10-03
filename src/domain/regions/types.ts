/**
 * Regional intelligence. Regions are data, not code: the building model never
 * references a country directly. A project points at a region id; the cost
 * engine, generator defaults and UI read from the region record.
 */
import type { MeasurementSystem, Mm } from "@/domain/units";
import type { BoundaryKind, MaterialCategory, RoofType, ShadingForm, TankPlacement } from "@/domain/model/types";

/** Provenance of a dataset. Only "verified" data may be presented without a caveat. */
export type DataStatus = "sample" | "partner_supplied" | "verified";

/** A low–high range in the region's currency. */
export type Range = [number, number];

export interface RegionCostRates {
  /** Site clearing & setting out, per m² of plot */
  sitePrepPerM2Plot: Range;
  /** Foundations, per m² of building footprint (single storey baseline) */
  foundationPerM2Footprint: Range;
  /** Additional foundation factor per storey above ground (e.g. 0.25 = +25% per extra floor) */
  foundationStoreyFactor: number;
  /** Structural frame, slabs & columns, per m² gross floor area */
  structurePerM2Gfa: Range;
  /** External walling (blockwork / framing / masonry) per m² of net wall */
  externalWallPerM2: Range;
  /** Internal partitions per m² (one face) */
  internalWallPerM2: Range;
  /** Roof structure per m² of roof area, before roofing finish */
  roofStructurePerM2: Range;
  /** Multipliers on roof structure by type */
  roofTypeFactor: Record<RoofType, number>;
  /** Stair construction, each */
  stairEach: Range;
  /** Entrance door supply & install, each */
  entranceDoorEach: Range;
  garageDoorEach: Range;
  /** Electrical installation (wiring, DB, sockets, switches) per m² GFA, excluding light fittings */
  electricalPerM2Gfa: Range;
  /** Plumbing (supply, drainage, water heater share) per wet room */
  plumbingPerWetRoom: Range;
  /** Mechanical ventilation / cooling / heating per m² GFA */
  hvacPerM2Gfa: Range;
  /** External works & attached elements (supply & install) */
  external: {
    boundaryPerM: Record<Exclude<BoundaryKind, "none">, Range>;
    /** Boundary rates are quoted for this height; other heights scale linearly */
    boundaryRefHeight: Mm;
    vehicleGateEach: Range;
    pedestrianGateEach: Range;
    porchPerM2: Range;
    stepsPerM2: Range;
    balconyPerM2: Range;
    shadingHoodPerM: Range;
    drainPerM: Range;
    waterTankEach: Range;
    generatorHouseEach: Range;
    externalLightEach: Range;
    /** Fill and retaining for a raised ground floor, per m³ */
    plinthFillPerM3: Range;
    /** Accessible roof terrace: waterproofing, insulation and paving, per m² */
    terracePerM2: Range;
    /** Terrace/roof balustrade, per metre (glass rates higher) */
    balustradePerM: Record<"glass" | "metal" | "masonry", Range>;
    /** Swimming pool shell, lining and finishes, per m² of water surface */
    poolPerM2: Range;
    poolDeckPerM2: Range;
    /** Pump, filtration and controls */
    poolEquipmentEach: Range;
    /** Carport structure (posts, beams, roof/shade) per m² covered */
    carportPerM2: Range;
    /** Tank rates where they differ from a tank on a stand (`waterTankEach`) */
    waterTankByType?: Partial<Record<Exclude<TankPlacement, "stand">, Range>>;
    /** Perforated window screens, per m² of screen (falls back to the hood rate per metre) */
    screenPerM2?: Range;
  };
  /** Installation labour for finishes, as a fraction of finish material cost */
  finishesLabourFactor: number;
  /** Preliminaries & site overheads, fraction of construction subtotal */
  preliminariesFactor: number;
  /** Design contingency, fraction of construction subtotal */
  contingencyFactor: number;
}

export interface RegulatoryReference {
  name: string;
  scope: string;
  /** We never claim compliance; references are pointers for the professional. */
  verified: false;
}

/**
 * How homes are typically put together here, beyond the building shell.
 * Each element carries a plain-language reason that is shown to the user.
 */
export interface ArchitecturalContext {
  plinth: { height: Mm; why: string };
  boundary: { front: BoundaryKind; sides: BoundaryKind; height: Mm; frontHeight: Mm; why: string };
  gate: { vehicleWidth: Mm; pedestrian: boolean } | null;
  /**
   * Window shading. `form` is how it is built: projecting surrounds (hood + fins), a plain overhang,
   * or a perforated screen in front of the glass. `formByStyle` overrides it for particular styles.
   */
  shading: { depth: Mm; why: string; form: ShadingForm; formByStyle?: Partial<Record<string, ShadingForm>> };
  porch: { depth: Mm; columns: boolean };
  balconies: { depth: Mm; balustrade: "glass" | "metal" | "masonry"; why: string } | null;
  /** `tank` = where a water tank goes when there is one: raised stand, on the roof (behind the parapet) or underground */
  services: { acUnits: boolean; waterTank: boolean; generatorHouse: boolean; tank: TankPlacement; why: string };
  compound: { paving: "driveway" | "front_yard"; drains: boolean; trees: "palms" | "shade" | "ornamental" | "none"; lighting: boolean; why: string };
  /** Roof form by style where the region has a clear convention; falls back to the style's own preference */
  roofByStyle: Partial<Record<string, { type: RoofType; pitchDeg: number; why: string }>>;
  /** Typical standard-tier materials in this market, by category */
  typicalMaterials: Partial<Record<MaterialCategory, string>>;
  materialsWhy: string;
  /** Covered parking over the open parking bays */
  carport: { typical: boolean; why: string };
  /** Rooms this market expects beyond bedrooms/bathrooms (suggested in the brief; the user decides) */
  program: { majlis: boolean; staffRooms: number; staffRoomNames: string[]; why: string };
  /** Rendering character of the place (planting palette etc.) */
  visual: { planting: "tropical" | "temperate" | "arid" };
}

export type { ShadingForm, TankPlacement } from "@/domain/model/types";

export interface Region {
  id: string;
  country: string;
  countryCode: string; // ISO 3166-1 alpha-2
  subdivision: string; // state / province / region
  city: string;
  currency: string; // ISO 4217
  measurementSystem: MeasurementSystem;
  locale: string; // for number / currency formatting
  climate: {
    zone: string;
    summary: string;
    designHints: string[];
  };
  constructionPractice: {
    structure: string;
    walls: string;
    roof: string;
    typicalRoof: RoofType;
    exteriorWallThickness: Mm;
    interiorWallThickness: Mm;
  };
  planning: {
    /** Indicative only; must be confirmed with the local authority. */
    defaultSetbacks: { front: Mm; rear: Mm; left: Mm; right: Mm };
    maxSiteCoverage: number;
  };
  architecturalPatterns: string[];
  architecture: ArchitecturalContext;
  regulatoryReferences: RegulatoryReference[];
  rates: RegionCostRates;
  dataStatus: DataStatus;
  dataNote: string;
  /** ISO date the dataset was compiled */
  dataAsOf: string;
}
