import { describe, expect, it } from "vitest";
import { generateConcepts } from "@/domain/generator/concepts";
import { REGIONS } from "@/data/regions";
import { MATERIALS, defaultSelections } from "@/data/materials";
import { SAMPLE_PROJECTS } from "@/data/sample-projects";
import { toRegionalCatalog } from "@/domain/materials/regional";
import { estimateCost } from "@/domain/cost/engine";
import { applyOp } from "@/domain/model/operations";
import { compareSnapshots } from "./compare";

const sp = SAMPLE_PROJECTS.find((p) => p.regionId === "ng-la-lagos")!;
const region = REGIONS.find((r) => r.id === sp.regionId)!;
const catalog = toRegionalCatalog(MATERIALS, region.id);
const concept = generateConcepts({ requirements: sp.requirements, plot: sp.plot, region, catalog, budget: sp.budget.target, selectionsForTier: defaultSelections })
  .find((c) => c.key === sp.conceptKey)!;
const before = { model: concept.model, estimate: concept.estimate };
const snapshot = (model: typeof concept.model) => ({ model, estimate: estimateCost(model, region, catalog) });

describe("comparing a design change", () => {
  it("reports no differences for an unchanged design", () => {
    const c = compareSnapshots(before, snapshot(concept.model));
    expect(c.cost.delta).toBe(0);
    expect(c.rooms).toEqual([]);
    expect(c.quantities).toEqual([]);
    expect(c.lines).toEqual([]);
    expect(c.checks.valid).toBe(true);
  });

  it("measures a room enlargement from the two models and estimates", () => {
    const room = concept.model.levels.flatMap((l) => l.rooms).find((r) => r.type === "master_bedroom")!;
    const after = snapshot(applyOp(concept.model, { kind: "resizeRoom", roomId: room.id, axis: "width", delta: 600 }));
    const c = compareSnapshots(before, after);

    // Cost delta is exactly the difference between the two engine estimates.
    expect(c.cost.delta).toBeCloseTo(after.estimate.expected - before.estimate.expected, 1);
    expect(c.cost.before.expected).toBeCloseTo(before.estimate.expected, 1);
    // The resized room is listed with its real before/after area.
    const rd = c.rooms.find((r) => r.id === room.id)!;
    expect(rd.before).toBeCloseTo(room.area, 1);
    expect(rd.after! - rd.before!).toBeCloseTo(rd.delta, 2);
    // Every reported quantity change is real, and the line changes add up to the cost change.
    for (const q of c.quantities) expect(q.after).not.toBeCloseTo(q.before, 3);
    expect(c.lines.length).toBeGreaterThan(0);
    const lineSum = c.lines.reduce((s, l) => s + l.delta, 0);
    expect(lineSum).toBeCloseTo(c.cost.delta, -1);
    // Sorted largest change first.
    for (let i = 1; i < c.lines.length; i++) expect(Math.abs(c.lines[i - 1].delta)).toBeGreaterThanOrEqual(Math.abs(c.lines[i].delta));
  });

  it("shows a material swap as a cost change without area changes", () => {
    const floor = catalog.find((m) => m.category === "flooring" && m.id !== concept.model.selections.flooring && m.price)!;
    const after = snapshot(applyOp(concept.model, { kind: "selection", category: "flooring", materialId: floor.id }));
    const c = compareSnapshots(before, after);
    expect(c.grossFloorArea.delta).toBe(0);
    expect(c.rooms).toEqual([]);
    const line = c.lines.find((l) => l.id === "mat-flooring")!;
    // A swapped material names both sides, so "now" isn't shown under the new material's name.
    const was = before.estimate.lines.find((l) => l.id === "mat-flooring")!.label;
    expect(line.label).toBe(was === floor.name ? floor.name : `${was} → ${after.estimate.lines.find((l) => l.id === "mat-flooring")!.label}`);
  });

  it("refuses to compare estimates in different currencies", () => {
    const other = { ...before, estimate: { ...before.estimate, currency: "USD" } };
    expect(() => compareSnapshots(before, other)).toThrow(/currencies/);
  });
});
