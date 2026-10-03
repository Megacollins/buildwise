/**
 * SAMPLE material catalog. Supply prices only (installation labour is applied
 * by the cost engine from regional rates). All prices are indicative
 * placeholders — see `src/data/regions.ts`.
 */
import type { MaterialCategory } from "@/domain/model/types";
import type { Material, PricingUnit, QualityTier, TextureKind } from "@/domain/materials/types";
import type { Range } from "@/domain/regions/types";

type RegionKey = "ng" | "us" | "gb" | "ae";
/** Abuja uses the Lagos sample prices until an Abuja dataset exists (stated in its region note). */
const REGION_IDS: Record<RegionKey, string[]> = {
  ng: ["ng-la-lagos", "ng-fc-abuja"], us: ["us-tx-austin"], gb: ["gb-eng-london"], ae: ["ae-du-dubai"],
};

type Row = [
  id: string, tier: QualityTier, name: string, description: string, color: string,
  prices: Record<RegionKey, Range>,
  opts?: { availability?: Partial<Record<RegionKey, "common" | "limited" | "import">>; env?: string; roughness?: number },
];

const UNITS: Record<MaterialCategory, PricingUnit> = {
  flooring: "m2", wall_paint: "m2", exterior_finish: "m2", accent_finish: "m2", roofing: "m2", windows: "m2",
  doors: "each", ceiling: "m2", lighting: "point", cabinets: "lm", countertops: "lm",
  bathroom_fixtures: "set", driveway: "m2", landscaping: "m2",
};

const CATALOG: Record<MaterialCategory, Row[]> = {
  flooring: [
    ["floor-ceramic", "basic", "Ceramic tile 400×400", "Glazed ceramic floor tile, matt finish.", "#cfc6b8", { ng: [7000, 10000], us: [25, 40], gb: [22, 35], ae: [45, 70] }],
    ["floor-porcelain", "standard", "Porcelain tile 600×600", "Rectified porcelain, low water absorption, hard-wearing.", "#d9d4cc", { ng: [14000, 20000], us: [45, 70], gb: [40, 65], ae: [90, 140] }],
    ["floor-oak", "premium", "Engineered oak plank", "Engineered oak, 14 mm with 3 mm wear layer, oiled.", "#a67c52", { ng: [28000, 40000], us: [90, 140], gb: [80, 130], ae: [180, 280] }, { availability: { ng: "import", ae: "import" }, env: "FSC-certified timber available", roughness: 0.6 }],
    ["floor-marble", "luxury", "Natural marble slab", "Polished natural marble, 20 mm, book-matched in living areas.", "#ece8e1", { ng: [70000, 110000], us: [200, 320], gb: [180, 300], ae: [450, 750] }, { availability: { ng: "import" }, roughness: 0.15 }],
  ],
  wall_paint: [
    ["paint-emulsion", "basic", "Vinyl emulsion", "Standard matt emulsion, two coats over primer.", "#f1eee8", { ng: [900, 1300], us: [4, 6], gb: [3.5, 5.5], ae: [8, 12] }],
    ["paint-washable", "standard", "Washable acrylic", "Scrubbable low-sheen acrylic, two coats.", "#eeeae2", { ng: [1600, 2300], us: [6, 9], gb: [5.5, 8], ae: [12, 18] }, { env: "Low-VOC formulation" }],
    ["paint-premium", "premium", "Premium low-VOC paint", "Premium mineral-rich, stain-resistant finish.", "#e7e2d8", { ng: [3000, 4200], us: [10, 14], gb: [9, 13], ae: [22, 32] }, { env: "Low-VOC, eco-label" }],
    ["paint-limewash", "luxury", "Limewash / decorative plaster", "Hand-applied lime-based decorative finish.", "#ddd3c3", { ng: [6000, 9000], us: [18, 26], gb: [16, 24], ae: [40, 60] }, { availability: { ng: "limited" }, env: "Breathable, mineral-based" }],
  ],
  exterior_finish: [
    ["ext-render-paint", "basic", "Sand-cement render + paint", "Rendered block with exterior masonry paint.", "#e4dfd6", { ng: [5000, 7500], us: [45, 70], gb: [45, 65], ae: [60, 90] }],
    ["ext-textured", "standard", "Textured exterior coating", "Weather-resistant textured coating on render.", "#d8d2c6", { ng: [8000, 12000], us: [75, 110], gb: [85, 120], ae: [110, 160] }],
    ["ext-timber", "premium", "Timber / fibre-cement cladding", "Rainscreen cladding boards on battens.", "#8a6a4d", { ng: [25000, 38000], us: [140, 200], gb: [110, 160], ae: [280, 400] }, { availability: { ng: "limited", ae: "import" } }],
    ["ext-brick", "standard", "Facing brick", "Clay facing brick outer leaf, natural mortar.", "#9b5a43", { ng: [22000, 32000], us: [110, 160], gb: [90, 130], ae: [150, 220] }, { availability: { ng: "limited", ae: "limited" } }],
    ["ext-stone", "luxury", "Natural stone cladding", "Split-face natural stone on mechanical fixings.", "#b9ae9c", { ng: [60000, 90000], us: [260, 380], gb: [220, 330], ae: [600, 900] }],
  ],
  accent_finish: [
    ["acc-render-dark", "basic", "Contrast render (charcoal)", "Dark through-coloured render on feature walls.", "#4a4c4f", { ng: [6000, 9000], us: [50, 75], gb: [50, 72], ae: [70, 100] }],
    ["acc-wood-composite", "standard", "Wood-look composite panels", "Weather-resistant composite cladding with a timber finish; low maintenance in humid climates.", "#8a6446", { ng: [28000, 40000], us: [120, 180], gb: [110, 160], ae: [260, 380] }, { env: "Recycled-content options" }],
    ["acc-stone", "premium", "Natural stone cladding", "Sawn natural stone on mechanical fixings.", "#b9ae9c", { ng: [45000, 65000], us: [200, 300], gb: [180, 260], ae: [450, 650] }],
    ["acc-porcelain", "luxury", "Large-format porcelain facade", "Ventilated large-format porcelain panels.", "#d6d2cc", { ng: [80000, 120000], us: [300, 450], gb: [280, 420], ae: [700, 1000] }, { availability: { ng: "import" } }],
  ],
  roofing: [
    ["roof-longspan", "basic", "Long-span metal sheet", "Pre-painted aluminium / steel profile sheets.", "#6d7378", { ng: [6000, 8500], us: [18, 26], gb: [30, 45], ae: [70, 100] }],
    ["roof-stonecoated", "standard", "Stone-coated steel tiles", "Stone-chip coated steel roof tiles, low noise in rain.", "#4a4d50", { ng: [11000, 15000], us: [28, 40], gb: [55, 80], ae: [110, 160] }, { availability: { us: "limited", gb: "limited" } }],
    ["roof-concrete-tile", "standard", "Concrete roof tiles", "Interlocking concrete roof tiles.", "#5b4f49", { ng: [9000, 13000], us: [30, 45], gb: [35, 55], ae: [100, 150] }],
    ["roof-shingle", "standard", "Architectural shingles", "Laminated asphalt shingles.", "#3f4144", { ng: [12000, 18000], us: [28, 40], gb: [40, 60], ae: [120, 170] }, { availability: { ng: "import", ae: "import" } }],
    ["roof-standingseam", "premium", "Standing-seam metal", "Concealed-fix standing-seam roof, 50-year life.", "#3b3f42", { ng: [18000, 25000], us: [75, 110], gb: [90, 130], ae: [180, 260] }, { env: "Recyclable, cool-roof colours available" }],
    ["roof-clay", "luxury", "Clay tiles", "Fired clay interlocking tiles.", "#9c5b3f", { ng: [30000, 45000], us: [130, 190], gb: [160, 240], ae: [320, 480] }, { availability: { ng: "import" } }],
  ],
  windows: [
    ["win-alu-sliding", "basic", "Aluminium sliding, single glazed", "Standard sliding aluminium frame, clear glass.", "#9aa3a8", { ng: [45000, 65000], us: [350, 500], gb: [380, 520], ae: [900, 1300] }],
    ["win-casement", "standard", "Casement, double glazed", "Aluminium or uPVC casement, double glazed, insect screens.", "#8b949a", { ng: [75000, 100000], us: [550, 800], gb: [550, 780], ae: [1500, 2100] }],
    ["win-thermal", "premium", "Thermally broken, low-E", "Thermally broken aluminium, low-E double glazing.", "#5e676d", { ng: [140000, 190000], us: [900, 1300], gb: [900, 1300], ae: [2500, 3500] }, { availability: { ng: "import" }, env: "Reduces cooling/heating load" }],
    ["win-slimline", "luxury", "Slimline minimal frame", "Minimal-frame large-format glazing, triple seals.", "#2f3437", { ng: [260000, 360000], us: [1600, 2400], gb: [1600, 2300], ae: [4500, 6500] }, { availability: { ng: "import" } }],
  ],
  doors: [
    ["door-flush", "basic", "Flush door", "Hollow-core flush door with frame and ironmongery.", "#c9b79c", { ng: [45000, 70000], us: [180, 300], gb: [120, 200], ae: [900, 1500] }],
    ["door-panel", "standard", "Moulded panel door", "Solid-core moulded panel door, painted.", "#e8e3da", { ng: [90000, 140000], us: [350, 550], gb: [250, 400], ae: [1800, 2800] }],
    ["door-hardwood", "premium", "Solid hardwood door", "Solid hardwood door with quality hardware.", "#7a5537", { ng: [220000, 320000], us: [800, 1300], gb: [550, 900], ae: [4000, 6500] }],
    ["door-pivot", "luxury", "Full-height designer door", "Full-height flush-to-wall door, concealed hinges.", "#3c3a37", { ng: [450000, 700000], us: [1800, 3000], gb: [1400, 2400], ae: [9000, 15000] }, { availability: { ng: "import" } }],
  ],
  ceiling: [
    ["ceil-pvc", "basic", "PVC panel ceiling", "PVC strip ceiling on timber battens.", "#f4f3f0", { ng: [3500, 5000], us: [18, 26], gb: [20, 30], ae: [45, 65] }, { availability: { us: "limited", gb: "limited" } }],
    ["ceil-plaster", "standard", "Plaster / drywall ceiling", "Skimmed plasterboard or POP ceiling, painted.", "#f7f6f3", { ng: [6000, 9000], us: [28, 40], gb: [30, 44], ae: [70, 100] }],
    ["ceil-gypsum-cove", "premium", "Gypsum with cove lighting", "Dropped gypsum ceiling with perimeter cove details.", "#faf9f6", { ng: [12000, 17000], us: [45, 65], gb: [50, 75], ae: [120, 180] }],
    ["ceil-timber", "luxury", "Timber slat acoustic ceiling", "Timber slat ceiling with acoustic backing.", "#b48a5e", { ng: [25000, 38000], us: [90, 140], gb: [100, 150], ae: [250, 380] }],
  ],
  lighting: [
    ["light-basic", "basic", "Standard fittings", "Basic LED bulbs and fittings.", "#fff6e0", { ng: [6000, 10000], us: [40, 80], gb: [35, 70], ae: [100, 180] }],
    ["light-downlight", "standard", "LED downlights", "Recessed LED downlights, warm white.", "#fff1d0", { ng: [15000, 24000], us: [120, 200], gb: [90, 160], ae: [250, 420] }, { env: "Energy-efficient LED" }],
    ["light-architectural", "premium", "Architectural lighting", "Dimmable downlights, feature pendants.", "#ffe9bd", { ng: [35000, 55000], us: [280, 450], gb: [220, 380], ae: [600, 950] }],
    ["light-smart", "luxury", "Smart lighting system", "Scene-controlled smart lighting with designer fittings.", "#ffe2a8", { ng: [90000, 150000], us: [700, 1200], gb: [600, 1000], ae: [1500, 2600] }],
  ],
  cabinets: [
    ["cab-mdf", "basic", "MDF kitchen units", "Melamine-faced MDF base and wall units.", "#e9e5dd", { ng: [120000, 180000], us: [450, 700], gb: [400, 650], ae: [1500, 2300] }],
    ["cab-lacquer", "standard", "Lacquered kitchen units", "Lacquered doors, soft-close hardware.", "#dcd7cd", { ng: [250000, 350000], us: [900, 1400], gb: [800, 1300], ae: [3000, 4500] }],
    ["cab-veneer", "premium", "Timber veneer kitchen", "Timber-veneer fronts, integrated appliances housing.", "#8f6a47", { ng: [480000, 680000], us: [1800, 2800], gb: [1700, 2600], ae: [6000, 9000] }],
    ["cab-bespoke", "luxury", "Bespoke joinery kitchen", "Fully bespoke joinery with premium hardware.", "#2e3a38", { ng: [900000, 1400000], us: [3500, 5500], gb: [3500, 5500], ae: [12000, 19000] }, { availability: { ng: "limited" } }],
  ],
  countertops: [
    ["top-laminate", "basic", "Laminate worktop", "High-pressure laminate worktop.", "#cfcac2", { ng: [30000, 50000], us: [120, 200], gb: [100, 170], ae: [350, 550] }],
    ["top-granite", "standard", "Granite worktop", "20 mm polished granite.", "#3d3b39", { ng: [90000, 130000], us: [350, 550], gb: [300, 480], ae: [900, 1400] }],
    ["top-quartz", "premium", "Engineered quartz", "Engineered quartz, 30 mm.", "#f0eeea", { ng: [180000, 260000], us: [650, 950], gb: [550, 850], ae: [1800, 2700] }, { availability: { ng: "import" } }],
    ["top-marble", "luxury", "Marble worktop", "Honed natural marble, 30 mm.", "#efebe4", { ng: [350000, 520000], us: [1200, 1900], gb: [1000, 1700], ae: [3500, 5500] }, { availability: { ng: "import" } }],
  ],
  bathroom_fixtures: [
    ["bath-basic", "basic", "Basic sanitaryware set", "WC, basin, shower mixer and tray.", "#f5f5f3", { ng: [180000, 280000], us: [900, 1500], gb: [800, 1300], ae: [3000, 4800] }],
    ["bath-standard", "standard", "Standard bathroom set", "Close-coupled WC, vanity basin, thermostatic shower.", "#f2f2ef", { ng: [400000, 600000], us: [2200, 3500], gb: [2000, 3200], ae: [7000, 11000] }, { env: "Dual-flush WC, low-flow taps" }],
    ["bath-premium", "premium", "Premium bathroom set", "Wall-hung WC, stone vanity, rainfall shower.", "#eeeeea", { ng: [900000, 1300000], us: [5000, 8000], gb: [4500, 7500], ae: [16000, 26000] }],
    ["bath-luxury", "luxury", "Luxury spa set", "Freestanding bath, designer fittings, heated towel rail.", "#e9e9e4", { ng: [2000000, 3200000], us: [12000, 20000], gb: [11000, 18000], ae: [40000, 65000] }, { availability: { ng: "import" } }],
  ],
  driveway: [
    ["drive-gravel", "basic", "Compacted gravel", "Compacted hardcore with gravel topping.", "#a39d92", { ng: [3000, 5000], us: [35, 55], gb: [40, 60], ae: [80, 120] }, { env: "Permeable surface" }],
    ["drive-interlock", "standard", "Interlocking pavers", "Concrete interlocking paving blocks.", "#8d8a85", { ng: [9000, 13000], us: [70, 100], gb: [80, 115], ae: [160, 230] }],
    ["drive-stamped", "premium", "Stamped / resin-bound", "Stamped concrete or resin-bound aggregate.", "#76726c", { ng: [18000, 26000], us: [120, 170], gb: [130, 180], ae: [280, 400] }],
    ["drive-stone", "luxury", "Natural stone setts", "Natural granite setts on concrete bed.", "#5f5c58", { ng: [40000, 60000], us: [220, 320], gb: [240, 350], ae: [550, 800] }],
  ],
  landscaping: [
    ["land-grass", "basic", "Grass & basic planting", "Seeded lawn with edge planting.", "#6f8f55", { ng: [1500, 2500], us: [8, 15], gb: [10, 18], ae: [35, 60] }],
    ["land-garden", "standard", "Planted garden", "Turf, shrubs, trees and simple paths.", "#5d8048", { ng: [4000, 6000], us: [20, 35], gb: [25, 40], ae: [80, 130] }, { env: "Native planting reduces irrigation" }],
    ["land-gravel", "standard", "Gravel & desert planting", "Gravel / decomposed-granite beds, drought-tolerant planting, drip irrigation.", "#cdb994", { ng: [3000, 5000], us: [18, 30], gb: [22, 38], ae: [60, 110] }, { env: "Low water use" }],
    ["land-designed", "premium", "Designed landscape", "Designed planting, lighting, irrigation.", "#4f7240", { ng: [9000, 14000], us: [45, 70], gb: [55, 85], ae: [180, 280] }],
    ["land-luxury", "luxury", "Premium landscape & terrace", "Hardscaped terraces, water feature, mature trees.", "#3f6134", { ng: [20000, 32000], us: [100, 160], gb: [120, 190], ae: [400, 650] }],
  ],
};

export const MATERIALS: Material[] = (Object.keys(CATALOG) as MaterialCategory[]).flatMap((category) =>
  CATALOG[category].map(([id, tier, name, description, color, prices, opts]) => ({
    id, category, tier, name, description, color,
    roughness: opts?.roughness,
    unit: UNITS[category],
    supplier: null,
    environmental: opts?.env ?? null,
    texture: textureFor(id),
    prices: (Object.keys(prices) as RegionKey[]).flatMap((k) => REGION_IDS[k].map((regionId) => ({
      regionId,
      price: prices[k],
      availability: opts?.availability?.[k] ?? "common",
      dataStatus: "sample" as const,
    }))),
  })),
);

function textureFor(id: string): TextureKind {
  const rules: [RegExp, TextureKind][] = [
    [/brick/, "brick"], [/marble/, "marble"], [/stone-?coated|stonecoated/, "stone_coated"], [/ext-stone|drive-stone|top-granite|top-quartz/, "stone"],
    [/oak|timber|hardwood|veneer|pivot|panel|flush|wood/, "wood"], [/acc-stone/, "stone"], [/ceramic|porcelain|clay|concrete-tile/, "tile"],
    [/longspan|standingseam/, "metal_sheet"], [/shingle/, "shingle"], [/interlock/, "paving"], [/gravel/, "gravel"],
    [/stamped/, "concrete"], [/^land-/, "grass"], [/render|textured|paint|limewash|emulsion|washable/, "render"],
  ];
  return rules.find(([re]) => re.test(id))?.[1] ?? "plain";
}

/** Default selection for a given tier (falls back to standard). */
export function defaultSelections(tier: QualityTier = "standard"): Partial<Record<MaterialCategory, string>> {
  const out: Partial<Record<MaterialCategory, string>> = {};
  for (const category of Object.keys(CATALOG) as MaterialCategory[]) {
    const row = CATALOG[category].find((r) => r[1] === tier) ?? CATALOG[category].find((r) => r[1] === "standard")!;
    out[category] = row[0];
  }
  return out;
}
