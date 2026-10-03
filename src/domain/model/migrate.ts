/**
 * Upgrades stored models to the current schema.
 *
 * v1 → v2 adds the exterior (porch, steps, balconies, shading, boundary, gates,
 * services, compound) resolved from the project's style and region. Rooms, roof
 * and material selections are kept exactly as the user left them. If a regional
 * element doesn't fit the existing layout, it is scaled back rather than
 * producing an inconsistent model.
 *
 * v2 → v3 adds how regional elements are built — water-tank placement and window-shading
 * form — from the region's conventions. Nothing the user chose (rooms, roof, materials,
 * carport, pool) changes.
 */
import type { BuildingModel } from "./types";
import { MODEL_SCHEMA_VERSION } from "./types";
import { rebuildModel } from "./build";
import { validateModel } from "./validate";
import { pickBalconyRooms, resolveDesignLanguage } from "@/domain/generator/design-language";
import type { Region } from "@/domain/regions/types";

export function needsMigration(model: { schemaVersion?: number; exterior?: Partial<BuildingModel["exterior"]> }) {
  if ((model.schemaVersion ?? 1) < MODEL_SCHEMA_VERSION) return true;
  // Backfill: a model may carry the current version number but miss fields added within it.
  return !!model.exterior && (model.exterior.services?.tank === undefined || model.exterior.shadingForm === undefined);
}

/** Short description of what migrating this model will change (for the version history). */
export function migrationLabel(model: { schemaVersion?: number }) {
  return (model.schemaVersion ?? 1) < 2 ? "Model upgrade: regional exterior & site works added" : "Model upgrade: regional water-tank placement & window shading";
}

export function migrateModel(stored: BuildingModel, region: Region): BuildingModel {
  if (!needsMigration(stored)) return stored;
  if ((stored.schemaVersion ?? 1) >= 2) {
    const lang = resolveDesignLanguage(stored.meta.style, region, stored.selections, { useTypicalMaterials: false });
    return rebuildModel({
      ...stored,
      schemaVersion: MODEL_SCHEMA_VERSION,
      exterior: {
        ...stored.exterior,
        services: { ...stored.exterior.services, tank: stored.exterior.services.tank ?? lang.exterior.services.tank },
        shadingForm: stored.exterior.shadingForm ?? lang.exterior.shadingForm,
      },
    });
  }
  const lang = resolveDesignLanguage(stored.meta.style, region, stored.selections, { useTypicalMaterials: false });
  const base: BuildingModel = {
    ...stored,
    schemaVersion: MODEL_SCHEMA_VERSION,
    selections: stored.selections,
    designNotes: lang.notes.filter((n) => !n.startsWith("Materials:") && !n.startsWith("Roof:")),
    exterior: { ...lang.exterior, balconyRoomIds: pickBalconyRooms(stored.levels, lang.balconies) },
    exteriorGeometry: { attached: { steps: null, porch: null, balconies: [], hoods: [], acUnits: [], terraces: [] }, site: { boundary: [], gates: [], paving: [], paths: [], drains: [], trees: [], services: [], lights: [], pool: null, planting: { beds: [], shrubs: [] }, parkingBays: [] } },
  };
  const before = validateModel(rebuildModel({ ...base, exterior: { ...base.exterior, porch: null, balconyRoomIds: [], plinth: 0 } })).valid;
  const attempts: BuildingModel["exterior"][] = [
    base.exterior,
    { ...base.exterior, porch: base.exterior.porch ? { ...base.exterior.porch, depth: Math.min(base.exterior.porch.depth, 1500) } : null },
    { ...base.exterior, porch: null },
    { ...base.exterior, porch: null, balconyRoomIds: [] },
    { ...base.exterior, porch: null, balconyRoomIds: [], plinth: 150 },
  ];
  for (const exterior of attempts) {
    const m = rebuildModel({ ...base, exterior });
    if (validateModel(m).valid || !before) return m;
  }
  return rebuildModel({ ...base, exterior: attempts[attempts.length - 1] });
}
