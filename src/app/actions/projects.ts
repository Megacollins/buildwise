"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireUser } from "@/server/auth";
import { applyProjectOp, buildConcepts, createProject, restoreVersion, getProjectForUser, InfeasibleConceptError } from "@/server/projects";
import { getRegion, getRegionalCatalog } from "@/server/catalog";
import { RequirementsSchema, PlotSchema } from "@/domain/generator/requirements";
import { ModelOpSchema } from "@/domain/model/operations";
import { optimisationOptions } from "@/domain/cost/optimize";
import { interpretRequest } from "@/server/assistant";
import { db } from "@/server/db";

const BudgetSchema = z.object({
  target: z.number().positive().max(1e13).nullable(),
  min: z.number().positive().max(1e13).nullable(),
  max: z.number().positive().max(1e13).nullable(),
});

const WizardSchema = z.object({
  name: z.string().trim().min(1).max(100),
  regionId: z.string().max(40),
  addressLine: z.string().max(200).nullable(),
  plot: PlotSchema,
  requirements: RequirementsSchema,
  budget: BudgetSchema,
});
export type WizardInput = z.infer<typeof WizardSchema>;

/** Returns concept summaries (and models for preview) — nothing is saved yet. */
export async function generateConceptsAction(input: WizardInput) {
  await requireUser();
  const parsed = WizardSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Some details are missing or invalid." };
  const region = await getRegion(parsed.data.regionId);
  if (!region) return { ok: false as const, error: "That region isn't supported yet." };
  const concepts = await buildConcepts({
    regionId: region.id, plot: parsed.data.plot, requirements: parsed.data.requirements, budget: parsed.data.budget.target,
  });
  return {
    ok: true as const,
    concepts: concepts.map((c) => ({
      key: c.key, name: c.name, strategy: c.strategy, highlights: c.highlights, fit: c.fit,
      model: c.model, total: c.estimate.total, expected: c.estimate.expected, gfa: c.estimate.grossFloorArea,
      rooms: c.model.levels.flatMap((l) => l.rooms).filter((r) => r.type !== "hall").length,
      floors: c.model.levels.length, warnings: c.model.warnings, dataStatus: c.estimate.dataStatus,
      feasible: c.feasible, checks: { errors: c.validation.errors, warnings: c.validation.warnings, total: c.validation.results.length },
    })),
  };
}

export async function createProjectAction(input: WizardInput & { conceptKey: "A" | "B" | "C" }) {
  const user = await requireUser();
  const parsed = WizardSchema.extend({ conceptKey: z.enum(["A", "B", "C"]) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Some details are missing or invalid." };
  const d = parsed.data;
  let project;
  try {
    project = await createProject({
    userId: user.id, name: d.name, regionId: d.regionId, addressLine: d.addressLine, plot: d.plot,
    requirements: d.requirements, budget: d.budget, conceptKey: d.conceptKey, description: d.requirements.notes,
    });
  } catch (e) {
    if (e instanceof InfeasibleConceptError) return { ok: false as const, error: e.message };
    throw e;
  }
  redirect(`/app/projects/${project.id}`);
}

export async function applyOpAction(projectId: string, rawOp: unknown, source?: "edit" | "optimisation" | "assistant") {
  const user = await requireUser();
  const op = ModelOpSchema.safeParse(rawOp);
  if (!op.success) return { ok: false as const, error: "Invalid change." };
  const res = await applyProjectOp(String(projectId), user.id, op.data, source ?? "edit");
  if (res.ok) refresh();
  return res.ok ? { ok: true as const } : res;
}

export async function optimisationAction(projectId: string) {
  const user = await requireUser();
  const project = await getProjectForUser(projectId, user.id);
  if (!project) return [];
  const region = await getRegion(project.regionId);
  const catalog = await getRegionalCatalog(project.regionId);
  if (!region) return [];
  return optimisationOptions(project.model, region, catalog);
}

export async function restoreVersionAction(projectId: string, versionId: string) {
  const user = await requireUser();
  await restoreVersion(projectId, versionId, user.id);
  refresh();
}

export async function assistantAction(projectId: string, message: string) {
  const user = await requireUser();
  const project = await getProjectForUser(projectId, user.id);
  if (!project) return { reply: "Project not found.", proposals: [] };
  const region = await getRegion(project.regionId);
  const catalog = await getRegionalCatalog(project.regionId);
  if (!region) return { reply: "Region data missing.", proposals: [] };
  return interpretRequest(String(message).slice(0, 1000), project.model, region, catalog);
}

export async function requestReviewAction(projectId: string, category: string, message: string) {
  const user = await requireUser();
  if (!user.emailVerifiedAt) return { ok: false as const, error: "Please confirm your email address first — professionals need a verified way to reach you." };
  const project = await getProjectForUser(projectId, user.id);
  const cat = z.enum(["ARCHITECT", "STRUCTURAL_ENGINEER", "MEP_ENGINEER", "QUANTITY_SURVEYOR", "CONTRACTOR", "INTERIOR_DESIGNER", "BUILDER"]).safeParse(category);
  if (!project || !cat.success) return { ok: false as const, error: "Invalid request." };
  await db.reviewRequest.create({
    data: { projectId, requestedById: user.id, category: cat.data, versionId: project.currentVersionId!, message: String(message).slice(0, 2000) },
  });
  refresh();
  return { ok: true as const };
}

export async function renameProjectAction(projectId: string, name: string) {
  const user = await requireUser();
  const n = z.string().trim().min(1).max(100).safeParse(name);
  if (!n.success) return;
  await db.project.updateMany({ where: { id: projectId, ownerId: user.id }, data: { name: n.data } });
  refresh();
}

export async function deleteProjectAction(projectId: string) {
  const user = await requireUser();
  await db.project.deleteMany({ where: { id: projectId, ownerId: user.id } });
  redirect("/app/projects");
}
