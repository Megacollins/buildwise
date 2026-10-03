/**
 * Seed: sample regional datasets, the sample material catalog, and a demo
 * account with complete demonstration projects.
 *
 * Reference data (regions, materials) is always seeded and is safe to re-run.
 *
 * The demo account has a publicly known password, so it is ONLY created when the
 * database is on this machine (localhost), or when SEED_DEMO=true is set explicitly.
 * It is never created on a hosted/production database by accident.
 *
 * Local demo account (development only):
 *   email:    demo@buildwise.test
 *   password: DEMO_PASSWORD below
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { REGIONS } from "../src/data/regions";
import { MATERIALS, defaultSelections } from "../src/data/materials";
import { SAMPLE_PROJECTS } from "../src/data/sample-projects";
import { toRegionalCatalog } from "../src/domain/materials/regional";
import { generateConcepts } from "../src/domain/generator/concepts";
import { applyOp, describeOp, type ModelOp } from "../src/domain/model/operations";
import { estimateCost, COST_ENGINE_VERSION } from "../src/domain/cost/engine";
import { MODEL_SCHEMA_VERSION, type BuildingModel } from "../src/domain/model/types";

export const DEMO_EMAIL = "demo@buildwise.test";
export const DEMO_PASSWORD = "buildwise-demo-2026";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const json = (v: unknown) => v as Prisma.InputJsonValue;

async function main() {
  for (const r of REGIONS) {
    const data = {
      country: r.country, countryCode: r.countryCode, subdivision: r.subdivision, city: r.city,
      currency: r.currency, measurementSystem: r.measurementSystem, locale: r.locale,
      data: json(r), dataStatus: r.dataStatus, dataAsOf: new Date(r.dataAsOf),
    };
    await db.region.upsert({ where: { id: r.id }, create: { id: r.id, ...data }, update: data });
  }
  for (const m of MATERIALS) {
    const data = {
      category: m.category, name: m.name, description: m.description, tier: m.tier, unit: m.unit,
      color: m.color, roughness: m.roughness ?? null, texture: m.texture, supplier: m.supplier, environmental: m.environmental,
    };
    await db.material.upsert({ where: { id: m.id }, create: { id: m.id, ...data }, update: data });
    for (const p of m.prices) {
      const pd = { priceLow: p.price[0], priceHigh: p.price[1], availability: p.availability, dataStatus: p.dataStatus };
      await db.materialPrice.upsert({
        where: { materialId_regionId: { materialId: m.id, regionId: p.regionId } },
        create: { materialId: m.id, regionId: p.regionId, ...pd }, update: pd,
      });
    }
  }
  console.log(`Seeded ${REGIONS.length} regions, ${MATERIALS.length} materials.`);

  const host = new URL(process.env.DATABASE_URL!).hostname;
  const localDb = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  if (!localDb && process.env.SEED_DEMO !== "true") {
    console.log(`Skipped demo account: database host "${host}" is not local (set SEED_DEMO=true to override).`);
    return;
  }

  const user = await db.user.upsert({
    where: { email: DEMO_EMAIL },
    create: { email: DEMO_EMAIL, name: "Demo User", passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12), emailVerifiedAt: new Date() },
    update: { emailVerifiedAt: new Date() },
  });
  await db.project.deleteMany({ where: { ownerId: user.id, isSample: true } });

  for (const sp of SAMPLE_PROJECTS) {
    const region = REGIONS.find((r) => r.id === sp.regionId)!;
    const catalog = toRegionalCatalog(MATERIALS, region.id);
    const concept = generateConcepts({
      requirements: sp.requirements, plot: sp.plot, region, catalog,
      budget: sp.budget.target, selectionsForTier: defaultSelections,
    }).find((c) => c.key === sp.conceptKey)!;

    const project = await db.project.create({
      data: {
        ownerId: user.id, name: sp.name, description: sp.description, regionId: region.id, currency: region.currency,
        budgetTarget: sp.budget.target, budgetMin: sp.budget.min, budgetMax: sp.budget.max,
        requirements: json(sp.requirements), isSample: true,
        site: { create: {
          country: region.country, subdivision: region.subdivision, city: region.city, addressLine: sp.addressLine,
          plotWidthMm: sp.plot.width, plotDepthMm: sp.plot.depth, northAngleDeg: sp.plot.northAngleDeg,
        } },
      },
    });

    // Version history: original concept, then a couple of realistic edits.
    const history: { op: ModelOp | null; source: string }[] = [
      { op: null, source: "concept" },
      { op: { kind: "selection", category: "flooring", materialId: "floor-oak" }, source: "materials" },
      { op: { kind: "selection", category: "flooring", materialId: "floor-porcelain" }, source: "materials" },
    ];
    let model: BuildingModel = concept.model;
    let prevId: string | null = null;
    for (let i = 0; i < history.length; i++) {
      const h = history[i];
      const label = h.op ? describeOp(h.op, model, (id) => catalog.find((m) => m.id === id)?.name) : `Original concept — ${concept.name}`;
      if (h.op) model = applyOp(model, h.op);
      const estimate = estimateCost(model, region, catalog);
      const v: { id: string } = await db.designVersion.create({
        data: {
          projectId: project.id, number: i + 1, label, source: h.source, parentId: prevId,
          model: json(model), modelSchemaVersion: MODEL_SCHEMA_VERSION,
          estimate: json(estimate), costEngineVersion: COST_ENGINE_VERSION,
          estimateLow: estimate.total[0], estimateHigh: estimate.total[1],
          grossFloorAreaM2: estimate.grossFloorArea, createdById: user.id,
        },
      });
      prevId = v.id;
    }
    await db.project.update({ where: { id: project.id }, data: { currentVersionId: prevId } });
    console.log(`Seeded sample project "${sp.name}".`);
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
