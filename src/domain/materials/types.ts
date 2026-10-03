import type { MaterialCategory } from "@/domain/model/types";
import type { DataStatus, Range } from "@/domain/regions/types";

export type QualityTier = "basic" | "standard" | "premium" | "luxury";
export const TIERS: QualityTier[] = ["basic", "standard", "premium", "luxury"];

/** Unit a material is priced in. The cost engine maps each category to a model quantity. */
export type PricingUnit = "m2" | "each" | "lm" | "set" | "point";

export interface MaterialPrice {
  regionId: string;
  /** Supply price range, region currency, per `unit` */
  price: Range;
  availability: "common" | "limited" | "import" | "unavailable";
  dataStatus: DataStatus;
}

/** Surface pattern used by the 3D renderer (procedural; no external images). */
export type TextureKind =
  | "plain" | "render" | "brick" | "wood" | "stone" | "tile" | "metal_sheet" | "stone_coated" | "shingle"
  | "paving" | "gravel" | "concrete" | "grass" | "marble";

export interface Material {
  id: string;
  category: MaterialCategory;
  name: string;
  description: string;
  tier: QualityTier;
  unit: PricingUnit;
  /** Display swatch colour (hex) — also drives the 3D preview */
  color: string;
  /** Optional surface roughness hint for 3D */
  roughness?: number;
  texture: TextureKind;
  supplier: string | null;
  environmental: string | null;
  prices: MaterialPrice[];
}

/** Catalog as seen by a single region (the only shape the cost engine needs). */
export interface RegionalMaterial extends Omit<Material, "prices"> {
  price: MaterialPrice | null;
}
