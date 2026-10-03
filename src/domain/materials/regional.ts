import type { Material, RegionalMaterial } from "./types";

/** Project the global catalog onto a single region. */
export function toRegionalCatalog(materials: Material[], regionId: string): RegionalMaterial[] {
  return materials.map(({ prices, ...m }) => ({
    ...m,
    price: prices.find((p) => p.regionId === regionId && p.availability !== "unavailable") ?? null,
  }));
}
