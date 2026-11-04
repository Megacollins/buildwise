import "server-only";
import { db } from "./db";
import { NotFoundError } from "./projects";
import type { Comparison } from "@/domain/changes/compare";

/**
 * Owner decisions on agent-proposed changes.
 *
 * This is Buildwise's own approval step, independent of any chat-tool permission prompt:
 * only the signed-in project owner can approve or reject, only while the change is PENDING,
 * and only if the design hasn't moved on since the change was proposed.
 */

export class DecisionError extends Error {}

export async function listChangeRequests(projectId: string, userId: string) {
  const project = await db.project.findFirst({ where: { id: projectId, ownerId: userId }, select: { id: true } });
  if (!project) throw new NotFoundError();
  return db.changeRequest.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 50 });
}

export async function getChangeRequestForOwner(projectId: string, changeId: string, userId: string) {
  const cr = await db.changeRequest.findFirst({
    where: { id: changeId, projectId, project: { ownerId: userId } },
    include: { project: { select: { currentVersionId: true, currency: true } } },
  });
  if (!cr) throw new NotFoundError();
  return { ...cr, comparison: cr.comparison as unknown as Comparison };
}

export async function decideChange(projectId: string, changeId: string, userId: string, decision: "approve" | "reject", note?: string) {
  const cr = await getChangeRequestForOwner(projectId, changeId, userId);
  if (cr.status !== "PENDING") throw new DecisionError(`This change is already ${cr.status.toLowerCase()}.`);
  if (decision === "approve" && cr.project.currentVersionId !== cr.baseVersionId) {
    await db.changeRequest.updateMany({ where: { id: cr.id, status: "PENDING" }, data: { status: "STALE", failureReason: "The design changed before approval." } });
    throw new DecisionError("The design changed after this was proposed, so its comparison is out of date. Ask the agent to propose it again.");
  }
  if (decision === "approve" && !cr.comparison.checks.valid) throw new DecisionError("This change fails the model check and can't be approved.");
  // Conditional update: a second click or a concurrent decision can't overwrite the first.
  const r = await db.changeRequest.updateMany({
    where: { id: cr.id, status: "PENDING" },
    data: { status: decision === "approve" ? "APPROVED" : "REJECTED", decidedById: userId, decidedAt: new Date(), decisionNote: note?.trim().slice(0, 500) || null },
  });
  if (r.count !== 1) throw new DecisionError("This change was decided elsewhere a moment ago.");
}
