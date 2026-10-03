import { describe, expect, it } from "vitest";
import { generateConcepts } from "@/domain/generator/concepts";
import { RequirementsSchema, type Requirements } from "@/domain/generator/requirements";
import { REGIONS } from "@/data/regions";
import { MATERIALS, defaultSelections } from "@/data/materials";
import { toRegionalCatalog } from "@/domain/materials/regional";
import { validateModel } from "./validate";
import { migrateModel } from "./migrate";
import { levelFixtures } from "./fixtures";
import { applyOp } from "./operations";
import type { BuildingModel } from "./types";

const gen = (regionId: string, plot: { width: number; depth: number }, req: Partial<Requirements>) => {
  const region = REGIONS.find((r) => r.id === regionId)!;
  return generateConcepts({
    requirements: RequirementsSchema.parse({ bedrooms: 4, bathrooms: 4, floors: 2, parking: 2, style: "modern", ...req }),
    plot: { ...plot, northAngleDeg: 0 }, region, catalog: toRegionalCatalog(MATERIALS, region.id), budget: null, selectionsForTier: defaultSelections,
  });
};
const dubai = REGIONS.find((r) => r.id === "ae-du-dubai")!;

describe("Dubai villa conventions", () => {
  const concepts = gen("ae-du-dubai", { width: 20000, depth: 35000 }, { majlis: true, staffRooms: 1, carport: true, pool: true, familyLounge: true, storage: true });

  it("produces valid concepts with a majlis at the front and a maid's room with its own bathroom", () => {
    for (const c of concepts) {
      expect(validateModel(c.model).valid, validateModel(c.model).issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ")).toBe(true);
      const ground = c.model.levels.find((l) => l.index === 0)!;
      const majlis = ground.rooms.find((r) => r.type === "majlis")!;
      expect(majlis).toBeTruthy();
      expect(ground.layout.rows[0].bays.some((b) => b.id === majlis.id)).toBe(true);
      expect(ground.rooms.find((r) => r.type === "staff")?.name).toBe("Maid’s room");
      expect(ground.rooms.some((r) => r.name === "Maid’s bathroom")).toBe(true);
    }
  });

  it("puts the tank on the flat roof, covers the parking bays and prices both", () => {
    for (const c of concepts) {
      const site = c.model.exteriorGeometry.site;
      const tank = site.services.find((s) => s.kind === "water_tank")!;
      expect(tank.placement).toBe("roof");
      expect(site.carports?.length).toBe(1);
      expect(c.estimate.lines.find((l) => l.id === "carport")?.quantity).toBeGreaterThan(0);
      expect(c.estimate.lines.find((l) => l.id === "water-tank")?.label).toMatch(/Roof/);
      expect(c.model.exterior.shadingForm).toBe("overhang");
    }
  });

  it("moves the tank underground if the roof is changed to pitched", () => {
    const m = applyOp(concepts[0].model, { kind: "roof", type: "hip" });
    expect(m.exteriorGeometry.site.services.find((s) => s.kind === "water_tank")?.placement).toBe("underground");
    expect(validateModel(m).valid).toBe(true);
  });

  it("uses screens for traditional styles", () => {
    const [c] = gen("ae-du-dubai", { width: 20000, depth: 35000 }, { style: "traditional" });
    expect(c.model.exterior.shadingForm).toBe("screen");
    expect(c.estimate.lines.find((l) => l.id === "hoods")?.unit).toBe("m²");
  });

  it("furnishes the majlis and staff room without collisions", () => {
    const m = concepts[1].model;
    const ground = m.levels.find((l) => l.index === 0)!;
    const fx = levelFixtures(ground, m.params.wallThickness.interior, m.params.wallThickness.exterior, m.footprint.width, m.footprint.depth);
    const majlis = ground.rooms.find((r) => r.type === "majlis")!;
    expect(fx.filter((f) => f.roomId === majlis.id && f.kind === "sofa").length).toBeGreaterThanOrEqual(1);
    const staff = ground.rooms.find((r) => r.type === "staff")!;
    expect(fx.some((f) => f.roomId === staff.id && f.kind === "bed")).toBe(true);
  });
});

describe("other regions keep their conventions", () => {
  it("Lagos keeps a tank on a stand and window surrounds; no carport unless asked", () => {
    const [c] = gen("ng-la-lagos", { width: 15240, depth: 30480 }, {});
    expect(c.model.exteriorGeometry.site.services.find((s) => s.kind === "water_tank")?.placement).toBe("stand");
    expect(c.model.exterior.shadingForm).toBe("surround");
    expect(c.model.exteriorGeometry.site.carports ?? []).toHaveLength(0);
  });
});

describe("migration v2 → v3", () => {
  it("adds tank placement and shading form from the region without touching user choices", () => {
    const [c] = gen("ae-du-dubai", { width: 20000, depth: 35000 }, {});
    const v2 = { ...c.model, schemaVersion: 2, exterior: { ...c.model.exterior, services: { ...c.model.exterior.services, tank: undefined }, shadingForm: undefined } } as unknown as BuildingModel;
    const m = migrateModel(v2, dubai);
    expect(m.schemaVersion).toBe(3);
    expect(m.exterior.services.tank).toBe("roof");
    expect(m.exterior.shadingForm).toBe("overhang");
    expect(m.selections).toEqual(c.model.selections);
    expect(m.levels.map((l) => l.rooms.length)).toEqual(c.model.levels.map((l) => l.rooms.length));
    // Same backfill for a model already stamped v3 but missing the fields.
    const v3 = { ...v2, schemaVersion: 3 } as unknown as BuildingModel;
    expect(migrateModel(v3, dubai).exterior.services.tank).toBe("roof");
  });
});
