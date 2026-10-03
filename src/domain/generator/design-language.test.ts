import { describe, expect, it } from "vitest";
import { generateConcepts } from "./concepts";
import { RequirementsSchema } from "./requirements";
import { REGIONS } from "@/data/regions";
import { MATERIALS, defaultSelections } from "@/data/materials";
import { toRegionalCatalog } from "@/domain/materials/regional";
import { validateModel } from "@/domain/model/validate";
import { ftToMm } from "@/domain/units";

const brief = RequirementsSchema.parse({ bedrooms: 4, bathrooms: 3, floors: 2, parking: 2, style: "modern" });
const plot = { width: ftToMm(60), depth: ftToMm(110), northAngleDeg: 0 };
const region = (id: string) => REGIONS.find((r) => r.id === id)!;
const design = (id: string) => {
  const r = region(id);
  const c = generateConcepts({ requirements: brief, plot, region: r, catalog: toRegionalCatalog(MATERIALS, r.id), budget: null, selectionsForTier: defaultSelections })[1];
  return { model: c.model, estimate: c.estimate };
};

describe("Modern + Lagos ≠ Modern + Abuja ≠ Modern + London", () => {
  const lagos = design("ng-la-lagos");
  const abuja = design("ng-fc-abuja");
  const london = design("gb-eng-london");

  it("all three are valid models", () => {
    for (const d of [lagos, abuja, london]) expect(validateModel(d.model).valid).toBe(true);
  });

  it("Lagos: parapet roof, raised floor, fenced compound with gate, services, paved yard, balconies, window hoods", () => {
    const m = lagos.model, x = m.exteriorGeometry;
    expect(m.roof.type).toBe("flat");
    expect(m.exterior.plinth).toBe(600);
    expect(x.site.boundary.some((b) => b.kind === "masonry_wall" && b.height === 2400)).toBe(true);
    expect(x.site.gates.map((g) => g.kind).sort()).toEqual(["pedestrian", "vehicle"]);
    expect(x.site.services.map((s) => s.kind).sort()).toEqual(["generator_house", "water_tank"]);
    expect(x.site.paving.length).toBe(1);
    expect(x.attached.balconies.length).toBeGreaterThan(0);
    expect(x.attached.hoods.length).toBeGreaterThan(0);
    expect(x.attached.steps?.risers).toBe(4);
    expect(lagos.estimate.lines.some((l) => l.id === "generator-house")).toBe(true);
  });

  it("Abuja differs from Lagos: hipped roof, lower plinth, deeper shading, garden with shade trees", () => {
    const m = abuja.model;
    expect(m.roof.type).toBe("hip");
    expect(m.exterior.plinth).toBe(450);
    expect(m.exterior.shadingDepth).toBeGreaterThan(lagos.model.exterior.shadingDepth);
    expect(m.exterior.compound.paving).toBe("driveway");
    expect(m.exteriorGeometry.site.trees.every((t) => t.kind === "shade")).toBe(true);
  });

  it("London differs from both: brick, low front wall, no generator/tank/AC, no hoods, small step", () => {
    const m = london.model, x = m.exteriorGeometry;
    expect(m.selections.exterior_finish).toBe("ext-brick");
    expect(x.site.boundary.some((b) => b.kind === "low_wall" && b.height === 900)).toBe(true);
    expect(x.site.services).toEqual([]);
    expect(x.attached.acUnits).toEqual([]);
    expect(x.attached.hoods).toEqual([]);
    expect(m.exterior.plinth).toBe(150);
    expect(london.estimate.lines.some((l) => l.id === "generator-house")).toBe(false);
  });

  it("every design explains why it looks the way it does", () => {
    for (const d of [lagos, abuja, london]) expect(d.model.designNotes.length).toBeGreaterThanOrEqual(3);
    expect(lagos.model.designNotes.join(" ")).toMatch(/stormwater|Lagos/);
    expect(london.model.designNotes.join(" ")).toMatch(/brick/i);
  });
});
