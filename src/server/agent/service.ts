import "server-only";
import { z } from "zod";
import { db } from "../db";
import { getRegion, getRegionalCatalog } from "../catalog";
import { applyProjectOp, buildConcepts, estimateFor, getProjectForUser, StaleVersionError, type ProjectDetail } from "../projects";
import { interpretRequest } from "../assistant";
import type { AgentContext } from "./keys";
import { applyOp, describeOp, ModelOpError, ModelOpSchema, type ModelOp } from "@/domain/model/operations";
import { MODEL_SCHEMA_VERSION } from "@/domain/model/types";
import { COST_ENGINE_VERSION } from "@/domain/cost/engine";
import { RequirementsSchema, type Requirements } from "@/domain/generator/requirements";
import { validateModel } from "@/domain/model/validate";
import { compareSnapshots, type Comparison } from "@/domain/changes/compare";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Project-scoped operations for a Switch agent.
 *
 * Every call is bound to the key's project and runs with the project owner's authority,
 * through the same domain code as the Buildwise editor (applyOp, cost engine, validation).
 * Agents can read and PROPOSE. A change is only applied after the project owner approves
 * it inside Buildwise (signed in) — see src/server/changes.ts.
 */

export class AgentError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

const json = (v: unknown) => v as Prisma.InputJsonValue;
const r2 = (n: number) => Math.round(n * 100) / 100;

async function loadProject(ctx: AgentContext): Promise<ProjectDetail> {
  const project = await getProjectForUser(ctx.projectId, ctx.ownerId);
  if (!project || !project.currentVersionId) throw new AgentError(404, "project_not_found", "The project for this key no longer exists.");
  return project;
}

const links = (base: string, projectId: string) => ({
  overview: `${base}/app/projects/${projectId}`,
  plans: `${base}/app/projects/${projectId}/plans`,
  model3d: `${base}/app/projects/${projectId}/3d`,
  cost: `${base}/app/projects/${projectId}/cost`,
  versions: `${base}/app/projects/${projectId}/versions`,
});

// ---- Read --------------------------------------------------------------------

export async function projectSummary(ctx: AgentContext, base: string) {
  const p = await loadProject(ctx);
  const e = p.estimate, q = e.quantities;
  const report = validateModel(p.model);
  return {
    project: { id: p.id, name: p.name, location: [p.region.city, p.region.country].join(", "), currency: p.currency },
    plot: { widthM: p.site!.plotWidthMm / 1000, depthM: p.site!.plotDepthMm / 1000 },
    budget: { target: p.budgetTarget, max: p.budgetMax },
    requirements: p.requirements,
    currentVersion: { id: p.currentVersion!.id, number: p.currentVersion!.number, label: p.currentVersion!.label },
    style: p.model.meta.style,
    levels: p.model.levels.map((l) => ({
      name: l.name,
      rooms: l.rooms.map((r) => ({ id: r.id, name: r.name, type: r.type, areaM2: r2(r.area), widthM: r2(r.width / 1000), depthM: r2(r.depth / 1000) })),
    })),
    quantities: {
      grossFloorAreaM2: r2(q.grossFloorArea), footprintM2: r2(q.footprintArea), bedrooms: q.bedrooms, bathrooms: q.bathrooms,
      externalWallsM2: r2(q.exteriorWallNetArea), roofM2: r2(q.roofArea), windowsM2: r2(q.windowArea), windowCount: q.windowCount,
    },
    estimate: {
      currency: e.currency, low: r2(e.total[0]), high: r2(e.total[1]), expected: r2(e.expected), dataStatus: e.dataStatus,
      groups: e.groups.slice(0, 6).map((g) => ({ group: g.group, low: r2(g.amount[0]), high: r2(g.amount[1]) })),
    },
    modelCheck: { valid: report.valid, errors: report.issues.filter((i) => i.severity === "error").length, warnings: report.issues.filter((i) => i.severity === "warning").length },
    links: links(base, p.id),
  };
}

const PartialRequirements = RequirementsSchema.partial();

/** Design options for new requirements on this project's plot and region. Nothing is saved. */
export async function previewConcepts(ctx: AgentContext, input: unknown) {
  const p = await loadProject(ctx);
  const requirements = mergeRequirements(p.requirements, input);
  const concepts = await buildConcepts({
    regionId: p.regionId, plot: { width: p.site!.plotWidthMm, depth: p.site!.plotDepthMm, northAngleDeg: p.site!.northAngleDeg },
    requirements, budget: p.budgetTarget,
  });
  return {
    requirements,
    concepts: concepts.map((c) => ({
      key: c.key, name: c.name, strategy: c.strategy, feasible: c.feasible,
      grossFloorAreaM2: r2(c.estimate.grossFloorArea), floors: c.model.levels.length,
      rooms: c.model.levels.flatMap((l) => l.rooms).filter((r) => r.type !== "hall" && r.type !== "stair").length,
      cost: { currency: c.estimate.currency, low: r2(c.estimate.total[0]), high: r2(c.estimate.total[1]), expected: r2(c.estimate.expected) },
      highlights: c.highlights, fit: c.fit,
    })),
    note: "Preview only. To use one, propose it as a change (kind: design) for the owner to approve.",
  };
}

function mergeRequirements(current: Requirements, input: unknown): Requirements {
  const patch = PartialRequirements.safeParse(input ?? {});
  if (!patch.success) throw new AgentError(400, "invalid_requirements", `Invalid requirements: ${patch.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  return RequirementsSchema.parse({ ...current, ...patch.data });
}

/** Turns a plain-language request into validated candidate operations with measured cost impact. */
export async function suggestChanges(ctx: AgentContext, text: string) {
  const p = await loadProject(ctx);
  const region = await getRegion(p.regionId);
  if (!region) throw new AgentError(500, "region_missing", "Region data is missing.");
  const r = await interpretRequest(text.slice(0, 1000), p.model, region, await getRegionalCatalog(p.regionId));
  return {
    reply: r.reply,
    options: r.proposals.map((o) => ({ label: o.label, op: o.op, costDeltaExpected: r2(o.costDelta) })),
    note: "These are candidates. Propose one with propose_change; nothing changes until the owner approves.",
  };
}

// ---- Propose -----------------------------------------------------------------

export const ProposeInput = z.object({
  op: z.unknown().optional(),
  design: z.object({ requirements: z.unknown().optional(), conceptKey: z.enum(["A", "B", "C"]) }).optional(),
  requestText: z.string().max(2000).default(""),
  roomRef: z.string().max(120).optional(),
  idempotencyKey: z.string().min(8).max(100).optional(),
}).refine((v) => (v.op === undefined) !== (v.design === undefined), "Provide exactly one of op or design.");

/** Canonical JSON with sorted keys, so equal payloads compare equal. */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]));
  return v;
}

function changeView(cr: { id: string; status: string; kind: string; summary: string; createdAt: Date; decidedAt: Date | null; decisionNote: string | null; appliedVersionId: string | null; failureReason: string | null; comparison: unknown; baseVersionId: string }, base: string, projectId: string) {
  return {
    id: cr.id, status: cr.status, kind: cr.kind, summary: cr.summary, createdAt: cr.createdAt.toISOString(),
    baseVersionId: cr.baseVersionId, decidedAt: cr.decidedAt?.toISOString() ?? null, decisionNote: cr.decisionNote,
    appliedVersionId: cr.appliedVersionId, failureReason: cr.failureReason,
    comparison: cr.comparison as unknown as Comparison,
    approvalUrl: `${base}/app/projects/${projectId}/changes/${cr.id}`,
  };
}

/**
 * Validates a change against the current design and records it as PENDING with a genuine
 * before/after comparison. Refused changes are not recorded. Repeats are de-duplicated.
 */
export async function proposeChange(ctx: AgentContext, base: string, input: unknown) {
  const parsed = ProposeInput.safeParse(input);
  if (!parsed.success) throw new AgentError(400, "invalid_request", parsed.error.issues.map((i) => i.message).join("; "));
  const { op: rawOp, design, requestText, roomRef, idempotencyKey } = parsed.data;
  const p = await loadProject(ctx);
  const baseVersionId = p.currentVersionId!;

  let kind: "op" | "design", payload: unknown, summary: string;
  let after: { model: ProjectDetail["model"]; estimate: ProjectDetail["estimate"] };
  if (rawOp !== undefined) {
    const op = ModelOpSchema.safeParse(rawOp);
    if (!op.success) throw new AgentError(400, "invalid_operation", `Not a supported operation: ${op.error.issues.slice(0, 2).map((i) => `${i.path.join(".") || "op"} ${i.message}`).join("; ")}`);
    const catalog = await getRegionalCatalog(p.regionId);
    const sel = op.data;
    if (sel.kind === "selection") {
      const m = catalog.find((x) => x.id === sel.materialId);
      if (!m || m.category !== sel.category) throw new AgentError(422, "operation_refused", "That material isn't available for this category in this region.");
    }
    let model;
    try {
      model = applyOp(p.model, op.data);
    } catch (e) {
      if (e instanceof ModelOpError) throw new AgentError(422, "operation_refused", e.message);
      throw e;
    }
    after = { model, estimate: await estimateFor(model, p.regionId) };
    kind = "op"; payload = canonical(op.data);
    summary = describeOp(op.data, p.model, (id) => catalog.find((m) => m.id === id)?.name);
  } else {
    const requirements = mergeRequirements(p.requirements, design!.requirements);
    const concepts = await buildConcepts({
      regionId: p.regionId, plot: { width: p.site!.plotWidthMm, depth: p.site!.plotDepthMm, northAngleDeg: p.site!.northAngleDeg },
      requirements, budget: p.budgetTarget,
    });
    const c = concepts.find((x) => x.key === design!.conceptKey)!;
    if (!c.feasible) throw new AgentError(422, "operation_refused", `Concept ${c.key} doesn't fit this plot: ${c.fit[0] ?? "it fails the model check."}`);
    after = { model: c.model, estimate: c.estimate };
    kind = "design"; payload = canonical({ requirements, conceptKey: c.key });
    summary = `New design: concept ${c.key} — ${c.name} (${requirements.bedrooms} bed, ${requirements.bathrooms} bath, ${requirements.floors} floor${requirements.floors > 1 ? "s" : ""})`;
  }

  const comparison = compareSnapshots({ model: p.model, estimate: p.estimate }, after);
  if (!comparison.checks.valid) throw new AgentError(422, "operation_refused", `The change would make the design invalid: ${comparison.checks.errors[0]}`);

  // Same idempotency key → same change request (and a conflict if the content differs).
  if (idempotencyKey) {
    const prior = await db.changeRequest.findUnique({ where: { projectId_idempotencyKey: { projectId: p.id, idempotencyKey } } });
    if (prior) {
      if (JSON.stringify(canonical(prior.payload)) !== JSON.stringify(payload) || prior.kind !== kind) {
        throw new AgentError(409, "idempotency_conflict", "This idempotency key was already used for a different change.");
      }
      return { duplicate: true, change: changeView(prior, base, p.id) };
    }
  }
  // The same change against the same design, still open → return it instead of a second copy.
  const open = await db.changeRequest.findFirst({
    where: { projectId: p.id, baseVersionId, kind, status: { in: ["PENDING", "APPROVED"] }, payload: { equals: json(payload) } },
  });
  if (open) return { duplicate: true, change: changeView(open, base, p.id) };

  try {
    const cr = await db.changeRequest.create({
      data: {
        projectId: p.id, kind, payload: json(payload), summary: summary.slice(0, 200), requestText,
        requestedVia: "switch", roomRef: roomRef ?? null, agentKeyId: ctx.keyId, idempotencyKey: idempotencyKey ?? null,
        baseVersionId, comparison: json(comparison),
      },
    });
    return { duplicate: false, change: changeView(cr, base, p.id) };
  } catch (e) {
    // Concurrent duplicate with the same idempotency key.
    if (idempotencyKey && (e as { code?: string }).code === "P2002") {
      const prior = await db.changeRequest.findUniqueOrThrow({ where: { projectId_idempotencyKey: { projectId: p.id, idempotencyKey } } });
      return { duplicate: true, change: changeView(prior, base, p.id) };
    }
    throw e;
  }
}

export async function getChange(ctx: AgentContext, base: string, changeId: string) {
  const cr = await db.changeRequest.findFirst({ where: { id: changeId, projectId: ctx.projectId } });
  if (!cr) throw new AgentError(404, "change_not_found", "No such change request on this project.");
  return changeView(cr, base, ctx.projectId);
}

export async function listChanges(ctx: AgentContext, base: string) {
  const rows = await db.changeRequest.findMany({ where: { projectId: ctx.projectId }, orderBy: { createdAt: "desc" }, take: 10 });
  return rows.map((cr) => ({ ...changeView(cr, base, ctx.projectId), comparison: undefined, costDelta: (cr.comparison as unknown as Comparison).cost.delta }));
}

// ---- Apply (only after the owner approved in Buildwise) -----------------------

/** The saved version, by its number as people see it in Buildwise. */
async function versionView(versionId: string | null, base: string, projectId: string) {
  if (!versionId) return null;
  const v = await db.designVersion.findUnique({ where: { id: versionId }, select: { id: true, number: true, label: true } });
  return v && { ...v, historyUrl: `${base}/app/projects/${projectId}/versions` };
}

/**
 * Applies an APPROVED change. Safe to repeat: an applied change returns its version.
 * Refuses anything not approved by the owner, and anything computed against a design
 * that has since changed (STALE). A failure records why and changes nothing.
 */
export async function applyChange(ctx: AgentContext, base: string, changeId: string) {
  const cr = await db.changeRequest.findFirst({ where: { id: changeId, projectId: ctx.projectId } });
  if (!cr) throw new AgentError(404, "change_not_found", "No such change request on this project.");
  if (cr.status === "APPLIED") return { alreadyApplied: true, change: changeView(cr, base, ctx.projectId), version: await versionView(cr.appliedVersionId, base, ctx.projectId) };
  if (cr.status !== "APPROVED") {
    const why: Record<string, string> = {
      PENDING: "The project owner hasn't approved this change in Buildwise yet.",
      REJECTED: "The project owner rejected this change.",
      STALE: "The design changed after this was proposed. Propose it again against the current design.",
      FAILED: `This change failed to apply: ${cr.failureReason ?? "unknown reason"}.`,
      APPLYING: "This change is being applied right now.",
    };
    throw new AgentError(409, `not_applicable_${cr.status.toLowerCase()}`, why[cr.status] ?? "This change can't be applied.");
  }

  // Claim it, so two simultaneous apply calls can't both run.
  const claimed = await db.changeRequest.updateMany({ where: { id: cr.id, status: "APPROVED" }, data: { status: "APPLYING" } });
  if (claimed.count !== 1) {
    const change = await getChange(ctx, base, cr.id);
    return { alreadyApplied: change.status === "APPLIED", change, version: await versionView(change.appliedVersionId, base, ctx.projectId) };
  }

  const finish = (data: Prisma.ChangeRequestUpdateInput) => db.changeRequest.update({ where: { id: cr.id }, data });
  try {
    const p = await loadProject(ctx);
    if (p.currentVersionId !== cr.baseVersionId) {
      await finish({ status: "STALE", failureReason: "The design changed after this was proposed." });
      throw new AgentError(409, "stale", "The design changed after this was proposed. Propose it again against the current design.");
    }
    let versionId: string;
    if (cr.kind === "op") {
      const op = ModelOpSchema.parse(cr.payload) as ModelOp;
      const res = await applyProjectOp(p.id, ctx.ownerId, op, "switch", `Approved change: ${cr.summary}`.slice(0, 180), { fold: false, expectedVersionId: cr.baseVersionId });
      if (!res.ok) {
        await finish({ status: "FAILED", failureReason: res.error });
        throw new AgentError(422, "apply_failed", res.error);
      }
      versionId = res.versionId;
    } else {
      versionId = await applyDesign(p, ctx.ownerId, cr.payload as { requirements: Requirements; conceptKey: "A" | "B" | "C" }, cr.summary, cr.baseVersionId);
    }
    const done = await finish({ status: "APPLIED", appliedVersionId: versionId, failureReason: null });
    return { alreadyApplied: false, change: changeView(done, base, ctx.projectId), version: await versionView(versionId, base, ctx.projectId) };
  } catch (e) {
    if (e instanceof StaleVersionError) {
      await finish({ status: "STALE", failureReason: "Another change was saved at the same time." });
      throw new AgentError(409, "stale", "Another change was saved at the same time. Propose it again against the current design.");
    }
    if (e instanceof AgentError) throw e;
    await finish({ status: "FAILED", failureReason: "Unexpected error while applying." }).catch(() => undefined);
    throw e;
  }
}

/** Saves a regenerated concept as a new version (deterministic: same inputs → same design). */
async function applyDesign(p: ProjectDetail, ownerId: string, payload: { requirements: Requirements; conceptKey: "A" | "B" | "C" }, summary: string, baseVersionId: string) {
  const requirements = RequirementsSchema.parse(payload.requirements);
  const concepts = await buildConcepts({
    regionId: p.regionId, plot: { width: p.site!.plotWidthMm, depth: p.site!.plotDepthMm, northAngleDeg: p.site!.northAngleDeg },
    requirements, budget: p.budgetTarget,
  });
  const c = concepts.find((x) => x.key === payload.conceptKey)!;
  if (!c.feasible) throw new AgentError(422, "apply_failed", "The concept no longer fits this plot.");
  return db.$transaction(async (tx) => {
    const latest = await tx.designVersion.findFirst({ where: { projectId: p.id }, orderBy: { number: "desc" }, select: { number: true } });
    const v = await tx.designVersion.create({
      data: {
        projectId: p.id, number: (latest?.number ?? 0) + 1, label: `Approved change: ${summary}`.slice(0, 180), source: "switch",
        parentId: baseVersionId, model: json(c.model), modelSchemaVersion: MODEL_SCHEMA_VERSION,
        estimate: json(c.estimate), costEngineVersion: COST_ENGINE_VERSION,
        estimateLow: c.estimate.total[0], estimateHigh: c.estimate.total[1], grossFloorAreaM2: c.estimate.grossFloorArea, createdById: ownerId,
      },
    });
    const moved = await tx.project.updateMany({ where: { id: p.id, currentVersionId: baseVersionId }, data: { currentVersionId: v.id, requirements: json(requirements) } });
    if (moved.count !== 1) throw new StaleVersionError();
    return v.id;
  });
}
