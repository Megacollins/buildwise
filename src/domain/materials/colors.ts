import type { BuildingModel } from "@/domain/model/types";
import type { TextureKind } from "@/domain/materials/types";

export interface MaterialLook { color: string; texture: TextureKind }
export type MaterialLooks = Record<string, MaterialLook>;

/** Colour and surface pattern of each selected material (drives the 3D view). */
export function selectionLooks(model: BuildingModel, catalog: { id: string; color: string; texture?: TextureKind }[]): MaterialLooks {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const out: MaterialLooks = {};
  for (const [category, id] of Object.entries(model.selections)) {
    const m = id ? byId.get(id) : undefined;
    if (m) out[category] = { color: m.color, texture: m.texture ?? "plain" };
  }
  return out;
}

/** @deprecated use selectionLooks */
export const selectionColors = selectionLooks;
