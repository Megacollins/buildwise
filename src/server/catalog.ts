import "server-only";
import { cache } from "react";
import { db } from "./db";
import type { Region } from "@/domain/regions/types";
import type { RegionalMaterial } from "@/domain/materials/types";
import type { MaterialCategory } from "@/domain/model/types";

/** Regional data is read from the database so verified datasets can replace sample ones without code changes. */
export const getRegion = cache(async (id: string): Promise<Region | null> => {
  const row = await db.region.findUnique({ where: { id } });
  return row ? (row.data as unknown as Region) : null;
});

export const listRegions = cache(async (): Promise<Region[]> => {
  const rows = await db.region.findMany({ orderBy: [{ country: "asc" }, { city: "asc" }] });
  return rows.map((r) => r.data as unknown as Region);
});

export const getRegionalCatalog = cache(async (regionId: string): Promise<RegionalMaterial[]> => {
  const materials = await db.material.findMany({
    include: { prices: { where: { regionId } } },
    orderBy: [{ category: "asc" }],
  });
  return materials.map(({ prices, ...m }) => {
    const p = prices[0];
    return {
      id: m.id,
      category: m.category as MaterialCategory,
      name: m.name,
      description: m.description,
      tier: m.tier as RegionalMaterial["tier"],
      unit: m.unit as RegionalMaterial["unit"],
      color: m.color,
      roughness: m.roughness ?? undefined,
      texture: (m.texture ?? "plain") as RegionalMaterial["texture"],
      supplier: m.supplier,
      environmental: m.environmental,
      price: p && p.availability !== "unavailable"
        ? {
            regionId,
            price: [Number(p.priceLow), Number(p.priceHigh)] as [number, number],
            availability: p.availability as "common" | "limited" | "import",
            dataStatus: p.dataStatus,
          }
        : null,
    };
  });
});
