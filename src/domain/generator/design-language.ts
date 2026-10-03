/**
 * Design language = architectural style × regional context.
 *
 * Style says what the client wants the house to feel like; the region says how
 * houses are actually built and lived in there. The two are resolved separately
 * and combined, so "Modern in Lagos", "Modern in Abuja" and "Modern in London"
 * produce genuinely different buildings — with the reasons recorded.
 */
import type { BuildingModel, ExteriorIntent, Level, MaterialCategory, RoofType } from "@/domain/model/types";
import { BEDROOM_TYPES } from "@/domain/model/types";
import type { Region } from "@/domain/regions/types";
import type { Mm } from "@/domain/units";

export type BalconyPolicy = "none" | "master" | "front_bedrooms";

export interface StyleProfile {
  label: string;
  roof: { type: RoofType; pitchDeg: number };
  /** Multiplier on window size */
  glazing: number;
  balconies: BalconyPolicy;
  balustrade: ExteriorIntent["balustrade"] | null;
  /** Extra shading depth this style adds (e.g. tropical deep eaves) */
  extraShading: Mm;
  /** Pitched-roof overhang */
  overhang: Mm;
  materials: Partial<Record<MaterialCategory, string>>;
  /** Where the feature material goes */
  accent: "projections_and_entrance" | "entrance" | "none";
  /** Slim, minimal window frames suit modern styles; standard frames suit traditional ones */
  frame?: "slim" | "standard";
  why: string;
}

export const STYLE_PROFILES: Record<string, StyleProfile> = {
  modern: { label: "Modern", accent: "projections_and_entrance", roof: { type: "flat", pitchDeg: 0 }, glazing: 1.15, balconies: "front_bedrooms", balustrade: "glass", extraShading: 0, overhang: 300, materials: {}, why: "Clean lines, larger glazing and usable balconies." },
  contemporary: { label: "Contemporary", accent: "projections_and_entrance", roof: { type: "flat", pitchDeg: 0 }, glazing: 1.1, balconies: "master", balustrade: "glass", extraShading: 0, overhang: 300, materials: {}, why: "Simple massing with generous glazing." },
  minimalist: { label: "Minimalist", accent: "entrance", roof: { type: "flat", pitchDeg: 0 }, glazing: 1.0, balconies: "master", balustrade: "glass", extraShading: 0, overhang: 300, materials: {}, why: "Few, deliberate openings and a quiet roofline." },
  traditional: { label: "Traditional", accent: "none", roof: { type: "hip", pitchDeg: 25 }, glazing: 0.9, balconies: "none", balustrade: "masonry", extraShading: 0, overhang: 600, materials: {}, why: "Familiar pitched roof, punched windows and a covered entrance." },
  mediterranean: { label: "Mediterranean", accent: "none", roof: { type: "hip", pitchDeg: 22 }, glazing: 0.95, balconies: "front_bedrooms", balustrade: "masonry", extraShading: 0, overhang: 450, materials: { roofing: "roof-clay" }, why: "Tiled roofs, balconies and solid balustrades." },
  scandinavian: { label: "Scandinavian", accent: "entrance", roof: { type: "gable", pitchDeg: 35 }, glazing: 1.1, balconies: "none", balustrade: null, extraShading: 0, overhang: 300, materials: { exterior_finish: "ext-timber" }, why: "Simple gables, timber cladding and bright interiors." },
  tropical: { label: "Tropical", accent: "entrance", roof: { type: "hip", pitchDeg: 27 }, glazing: 1.1, balconies: "front_bedrooms", balustrade: "metal", extraShading: 200, overhang: 900, materials: { exterior_finish: "ext-timber" }, why: "Deep eaves, shaded openings and outdoor living." },
  industrial: { label: "Industrial", accent: "projections_and_entrance", roof: { type: "flat", pitchDeg: 0 }, glazing: 1.15, balconies: "master", balustrade: "metal", extraShading: 0, overhang: 300, materials: { exterior_finish: "ext-brick" }, why: "Brick, metal and large steel-framed windows." },
  luxury: { label: "Luxury", accent: "projections_and_entrance", roof: { type: "flat", pitchDeg: 0 }, glazing: 1.25, balconies: "front_bedrooms", balustrade: "glass", extraShading: 0, overhang: 300, materials: {}, why: "Generous glazing, terraces and premium finishes." },
  regional: { label: "Regional", accent: "none", roof: { type: "hip", pitchDeg: 25 }, glazing: 1.0, balconies: "master", balustrade: null, extraShading: 0, overhang: 600, materials: {}, why: "Follows local building conventions." },
  custom: { label: "Custom", accent: "none", roof: { type: "hip", pitchDeg: 25 }, glazing: 1.0, balconies: "master", balustrade: null, extraShading: 0, overhang: 600, materials: {}, why: "A neutral starting point to customise." },
};

export interface DesignLanguage {
  roof: BuildingModel["roof"];
  glazing: number;
  balconies: BalconyPolicy;
  exterior: Omit<ExteriorIntent, "balconyRoomIds">;
  selections: Partial<Record<MaterialCategory, string>>;
  notes: string[];
}

export function resolveDesignLanguage(style: string, region: Region, tierSelections: Partial<Record<MaterialCategory, string>>, opts: { useTypicalMaterials: boolean }): DesignLanguage {
  const s = STYLE_PROFILES[style] ?? STYLE_PROFILES.custom;
  const a = region.architecture;
  const notes: string[] = [`${s.label}: ${s.why}`];

  // Roof: a regional convention for this style wins over the style's generic preference.
  const regional = a.roofByStyle[style];
  const roofType = regional?.type ?? s.roof.type;
  const pitch = regional?.pitchDeg ?? s.roof.pitchDeg;
  if (regional) notes.push(`Roof: ${regional.why}`);
  const shading = a.shading.depth > 0 ? a.shading.depth + s.extraShading : 0;
  const overhang = roofType === "flat" ? 300 : Math.max(s.overhang, Math.min(900, a.shading.depth + 150));

  // Balconies only where the region uses them and the style wants them.
  const balconies: BalconyPolicy = a.balconies ? s.balconies : "none";
  if (a.balconies && balconies !== "none") notes.push(`Balconies: ${a.balconies.why}`);

  if (a.plinth.height >= 300) notes.push(`Raised ground floor: ${a.plinth.why}`);
  const shadingForm = a.shading.formByStyle?.[style] ?? a.shading.form;
  if (shading > 0) notes.push(`Window shading: ${a.shading.why}${shadingForm === "screen" ? " Built as perforated screens in front of the glass." : ""}`);
  // A roof tank needs a flat roof to stand on behind the parapet; otherwise it goes underground.
  const tank = a.services.tank === "roof" && roofType !== "flat" ? "underground" : a.services.tank;
  if (a.boundary.front !== "none" || a.boundary.sides !== "none") notes.push(`Boundary: ${a.boundary.why}`);
  if (a.services.acUnits || a.services.waterTank || a.services.generatorHouse) notes.push(`Services: ${a.services.why}`);
  notes.push(`Compound: ${a.compound.why}`);

  // Materials: tier defaults → typical local materials (standard tier) → style character.
  const selections = { ...tierSelections };
  if (opts.useTypicalMaterials) {
    Object.assign(selections, a.typicalMaterials);
    notes.push(`Materials: ${a.materialsWhy}`);
  }
  Object.assign(selections, s.materials);

  return {
    roof: { type: roofType, pitchDeg: pitch, overhang, parapet: roofType === "flat" ? 900 : 0 },
    glazing: s.glazing,
    balconies,
    exterior: {
      facade: { accent: s.accent },
      visual: {
        planting: a.visual?.planting ?? "temperate",
        frame: s.frame ?? (["modern", "contemporary", "minimalist", "luxury", "industrial"].includes(style) ? "slim" : "standard"),
        floorBands: s.accent !== "none",
      },
      plinth: a.plinth.height,
      porch: { depth: a.porch.depth, columns: a.porch.columns },
      balconyDepth: a.balconies?.depth ?? 0,
      balustrade: s.balustrade ?? a.balconies?.balustrade ?? "metal",
      shadingDepth: shading,
      boundary: { front: a.boundary.front, sides: a.boundary.sides, height: a.boundary.height, frontHeight: a.boundary.frontHeight },
      gate: a.gate,
      services: { acUnits: a.services.acUnits, waterTank: a.services.waterTank, generatorHouse: a.services.generatorHouse, tank },
      shadingForm,
      compound: { paving: a.compound.paving, drains: a.compound.drains, trees: a.compound.trees, lighting: a.compound.lighting },
    },
    selections,
    notes,
  };
}

/** Which rooms get balconies under a policy: upper-floor rooms on the front (or the master bedroom wherever it is). */
export function pickBalconyRooms(levels: Level[], policy: BalconyPolicy): string[] {
  if (policy === "none") return [];
  return levels.filter((l) => l.index > 0).flatMap((l) => {
    const front = l.layout.rows[0].bays, rear = l.layout.rows[l.layout.rows.length - 1].bays;
    const master = [...front, ...rear].filter((b) => b.type === "master_bedroom").map((b) => b.id);
    if (policy === "master") return master;
    return [...new Set([...master, ...front.filter((b) => BEDROOM_TYPES.includes(b.type) || b.type === "family").map((b) => b.id)])];
  });
}
