import { describe, expect, it } from "vitest";
import { generateConcepts } from "@/domain/generator/concepts";
import { RequirementsSchema, type Requirements } from "@/domain/generator/requirements";
import { REGIONS } from "@/data/regions";
import { MATERIALS, defaultSelections } from "@/data/materials";
import { toRegionalCatalog } from "@/domain/materials/regional";
import { applyOp, ModelOpError, type ModelOp } from "./operations";
import { optimisationOptions } from "@/domain/cost/optimize";
import { validateModel, type RuleId } from "./validate";
import type { BuildingModel } from "./types";
import { ftToMm } from "@/domain/units";

const PLOTS = [
  { width: ftToMm(50), depth: ftToMm(100), northAngleDeg: 0 },
  { width: 18000, depth: 32000, northAngleDeg: 90 },
  { width: ftToMm(70), depth: ftToMm(130), northAngleDeg: 20 },
];

function concepts(regionIdx: number, plotIdx: number, req: Partial<Requirements>) {
  const region = REGIONS[regionIdx];
  return generateConcepts({
    requirements: RequirementsSchema.parse({ bedrooms: 3, bathrooms: 2, floors: 2, parking: 1, style: "modern", ...req }),
    plot: PLOTS[plotIdx], region, catalog: toRegionalCatalog(MATERIALS, region.id), budget: null,
    selectionsForTier: defaultSelections,
  });
}

const errorsOf = (m: BuildingModel) => validateModel(m).issues.filter((i) => i.severity === "error");

// A broad sweep of briefs. Any error here is a bug in the generator or the validator.
const SWEEP: Partial<Requirements>[] = [];
for (const floors of [1, 2, 3]) for (const bedrooms of [1, 2, 3, 4, 6]) for (const garage of [false, true]) {
  SWEEP.push({ floors, bedrooms, bathrooms: Math.max(1, bedrooms - 1), garage, parking: garage ? 2 : 1, office: bedrooms % 2 === 0, storage: floors === 3, familyLounge: floors > 1 && bedrooms >= 4 });
}

/**
 * Briefs a plot should always accommodate. Larger ones may legitimately be infeasible.
 * A double garage shares the frontage with the living room, so it needs ≥ 10.5 m of buildable width.
 */
const reasonable = (req: Partial<Requirements>, regionIdx: number, plotIdx: number) => {
  const sb = REGIONS[regionIdx].planning.defaultSetbacks;
  const buildableW = PLOTS[plotIdx].width - sb.left - sb.right;
  if (req.garage && buildableW < 10500) return false;
  return req.floors === 1 ? req.bedrooms! <= 3 : req.bedrooms! <= 4 + 2 * (req.floors! - 2);
};

describe("generated models are internally consistent", () => {
  for (let r = 0; r < REGIONS.length; r++) {
    it(`${REGIONS[r].city}: concepts are either valid or explicitly flagged infeasible; sensible briefs are feasible`, () => {
      const failures: string[] = [];
      for (const req of SWEEP) for (let p = 0; p < PLOTS.length; p++) {
        for (const c of concepts(r, p, req)) {
          const errs = errorsOf(c.model);
          if (c.feasible !== (errs.length === 0)) failures.push(`feasible flag wrong: ${JSON.stringify(req)}`);
          if (errs.length && reasonable(req, r, p)) failures.push(`${JSON.stringify(req)} plot ${p} concept ${c.key}: ${errs.map((e) => `${e.rule}: ${e.message}`).join(" | ")}`);
        }
      }
      expect(failures.slice(0, 5)).toEqual([]);
    });
  }
});

describe("edits keep the model valid or are refused", () => {
  it("wall moves, resizes, roof, glazing and optimisation ops never produce an invalid model", () => {
    const region = REGIONS[0];
    const catalog = toRegionalCatalog(MATERIALS, region.id);
    const failures: string[] = [];
    for (const req of SWEEP.slice(0, 12)) {
      const concept = concepts(0, 0, req)[1];
      if (!concept.feasible) continue; // edits can't make an infeasible brief valid
      const base = concept.model;
      const ops: ModelOp[] = [
        { kind: "roof", type: "gable" }, { kind: "roof", type: "hip" }, { kind: "glazing", factor: 1.5 }, { kind: "glazing", factor: 0.6 },
        { kind: "scale", factor: 0.85 }, { kind: "scale", factor: 1.15 },
        ...optimisationOptions(base, region, catalog).map((o) => o.op),
      ];
      for (const l of base.levels) {
        for (const w of l.walls) for (const delta of [-300, 300]) ops.push({ kind: "moveWall", levelId: l.id, wallId: w.id, delta });
        for (const room of l.rooms) for (const axis of ["width", "depth"] as const) ops.push({ kind: "resizeRoom", roomId: room.id, axis, delta: 600 });
      }
      for (const op of ops) {
        let next: BuildingModel;
        try { next = applyOp(base, op); } catch (e) { if (e instanceof ModelOpError) continue; throw e; }
        const errs = errorsOf(next);
        if (errs.length) failures.push(`${JSON.stringify(op)} on ${JSON.stringify(req)}: ${errs[0].rule}: ${errs[0].message}`);
      }
    }
    expect(failures.slice(0, 5)).toEqual([]);
  });
});

describe("each rule catches what it is for", () => {
  const base = () => structuredClone(concepts(0, 0, { floors: 2, bedrooms: 4, bathrooms: 3, parking: 2 })[1].model);
  const rulesHit = (m: BuildingModel) => new Set(validateModel(m).issues.filter((i) => i.severity === "error").map((i) => i.rule));
  const expectRule = (m: BuildingModel, rule: RuleId) => expect([...rulesHit(m)]).toContain(rule);

  it("the untouched model is valid", () => expect(validateModel(base()).valid).toBe(true));

  it("window pushed past the end of its wall", () => {
    const m = base(); m.levels[0].windows[0].offset = 999_999; expectRule(m, "openings-on-walls");
  });
  it("two openings overlapping on one wall", () => {
    const m = base();
    const w = m.levels[0].windows[0];
    m.levels[0].windows.push({ ...w, id: "dup-win", tag: "W99" });
    expectRule(m, "openings-no-overlap");
  });
  it("window taller than the ceiling", () => {
    const m = base(); m.levels[0].windows[0].height = 5000; expectRule(m, "opening-heights");
  });
  it("door attached to a missing wall", () => {
    const m = base(); m.levels[0].doors[1].wallId = "nope"; expectRule(m, "openings-on-walls");
  });
  it("overlapping rooms", () => {
    const m = base(); m.levels[0].rooms[1].x = m.levels[0].rooms[0].x; expectRule(m, "rooms-no-overlap");
  });
  it("stated room area that doesn't match the geometry", () => {
    const m = base(); m.levels[0].rooms[0].area += 3; expectRule(m, "room-areas");
  });
  it("disconnected wall", () => {
    const m = base(); const w = m.levels[0].walls.find((x) => !x.exterior)!; w.a = { x: w.a.x + 50, y: w.a.y + 50 }; w.b = { x: w.b.x + 50, y: w.b.y + 50 };
    expect(rulesHit(m).has("walls-connected") || rulesHit(m).has("walls-reference-rooms")).toBe(true);
  });
  it("missing exterior wall", () => {
    const m = base(); m.levels[0].walls = m.levels[0].walls.filter((w, i, all) => w !== all.find((x) => x.exterior)); expectRule(m, "exterior-envelope-closed");
  });
  it("room without a door", () => {
    const m = base(); const bed = m.levels[1].rooms.find((r) => r.type.includes("bedroom"))!;
    m.levels[1].doors = m.levels[1].doors.filter((d) => d.swingInto !== bed.id && !d.connects.includes(bed.id));
    expectRule(m, "rooms-accessible");
  });
  it("no entrance", () => {
    const m = base(); m.levels[0].doors = m.levels[0].doors.filter((d) => d.kind !== "entrance"); expectRule(m, "entrance-exists");
  });
  it("stair whose risers don't add up to the storey height", () => {
    const m = base(); m.levels[0].stairs[0].riserHeight = 150; expectRule(m, "stairs-connect-levels");
  });
  it("stair with no floor above", () => {
    const m = base(); m.levels = [m.levels[0]]; expectRule(m, "stairs-connect-levels");
  });
  it("levels that don't stack", () => {
    const m = base(); m.levels[1].elevation += 500; expectRule(m, "level-heights");
  });
  it("building outside the plot", () => {
    const m = base(); m.site.footprintOrigin.x = m.site.plot.width; expectRule(m, "footprint-in-plot");
  });
  it("duplicate ids", () => {
    const m = base(); m.levels[0].windows[1].id = m.levels[0].windows[0].id; expectRule(m, "unique-ids");
  });
});
