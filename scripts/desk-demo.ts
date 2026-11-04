/**
 * Construction Desk demo reset (local development only).
 *
 * Creates a fresh demo project at version 1 for the local demo account, issues a new
 * project-scoped agent key (revoking earlier demo-desk keys), and registers the
 * `buildwise` MCP server for Claude with that key — so the Switch room starts clean.
 *
 *   npm run desk:demo                      # Buildwise at http://localhost:3000
 *   npm run desk:demo -- http://localhost:3210
 *
 * The key is handed straight to integrations/switch-mcp/register.mjs on stdin and is
 * never printed. Requires the dev server to be running (register.mjs checks the key).
 */
import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { REGIONS } from "../src/data/regions";
import { MATERIALS, defaultSelections } from "../src/data/materials";
import { SAMPLE_PROJECTS } from "../src/data/sample-projects";
import { toRegionalCatalog } from "../src/domain/materials/regional";
import { generateConcepts } from "../src/domain/generator/concepts";
import { COST_ENGINE_VERSION } from "../src/domain/cost/engine";
import { MODEL_SCHEMA_VERSION } from "../src/domain/model/types";
// Same account as prisma/seed.ts (importing it would run the seed).
const DEMO_EMAIL = "demo@buildwise.test";

const KEY_NAME = "Construction Desk demo";
const url = (process.argv[2] ?? process.env.BUILDWISE_URL ?? "http://localhost:3000").replace(/\/$/, "");

const host = new URL(process.env.DATABASE_URL ?? "postgres://missing").hostname;
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
  console.error(`Refusing to run: the database host "${host}" is not local. This script is for local demos only.`);
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const json = (v: unknown) => v as Prisma.InputJsonValue;

async function main() {
  const user = await db.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) throw new Error("No demo account. Run `npm run db:seed` first.");

  const sp = SAMPLE_PROJECTS.find((p) => p.regionId === "ng-la-lagos") ?? SAMPLE_PROJECTS[0];
  const region = REGIONS.find((r) => r.id === sp.regionId)!;
  const catalog = toRegionalCatalog(MATERIALS, region.id);
  const concept = generateConcepts({
    requirements: sp.requirements, plot: sp.plot, region, catalog, budget: sp.budget.target, selectionsForTier: defaultSelections,
  }).find((c) => c.key === sp.conceptKey)!;
  const name = `Desk demo — ${sp.name}`;

  // One live demo-desk project at a time: replace the previous one (its change records go with it).
  await db.project.deleteMany({ where: { ownerId: user.id, name } });

  const project = await db.project.create({
    data: {
      ownerId: user.id, name, description: sp.description, regionId: region.id, currency: region.currency,
      budgetTarget: sp.budget.target, budgetMin: sp.budget.min, budgetMax: sp.budget.max, requirements: json(sp.requirements),
      site: { create: {
        country: region.country, subdivision: region.subdivision, city: region.city, addressLine: sp.addressLine,
        plotWidthMm: sp.plot.width, plotDepthMm: sp.plot.depth, northAngleDeg: sp.plot.northAngleDeg,
      } },
    },
  });
  const e = concept.estimate;
  const v = await db.designVersion.create({
    data: {
      projectId: project.id, number: 1, label: `Original concept — ${concept.name}`, source: "concept",
      model: json(concept.model), modelSchemaVersion: MODEL_SCHEMA_VERSION, estimate: json(e), costEngineVersion: COST_ENGINE_VERSION,
      estimateLow: e.total[0], estimateHigh: e.total[1], grossFloorAreaM2: e.grossFloorArea, createdById: user.id,
    },
  });
  await db.project.update({ where: { id: project.id }, data: { currentVersionId: v.id } });

  // A fresh key; earlier demo-desk keys (on any of the demo user's projects) stop working.
  await db.agentKey.updateMany({ where: { createdById: user.id, name: KEY_NAME, revokedAt: null }, data: { revokedAt: new Date() } });
  const key = "bwk_" + randomBytes(24).toString("base64url");
  await db.agentKey.create({
    data: { projectId: project.id, name: KEY_NAME, prefix: key.slice(0, 12), keyHash: createHash("sha256").update(key).digest("hex"), createdById: user.id },
  });

  console.log(`Project "${name}" (${project.id}) at version 1: ${region.currency} ${e.expected.toFixed(2)} expected, ${e.grossFloorArea.toFixed(2)} m².`);

  const r = spawnSync(process.execPath, ["integrations/switch-mcp/register.mjs", url], { input: key + "\n", encoding: "utf8" });
  process.stdout.write((r.stdout ?? "").replaceAll(key, "bwk_…"));
  process.stderr.write((r.stderr ?? "").replaceAll(key, "bwk_…"));
  if (r.status !== 0) throw new Error("Registering the MCP server failed (is Buildwise running at " + url + "?).");
  // A room name Mattermost hasn't seen: re-using one makes Switch link to the old channel, where @desk isn't set up.
  const stamp = new Date().toISOString().slice(5, 16).replace("T", " ");
  console.log(`\nNext: in Switch Console, use the "Construction desk" template with project name "Desk demo ${stamp}".`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await db.$disconnect();
    process.exit(1);
  });
