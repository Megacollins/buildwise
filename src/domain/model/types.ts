/**
 * The Buildwise Building Model.
 *
 * This is the single source of truth for a design. The 2D drawings, the 3D
 * scene, the quantity take-off and the cost estimate are all *derived* from
 * this structure — never stored separately.
 *
 * Design notes
 * ------------
 * - All lengths are integer millimetres, in a local project coordinate system:
 *     x → along the street frontage (left → right when facing the plot from the street)
 *     y → from the street (front boundary, y = 0) towards the rear boundary
 *     z → up (elevation)
 * - A level's editable intent lives in `layout` (a parametric row/bay grid).
 *   `rooms`, `walls`, `doors`, `windows` and `stairs` are regenerated from it by
 *   `rebuildLevel()`. Moving a wall = changing a layout dimension, after which
 *   every derived element (areas, dimensions, 3D, quantities, cost) follows.
 * - The model is versioned by `schemaVersion` so stored documents can be migrated.
 */
import type { Mm } from "@/domain/units";

export const MODEL_SCHEMA_VERSION = 3 as const;

export type RoomType =
  | "living" | "dining" | "kitchen" | "bedroom" | "master_bedroom" | "bathroom" | "wc"
  | "hall" | "stair" | "office" | "laundry" | "storage" | "garage" | "family" | "guest_bedroom"
  /** Formal reception room for guests, near the entrance (Gulf villas) */
  | "majlis"
  /** Household staff bedroom (maid's / driver's room), usually with its own bathroom */
  | "staff";

export type RoofType = "flat" | "gable" | "hip";

export interface Point { x: Mm; y: Mm }

export interface Setbacks { front: Mm; rear: Mm; left: Mm; right: Mm }

export interface Site {
  plot: { width: Mm; depth: Mm };
  setbacks: Setbacks;
  /** Clockwise angle from project +y (towards rear) to true north, degrees. */
  northAngleDeg: number;
  /** Position of the building footprint's front-left corner on the plot. */
  footprintOrigin: Point;
  parking: { spaces: number; covered: boolean };
  driveway: { x: Mm; y: Mm; width: Mm; depth: Mm } | null;
}

/** A room slot in a layout row. `width` is centreline-to-centreline. */
export interface LayoutBay { id: string; type: RoomType; name: string; width: Mm }
/** A full-width band of the footprint. `depth` is centreline-to-centreline. */
export interface LayoutRow { id: string; kind: "rooms" | "circulation"; depth: Mm; bays: LayoutBay[] }
export interface LevelLayout { rows: LayoutRow[] }

export interface Room {
  id: string; // equals the bay id
  levelId: string;
  type: RoomType;
  name: string;
  /** Centreline rectangle */
  x: Mm; y: Mm; width: Mm; depth: Mm;
  /** Clear internal dimensions (centreline minus half wall thicknesses) */
  clearWidth: Mm; clearDepth: Mm;
  /** Net floor area, m² */
  area: number;
}

export interface Wall {
  id: string;
  levelId: string;
  a: Point; b: Point;
  thickness: Mm;
  height: Mm;
  exterior: boolean;
  /** Room ids on each side (0-2) */
  rooms: string[];
}

export interface Door {
  id: string;
  tag: string; // D01…
  wallId: string;
  /** Distance from wall.a to the near jamb */
  offset: Mm;
  width: Mm;
  height: Mm;
  kind: "entrance" | "internal" | "garage";
  /** Room the door swings into */
  swingInto: string | null;
  connects: [string | null, string | null];
}

export interface Window {
  id: string;
  tag: string; // W01…
  wallId: string;
  offset: Mm;
  width: Mm;
  height: Mm;
  sill: Mm;
  roomId: string;
  /** Full-height glazed door onto a balcony or terrace (sill 0) */
  balconyDoor?: boolean;
  /** The door opens onto a terrace (the roof of the floor below) rather than a balcony */
  terrace?: boolean;
}

export interface Stair {
  id: string;
  roomId: string;
  kind: "u_shaped";
  x: Mm; y: Mm; width: Mm; depth: Mm;
  flightWidth: Mm;
  risers: number;
  riserHeight: Mm;
  tread: Mm;
  /** Up direction of the first flight in +y or -y */
  firstFlightDir: 1 | -1;
}

export interface Level {
  id: string;
  index: number;
  name: string;
  elevation: Mm;
  /** Floor-to-floor height */
  height: Mm;
  ceilingHeight: Mm;
  layout: LevelLayout;
  rooms: Room[];
  walls: Wall[];
  doors: Door[];
  windows: Window[];
  stairs: Stair[];
}

export interface Roof {
  type: RoofType;
  pitchDeg: number;
  overhang: Mm;
  /** Parapet height for flat roofs */
  parapet: Mm;
}

/** Selected material id per category. Materials live in the regional catalog, not in the model. */
export type MaterialCategory =
  | "flooring" | "wall_paint" | "roofing" | "windows" | "doors" | "countertops" | "cabinets"
  | "bathroom_fixtures" | "lighting" | "ceiling" | "exterior_finish" | "accent_finish" | "driveway" | "landscaping";

export const MATERIAL_CATEGORIES: MaterialCategory[] = [
  "flooring", "wall_paint", "exterior_finish", "accent_finish", "roofing", "windows", "doors", "ceiling",
  "lighting", "cabinets", "countertops", "bathroom_fixtures", "driveway", "landscaping",
];

export interface DesignParameters {
  /** Target window-to-wall ratio multiplier for habitable rooms (1 = baseline). */
  glazingFactor: number;
  wallThickness: { exterior: Mm; interior: Mm };
  slabThickness: Mm;
  hallDepth: Mm;
}

export type MassingKind = "simple" | "projecting_bay" | "l_shape";
export interface MassingGroup {
  x0: Mm; x1: Mm;
  /** Ground-floor projection forward of the main facade (negative = set back behind it) */
  depth: Mm;
  /** Upper floors' projection, by floor (index 0 = first floor). Absent = same as `depth` (full height). */
  upper?: Mm[];
  label: string;
}

export type BoundaryKind = "masonry_wall" | "low_wall" | "fence" | "hedge" | "none";

/**
 * Exterior design intent — editable, and resolved from style × region when a
 * concept is generated. Geometry is derived from it by rebuildModel().
 */
export interface ExteriorIntent {
  /** Finished ground-floor level above finished ground */
  plinth: Mm;
  porch: { depth: Mm; columns: boolean } | null;
  /** Rooms whose front/rear exterior wall gets a balcony */
  balconyRoomIds: string[];
  balconyDepth: Mm;
  balustrade: "glass" | "metal" | "masonry";
  /** Sun/rain hood depth over windows; 0 = none */
  shadingDepth: Mm;
  boundary: { front: BoundaryKind; sides: BoundaryKind; height: Mm; frontHeight: Mm };
  gate: { vehicleWidth: Mm; pedestrian: boolean } | null;
  /** `tank`: where the water tank goes (default: raised stand) */
  services: { acUnits: boolean; waterTank: boolean; generatorHouse: boolean; tank?: TankPlacement };
  /** How window shading is built (default: surrounds). Depth stays `shadingDepth`. */
  shadingForm?: ShadingForm;
  /** Covered parking over the open parking bays */
  carport?: boolean;
  compound: { paving: "driveway" | "front_yard"; drains: boolean; trees: "palms" | "shade" | "ornamental" | "none"; lighting: boolean };
  /**
   * Facade composition: where the accent (feature) material goes. Derived walls only —
   * the exterior walls of projecting/set-back volumes and/or the entrance wall.
   */
  facade?: { accent: "projections_and_entrance" | "entrance" | "none" };
  /** How the design should be rendered — resolved from style × region, read by the 3D renderer. */
  visual?: {
    planting: "tropical" | "temperate" | "arid";
    /** Window frame profile */
    frame: "slim" | "standard";
    /** Express floor slabs as horizontal bands on the facade */
    floorBands: boolean;
  };
  /** Swimming pool (water surface size); placed in the garden by deriveExterior */
  pool?: { length: Mm; width: Mm } | null;
}

export interface Rect { x: Mm; y: Mm; width: Mm; depth: Mm }

export type ShadingForm = "surround" | "overhang" | "screen";
export type TankPlacement = "stand" | "roof" | "underground";

/**
 * Derived exterior elements.
 * `attached.*` are in building-local coordinates (like rooms); `site.*` are in plot coordinates.
 */
export interface ExteriorGeometry {
  attached: {
    steps: (Rect & { risers: number; riserHeight: Mm; tread: Mm }) | null;
    porch: (Rect & { columns: Point[]; canopyTop: Mm }) | null;
    balconies: (Rect & { id: string; levelId: string; roomId: string; elevation: Mm; side: "front" | "rear" })[];
    /** Hood over a window: footprint rectangle outside the wall, at height z */
    hoods: (Rect & { id: string; windowId: string; levelId: string; z: Mm })[];
    acUnits: (Rect & { id: string; roomId: string; z: Mm; h: Mm })[];
    /** Accessible roofs of a lower floor, at the upper floor's level */
    terraces: (Rect & { id: string; levelId: string; elevation: Mm; balustrade: { a: Point; b: Point }[] })[];
  };
  site: {
    boundary: { id: string; a: Point; b: Point; height: Mm; thickness: Mm; kind: BoundaryKind }[];
    gates: { id: string; kind: "vehicle" | "pedestrian"; a: Point; b: Point; height: Mm }[];
    paving: Rect[];
    paths: Rect[];
    drains: { a: Point; b: Point }[];
    trees: { id: string; x: Mm; y: Mm; radius: Mm; height: Mm; kind: "palm" | "shade" | "ornamental" }[];
    /** `z` = base height above ground (roof tanks); `placement` for water tanks */
    services: (Rect & { id: string; kind: "water_tank" | "generator_house"; h: Mm; z?: Mm; placement?: TankPlacement })[];
    lights: { id: string; x: Mm; y: Mm; z: Mm; kind: "porch" | "gate" | "perimeter" }[];
    pool: { water: Rect; deck: Rect; equipment: Rect } | null;
    /** Planting beds along free boundary edges, with shrub positions */
    planting: { beds: Rect[]; shrubs: { x: Mm; y: Mm; r: Mm }[] };
    /** Marked parking bays in the front yard (open parking only) */
    parkingBays: Rect[];
    /** Carport over the parking bays: roof rectangle, underside height and post positions (plot coordinates) */
    carports?: (Rect & { id: string; height: Mm; posts: Point[] })[];
  };
}

export interface BuildingModel {
  schemaVersion: typeof MODEL_SCHEMA_VERSION;
  units: "mm";
  meta: { conceptName: string; style: string; strategy: string };
  site: Site;
  footprint: { width: Mm; depth: Mm };
  params: DesignParameters;
  levels: Level[];
  roof: Roof;
  selections: Partial<Record<MaterialCategory, string>>;
  exterior: ExteriorIntent;
  exteriorGeometry: ExteriorGeometry;
  /**
   * Front massing. The front of the house is split into groups whose edges line
   * up on every floor; each group can project forward (`depth` > 0) as a
   * full-height volume — a projecting bay, or the wing of an L-shape.
   * Front-row rooms take the depth of the group containing their centre.
   * Absent or all-zero = simple rectangular massing.
   */
  massing?: { kind: MassingKind; groups: MassingGroup[] };
  /** Why the design looks the way it does for this style and region (plain language). */
  designNotes: string[];
  /** Honest warnings produced when the model was (re)built, e.g. undersized rooms. */
  warnings: string[];
}

export const HABITABLE: RoomType[] = [
  "living", "dining", "kitchen", "bedroom", "master_bedroom", "guest_bedroom", "office", "family", "majlis", "staff",
];
export const WET: RoomType[] = ["bathroom", "wc", "laundry", "kitchen"];
export const BEDROOM_TYPES: RoomType[] = ["bedroom", "master_bedroom", "guest_bedroom"];
export const BATH_TYPES: RoomType[] = ["bathroom", "wc"];
