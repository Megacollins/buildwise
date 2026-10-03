import { describe, expect, it } from "vitest";
import { generateConcepts } from "@/domain/generator/concepts";
import { RequirementsSchema, type Requirements } from "@/domain/generator/requirements";
import { REGIONS } from "@/data/regions";
import { MATERIALS, defaultSelections } from "@/data/materials";
import { toRegionalCatalog } from "@/domain/materials/regional";
import { applyOp } from "./operations";
import { validateModel } from "./validate";
import { ftToMm } from "@/domain/units";

const gen = (regionId: string, plot: { width: number; depth: number }, req: Partial<Requirements>) => {
  const region = REGIONS.find((r) => r.id === regionId)!;
  return generateConcepts({
    requirements: RequirementsSchema.parse({ bedrooms: 4, bathrooms: 3, floors: 2, parking: 2, style: "modern", ...req }),
    plot: { ...plot, northAngleDeg: 0 }, region, catalog: toRegionalCatalog(MATERIALS, region.id), budget: null, selectionsForTier: defaultSelections,
  });
};

describe("swimming pool", () => {
  it("is placed in the garden of a large plot, clear of everything, and priced", () => {
    for (const c of gen("ng-fc-abuja", { width: 25000, depth: 40000 }, { pool: true })) {
      expect(validateModel(c.model).valid).toBe(true);
      const pool = c.model.exteriorGeometry.site.pool!;
      expect(pool).not.toBeNull();
      expect(pool.water.width * pool.water.depth).toBeGreaterThanOrEqual(5000 * 2500);
      expect(c.estimate.lines.find((l) => l.id === "pool")?.quantity).toBeGreaterThan(0);
      expect(c.fit.some((f) => f.startsWith("Pool"))).toBe(true);
    }
  });

  it("is honestly reported as not fitting on a tight plot rather than squeezed in", () => {
    const [a] = gen("ng-la-lagos", { width: ftToMm(35), depth: ftToMm(70) }, { pool: true, bedrooms: 2, bathrooms: 2, parking: 1 });
    expect(a.model.exteriorGeometry.site.pool).toBeNull();
    expect(a.model.warnings.join(" ")).toMatch(/isn't room for a .* pool/);
    expect(a.fit.join(" ")).toMatch(/No room for the requested pool/);
    expect(validateModel(a.model).valid).toBe(true);
  });

  it("is not added unless asked for", () => {
    for (const c of gen("ng-fc-abuja", { width: 25000, depth: 40000 }, { pool: false })) expect(c.model.exteriorGeometry.site.pool).toBeNull();
  });
});

describe("set-back upper floors and terraces", () => {
  const [a] = gen("ng-la-lagos", { width: ftToMm(60), depth: ftToMm(120) }, {});

  it("setting the first floor back creates a terrace with doors onto it", () => {
    const m = applyOp(a.model, { kind: "levelDepth", group: 0, level: 1, depth: -1500 });
    expect(validateModel(m).valid).toBe(true);
    expect(m.levels[1].rooms.filter((r) => r.y === 1500).length).toBeGreaterThan(0);
    const t = m.exteriorGeometry.attached.terraces;
    expect(t.length).toBe(1);
    expect(t[0].depth).toBe(1500);
    expect(m.levels[1].windows.some((w) => w.terrace)).toBe(true);
  });

  it("an upper floor can't overhang the one below", () => {
    expect(() => applyOp(a.model, { kind: "levelDepth", group: 0, level: 1, depth: 900 })).toThrow(/isn't possible/);
  });

  it("a pitched roof can't follow a set-back top floor yet — refused with the reason", () => {
    const pitched = applyOp(a.model, { kind: "roof", type: "hip" });
    expect(() => applyOp(pitched, { kind: "levelDepth", group: 0, level: 1, depth: -1500 })).toThrow(/flat roof/);
  });
});
