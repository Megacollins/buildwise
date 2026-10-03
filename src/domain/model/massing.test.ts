import { describe, expect, it } from "vitest";
import { generateConcepts } from "@/domain/generator/concepts";
import { RequirementsSchema } from "@/domain/generator/requirements";
import { REGIONS } from "@/data/regions";
import { MATERIALS, defaultSelections } from "@/data/materials";
import { toRegionalCatalog } from "@/domain/materials/regional";
import { applyOp, ModelOpError } from "./operations";
import { validateModel } from "./validate";
import { buildingBounds } from "./geometry";
import { computeQuantities } from "./quantities";
import { ftToMm } from "@/domain/units";

const region = REGIONS[0];
const concepts = () => generateConcepts({
  requirements: RequirementsSchema.parse({ bedrooms: 4, bathrooms: 4, floors: 2, parking: 2, guestRoomDownstairs: true, style: "modern" }),
  plot: { width: ftToMm(50), depth: ftToMm(100), northAngleDeg: 0 }, region, catalog: toRegionalCatalog(MATERIALS, region.id),
  budget: null, selectionsForTier: defaultSelections,
});

describe("massing: projecting bays and L-shapes", () => {
  const [a, b, c] = concepts();

  it("concept A is a simple rectangle, B has a projecting bay, C is an L-shape — all valid", () => {
    expect(a.model.massing?.kind).toBe("simple");
    expect(b.model.massing?.kind).toBe("projecting_bay");
    expect(c.model.massing?.kind).toBe("l_shape");
    for (const x of [a, b, c]) expect(validateModel(x.model).valid).toBe(true);
  });

  it("B's projecting bay runs the full height: same edges and depth on every floor", () => {
    const g = b.model.massing!.groups.find((gg) => gg.depth > 0)!;
    for (const l of b.model.levels) {
      const projected = l.rooms.filter((r) => r.y < 0);
      expect(Math.min(...projected.map((r) => r.x))).toBe(g.x0);
      expect(Math.max(...projected.map((r) => r.x + r.width))).toBe(g.x1);
      expect(projected.every((r) => r.y === -g.depth)).toBe(true);
    }
  });

  it("C (flat roof) has a single-storey wing whose roof is a terrace reached by doors upstairs", () => {
    const g = c.model.massing!.groups.find((gg) => gg.depth > 0)!;
    expect(c.model.levels[0].rooms.some((r) => r.y === -g.depth)).toBe(true);
    expect(c.model.levels[1].rooms.every((r) => r.y >= 0)).toBe(true);
    const terraces = c.model.exteriorGeometry.attached.terraces;
    expect(terraces.length).toBeGreaterThan(0);
    expect(terraces[0].balustrade.length).toBeGreaterThan(0);
    expect(c.model.levels[1].windows.some((w) => w.terrace)).toBe(true);
    expect(c.estimate.lines.some((l) => l.id === "terraces")).toBe(true);
  });

  it("the L's entrance and porch sit in the inner corner, clear of the wing", () => {
    const g = c.model.massing!.groups.find((gg) => gg.depth > 0)!;
    const porch = c.model.exteriorGeometry.attached.porch!;
    expect(porch.x + porch.width).toBeLessThanOrEqual(g.x0 - c.model.params.wallThickness.exterior / 2 + 1);
    expect(porch.columns.length).toBe(1); // the wing wall carries the other side
  });

  it("outline, area and perimeter follow the real shape", () => {
    const bb = buildingBounds(c.model);
    expect(bb.y0).toBe(-c.model.massing!.groups[1].depth);
    const qa = computeQuantities(a.model), qc = computeQuantities(c.model);
    expect(qc.footprintArea).toBeGreaterThan(qa.footprintArea);
    // An L's perimeter equals its bounding rectangle's: 2 × (width + depth incl. the wing)
    const ext = qc.levels[0].exteriorWallLength;
    expect(ext).toBeCloseTo(2 * ((bb.x1 - bb.x0) + (bb.y1 - bb.y0)) / 1000, 3);
  });

  it("editing keeps the volume consistent: deepen, flatten, move its edge, scale", () => {
    const groupIdx = c.model.massing!.groups.findIndex((g) => g.depth > 0);
    const deeper = applyOp(c.model, { kind: "projection", group: groupIdx, depth: c.model.massing!.groups[groupIdx].depth + 300 });
    expect(validateModel(deeper).valid).toBe(true);
    const flat = applyOp(c.model, { kind: "projection", group: groupIdx, depth: 0 });
    expect(flat.levels[0].rooms.every((r) => r.y >= 0)).toBe(true);
    expect(validateModel(flat).valid).toBe(true);

    const edgeX = c.model.massing!.groups[groupIdx].x0;
    const edgeWall = c.model.levels[0].walls.find((w) => w.a.x === edgeX && w.b.x === edgeX && Math.min(w.a.y, w.b.y) < 0)!;
    const moved = applyOp(c.model, { kind: "moveWall", levelId: "L0", wallId: edgeWall.id, delta: 300 });
    expect(moved.massing!.groups[groupIdx].x0).toBe(edgeX + 300);
    expect(Math.min(...moved.levels[0].rooms.filter((r) => r.y < 0).map((r) => r.x))).toBe(edgeX + 300);
    expect(validateModel(moved).valid).toBe(true);

    try {
      const scaled = applyOp(c.model, { kind: "scale", factor: 0.92 });
      expect(validateModel(scaled).valid).toBe(true);
    } catch (e) {
      expect(e).toBeInstanceOf(ModelOpError); // refused with a reason is acceptable; producing an invalid model is not
    }
  });
});
