import { describe, expect, it } from "vitest";
import { generateConcepts } from "@/domain/generator/concepts";
import { RequirementsSchema, type Requirements } from "@/domain/generator/requirements";
import { REGIONS } from "@/data/regions";
import { MATERIALS, defaultSelections } from "@/data/materials";
import { toRegionalCatalog } from "@/domain/materials/regional";
import { levelFixtures, sideHasLowOpening, type Fixture } from "./fixtures";
import type { BuildingModel, Room } from "./types";

const gen = (regionId: string, plot: { width: number; depth: number }, req: Partial<Requirements>) => {
  const region = REGIONS.find((r) => r.id === regionId)!;
  return generateConcepts({
    requirements: RequirementsSchema.parse({ bedrooms: 4, bathrooms: 3, floors: 2, parking: 2, style: "modern", ...req }),
    plot: { ...plot, northAngleDeg: 0 }, region, catalog: toRegionalCatalog(MATERIALS, region.id), budget: null, selectionsForTier: defaultSelections,
  }).map((c) => c.model);
};

const CASES: BuildingModel[] = [
  ...gen("ng-la-lagos", { width: 15240, depth: 30480 }, {}),
  ...gen("ng-fc-abuja", { width: 25000, depth: 40000 }, { style: "contemporary", pool: true }),
  ...gen("gb-eng-london", { width: 12000, depth: 30000 }, { bedrooms: 3, bathrooms: 2, style: "traditional" }),
  ...gen("ae-du-dubai", { width: 20000, depth: 35000 }, { majlis: true, staffRooms: 2, carport: true, pool: true }),
  ...gen("us-tx-austin", { width: 21340, depth: 39620 }, { bedrooms: 3, bathrooms: 2, floors: 1, style: "scandinavian" }),
];

/** Items that legitimately sit on or over other items. */
const LAYERED = new Set(["rug", "sink", "hob", "wall_cabinet"]);

const overlaps = (a: Fixture, b: Fixture) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.d - 1 && b.y < a.y + a.d - 1;

function headSide(f: Fixture, room: Room): "N" | "S" | "E" | "W" {
  const gaps: ["N" | "S" | "E" | "W", number][] = [
    ["S", f.y - room.y], ["N", room.y + room.depth - (f.y + f.d)], ["W", f.x - room.x], ["E", room.x + room.width - (f.x + f.w)],
  ];
  return gaps.sort((a, b) => a[1] - b[1])[0][0];
}

describe("furniture layout", () => {
  for (const model of CASES) {
    const name = `${model.meta.conceptName} · ${model.meta.style}`;
    it(`${name}: furniture stays inside rooms and doesn't collide`, () => {
      const t = model.params.wallThickness;
      for (const level of model.levels) {
        const fx = levelFixtures(level, t.interior, t.exterior, model.footprint.width, model.footprint.depth);
        const rooms = new Map(level.rooms.map((r) => [r.id, r]));
        for (const f of fx) {
          const r = rooms.get(f.roomId)!;
          expect(f.x).toBeGreaterThanOrEqual(r.x);
          expect(f.y).toBeGreaterThanOrEqual(r.y);
          expect(f.x + f.w).toBeLessThanOrEqual(r.x + r.width);
          expect(f.y + f.d).toBeLessThanOrEqual(r.y + r.depth);
        }
        const solid = fx.filter((f) => !LAYERED.has(f.kind));
        for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
          if (overlaps(solid[i], solid[j])) throw new Error(`${level.name}: ${solid[i].kind} overlaps ${solid[j].kind} in ${rooms.get(solid[i].roomId)?.name}`);
        }
      }
    });

    it(`${name}: no bed head against a door or floor-level glazing when a clear wall exists`, () => {
      const t = model.params.wallThickness;
      for (const level of model.levels) {
        for (const f of levelFixtures(level, t.interior, t.exterior, model.footprint.width, model.footprint.depth).filter((x) => x.kind === "bed")) {
          const room = level.rooms.find((r) => r.id === f.roomId)!;
          const side = headSide(f, room);
          const anyClear = (["N", "S", "E", "W"] as const).some((sd) => !sideHasLowOpening(level, room, sd));
          if (anyClear) expect(sideHasLowOpening(level, room, side), `${room.name} bed head on ${side}`).toBe(false);
        }
      }
    });
  }
});
