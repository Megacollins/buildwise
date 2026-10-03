import "server-only";
import { cache } from "react";
import { db } from "./db";
import { getRegion, getRegionalCatalog } from "./catalog";
import type { BuildingModel } from "@/domain/model/types";
import { MODEL_SCHEMA_VERSION } from "@/domain/model/types";
import { applyOp, describeOp, ModelOpError, type ModelOp } from "@/domain/model/operations";
import { estimateCost, COST_ENGINE_VERSION, type CostEstimate } from "@/domain/cost/engine";
import { generateConcepts } from "@/domain/generator/concepts";
import { RequirementsSchema, type PlotInput, type Requirements } from "@/domain/generator/requirements";
import { migrateModel, migrationLabel, needsMigration } from "@/domain/model/migrate";
import { defaultSelections } from "@/data/materials";
import type { Prisma } from "@/generated/prisma/client";

export class NotFoundError extends Error {}
export class InfeasibleConceptError extends Error {}

const json = (v: unknown) => v as Prisma.InputJsonValue;

/** Fetch a project only if it belongs to the user. Authorisation lives here, not in pages. */
export const getProjectForUser = cache(async (projectId: string, userId: string) => {
  const project = await db.project.findFirst({
    where: { id: projectId, ownerId: userId },
    include: { site: true, region: { select: { id: true, city: true, country: true, subdivision: true, currency: true, dataStatus: true } }, currentVersion: true },
  });
  if (!project || !project.currentVersion) return null;
  if (needsMigration(project.currentVersion.model as unknown as BuildingModel)) {
    await upgradeStoredModel(project.id, project.regionId, project.currentVersion.id, userId);
    return getProjectForUserUncached(projectId, userId);
  }
  return {
    ...project,
    budgetTarget: project.budgetTarget ? Number(project.budgetTarget) : null,
    budgetMin: project.budgetMin ? Number(project.budgetMin) : null,
    budgetMax: project.budgetMax ? Number(project.budgetMax) : null,
    requirements: project.requirements as unknown as Requirements,
    model: project.currentVersion.model as unknown as BuildingModel,
    estimate: project.currentVersion.estimate as unknown as CostEstimate,
  };
});
async function getProjectForUserUncached(projectId: string, userId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, ownerId: userId },
    include: { site: true, region: { select: { id: true, city: true, country: true, subdivision: true, currency: true, dataStatus: true } }, currentVersion: true },
  });
  if (!project || !project.currentVersion) return null;
  return {
    ...project,
    budgetTarget: project.budgetTarget ? Number(project.budgetTarget) : null,
    budgetMin: project.budgetMin ? Number(project.budgetMin) : null,
    budgetMax: project.budgetMax ? Number(project.budgetMax) : null,
    requirements: project.requirements as unknown as Requirements,
    model: project.currentVersion.model as unknown as BuildingModel,
    estimate: project.currentVersion.estimate as unknown as CostEstimate,
  };
}
export type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProjectForUser>>>;

/**
 * One-time upgrade of an older stored model. Saved as a new, clearly labelled
 * version (with a recalculated estimate) so the change is visible and reversible.
 */
export async function upgradeStoredModel(projectId: string, regionId: string, versionId: string, userId: string) {
  const v = await db.designVersion.findUnique({ where: { id: versionId } });
  const region = await getRegion(regionId);
  if (!v || !region) return;
  const model = migrateModel(v.model as unknown as BuildingModel, region);
  const estimate = estimateCost(model, region, await getRegionalCatalog(regionId));
  try {
    await db.$transaction(async (tx) => {
      const latest = await tx.designVersion.findFirst({ where: { projectId }, orderBy: { number: "desc" }, select: { number: true } });
      const nv = await tx.designVersion.create({
        data: {
          projectId, number: (latest?.number ?? 0) + 1, label: migrationLabel(v.model as unknown as BuildingModel), source: "upgrade",
          parentId: v.id, model: json(model), modelSchemaVersion: MODEL_SCHEMA_VERSION,
          estimate: json(estimate), costEngineVersion: COST_ENGINE_VERSION,
          estimateLow: estimate.total[0], estimateHigh: estimate.total[1], grossFloorAreaM2: estimate.grossFloorArea, createdById: userId,
        },
      });
      await tx.project.update({ where: { id: projectId }, data: { currentVersionId: nv.id } });
    });
  } catch {
    // A concurrent request already upgraded it (unique version number); nothing to do.
  }
}

export async function listProjectsForUser(userId: string) {
  const rows = await db.project.findMany({
    where: { ownerId: userId },
    orderBy: { updatedAt: "desc" },
    include: {
      site: { select: { city: true, country: true, plotWidthMm: true, plotDepthMm: true } },
      currentVersion: { select: { estimateLow: true, estimateHigh: true, grossFloorAreaM2: true, number: true, model: true } },
    },
  });
  return rows.map((p) => {
    const model = p.currentVersion?.model as unknown as BuildingModel | undefined;
    return {
      id: p.id, name: p.name, stage: p.stage, isSample: p.isSample, updatedAt: p.updatedAt, currency: p.currency,
      city: p.site?.city ?? "", country: p.site?.country ?? "",
      budgetTarget: p.budgetTarget ? Number(p.budgetTarget) : null,
      estimate: p.currentVersion ? ([Number(p.currentVersion.estimateLow), Number(p.currentVersion.estimateHigh)] as [number, number]) : null,
      gfa: p.currentVersion?.grossFloorAreaM2 ?? 0,
      version: p.currentVersion?.number ?? 0,
      floors: model?.levels.length ?? 0,
      bedrooms: model?.levels.flatMap((l) => l.rooms).filter((r) => r.type.includes("bedroom")).length ?? 0,
      model: model ?? null,
    };
  });
}
export type ProjectSummary = Awaited<ReturnType<typeof listProjectsForUser>>[number];

async function estimateFor(model: BuildingModel, regionId: string) {
  const region = await getRegion(regionId);
  if (!region) throw new Error(`Unknown region ${regionId}`);
  const catalog = await getRegionalCatalog(regionId);
  return estimateCost(model, region, catalog);
}

/** Generate concepts on the server (the client never computes the authoritative model or cost). */
export async function buildConcepts(input: { regionId: string; plot: PlotInput; requirements: Requirements; budget: number | null }) {
  const region = await getRegion(input.regionId);
  if (!region) throw new Error("Unknown region");
  const catalog = await getRegionalCatalog(region.id);
  return generateConcepts({
    requirements: input.requirements, plot: input.plot, region, catalog,
    budget: input.budget, selectionsForTier: defaultSelections,
  });
}

export async function createProject(opts: {
  userId: string;
  name: string;
  regionId: string;
  addressLine?: string | null;
  plot: PlotInput;
  requirements: Requirements;
  budget: { target: number | null; min: number | null; max: number | null };
  conceptKey: "A" | "B" | "C";
  description?: string;
  isSample?: boolean;
}) {
  const region = await getRegion(opts.regionId);
  if (!region) throw new Error("Unknown region");
  const requirements = RequirementsSchema.parse(opts.requirements);
  const concepts = await buildConcepts({ regionId: region.id, plot: opts.plot, requirements, budget: opts.budget.target });
  const concept = concepts.find((c) => c.key === opts.conceptKey)!;
  if (!concept.feasible) throw new InfeasibleConceptError(concept.fit[0] ?? "This concept is not feasible on this plot.");

  return db.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        ownerId: opts.userId, name: opts.name, regionId: region.id, currency: region.currency,
        budgetTarget: opts.budget.target, budgetMin: opts.budget.min, budgetMax: opts.budget.max,
        requirements: json(requirements), description: opts.description ?? "", isSample: opts.isSample ?? false,
        site: {
          create: {
            country: region.country, subdivision: region.subdivision, city: region.city,
            addressLine: opts.addressLine ?? null,
            plotWidthMm: opts.plot.width, plotDepthMm: opts.plot.depth, northAngleDeg: Math.round(opts.plot.northAngleDeg),
          },
        },
      },
    });
    const version = await tx.designVersion.create({
      data: {
        projectId: project.id, number: 1, label: `Original concept — ${concept.name}`, source: "concept",
        model: json(concept.model), modelSchemaVersion: MODEL_SCHEMA_VERSION,
        estimate: json(concept.estimate), costEngineVersion: COST_ENGINE_VERSION,
        estimateLow: concept.estimate.total[0], estimateHigh: concept.estimate.total[1],
        grossFloorAreaM2: concept.estimate.grossFloorArea, createdById: opts.userId,
      },
    });
    await tx.project.update({ where: { id: project.id }, data: { currentVersionId: version.id } });
    return project;
  });
}

/**
 * Apply a design change. The op is re-applied on the server to the stored
 * model and the estimate recomputed here — the client's preview is never trusted.
 * Consecutive material swaps within a few minutes are folded into one version
 * so the history stays readable.
 */
export async function applyProjectOp(projectId: string, userId: string, op: ModelOp, source = "edit", label?: string) {
  const project = await getProjectForUser(projectId, userId);
  if (!project) throw new NotFoundError();
  let model: BuildingModel;
  try {
    model = applyOp(project.model, op);
  } catch (e) {
    if (e instanceof ModelOpError) return { ok: false as const, error: e.message };
    throw e;
  }
  const catalog = await getRegionalCatalog(project.regionId);
  if (op.kind === "selection") {
    const m = catalog.find((x) => x.id === op.materialId);
    if (!m || m.category !== op.category) return { ok: false as const, error: "Material not available in this region." };
  }
  const estimate = await estimateFor(model, project.regionId);
  const versionLabel = label ?? describeOp(op, project.model, (id) => catalog.find((m) => m.id === id)?.name);
  const current = project.currentVersion!;
  const latest = await db.designVersion.findFirst({ where: { projectId }, orderBy: { number: "desc" }, select: { id: true, number: true } });

  const fold = op.kind === "selection" && current.source === "materials" && latest?.id === current.id
    && current.number > 1 && Date.now() - current.createdAt.getTime() < 5 * 60_000;

  const data = {
    model: json(model), modelSchemaVersion: MODEL_SCHEMA_VERSION,
    estimate: json(estimate), costEngineVersion: COST_ENGINE_VERSION,
    estimateLow: estimate.total[0], estimateHigh: estimate.total[1], grossFloorAreaM2: estimate.grossFloorArea,
  };
  if (fold) {
    const prevLabel = current.label.startsWith("Finishes: ") ? current.label : `Finishes: ${current.label}`;
    await db.designVersion.update({ where: { id: current.id }, data: { ...data, label: `${prevLabel}; ${versionLabel}`.slice(0, 180) } });
    await db.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
  } else {
    await db.$transaction(async (tx) => {
      const v = await tx.designVersion.create({
        data: {
          ...data, projectId, number: (latest?.number ?? 0) + 1, label: versionLabel.slice(0, 180),
          source: op.kind === "selection" ? "materials" : source, parentId: current.id, createdById: userId,
        },
      });
      await tx.project.update({ where: { id: projectId }, data: { currentVersionId: v.id } });
    });
  }
  return { ok: true as const, estimate };
}

export async function listVersions(projectId: string, userId: string) {
  const project = await db.project.findFirst({ where: { id: projectId, ownerId: userId }, select: { id: true, currentVersionId: true } });
  if (!project) throw new NotFoundError();
  const versions = await db.designVersion.findMany({
    where: { projectId },
    orderBy: { number: "desc" },
    select: { id: true, number: true, label: true, source: true, createdAt: true, estimateLow: true, estimateHigh: true, grossFloorAreaM2: true },
  });
  return versions.map((v) => ({
    ...v, estimate: [Number(v.estimateLow), Number(v.estimateHigh)] as [number, number], current: v.id === project.currentVersionId,
  }));
}

/** Restoring never deletes history: it creates a new version copying the old one. */
export async function restoreVersion(projectId: string, versionId: string, userId: string) {
  const project = await db.project.findFirst({ where: { id: projectId, ownerId: userId } });
  if (!project) throw new NotFoundError();
  const v = await db.designVersion.findFirst({ where: { id: versionId, projectId } });
  if (!v) throw new NotFoundError();
  const region = await getRegion(project.regionId);
  const model = region ? migrateModel(v.model as unknown as BuildingModel, region) : (v.model as unknown as BuildingModel);
  const estimate = await estimateFor(model, project.regionId); // re-price with current data
  const latest = await db.designVersion.findFirst({ where: { projectId }, orderBy: { number: "desc" }, select: { number: true } });
  await db.$transaction(async (tx) => {
    const nv = await tx.designVersion.create({
      data: {
        projectId, number: (latest?.number ?? 0) + 1, label: `Restored version ${v.number}`, source: "restore",
        parentId: v.id, model: json(model), modelSchemaVersion: MODEL_SCHEMA_VERSION,
        estimate: json(estimate), costEngineVersion: COST_ENGINE_VERSION,
        estimateLow: estimate.total[0], estimateHigh: estimate.total[1], grossFloorAreaM2: estimate.grossFloorArea,
        createdById: userId,
      },
    });
    await tx.project.update({ where: { id: projectId }, data: { currentVersionId: nv.id } });
  });
}
