import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "../db";

/**
 * Agent keys: one revocable key per Switch agent, scoped to ONE project.
 * The full key is shown once at creation; only its SHA-256 hash is stored.
 * A key acts with its project owner's authority over that project only.
 */

const PREFIX = "bwk_";
const KEY_RE = /^bwk_[A-Za-z0-9_-]{32}$/;

export class AgentAuthError extends Error {}

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

async function requireOwnedProject(projectId: string, userId: string) {
  const project = await db.project.findFirst({ where: { id: projectId, ownerId: userId }, select: { id: true } });
  if (!project) throw new AgentAuthError("Project not found.");
  return project;
}

export async function createAgentKey(projectId: string, userId: string, name: string) {
  await requireOwnedProject(projectId, userId);
  const key = PREFIX + randomBytes(24).toString("base64url");
  const row = await db.agentKey.create({
    data: { projectId, name: name.trim().slice(0, 60) || "Switch agent", prefix: key.slice(0, 12), keyHash: hashKey(key), createdById: userId },
  });
  return { id: row.id, name: row.name, prefix: row.prefix, key };
}

export async function listAgentKeys(projectId: string, userId: string) {
  await requireOwnedProject(projectId, userId);
  return db.agentKey.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });
}

export async function revokeAgentKey(projectId: string, keyId: string, userId: string) {
  await requireOwnedProject(projectId, userId);
  const r = await db.agentKey.updateMany({ where: { id: keyId, projectId, revokedAt: null }, data: { revokedAt: new Date() } });
  return r.count === 1;
}

export interface AgentContext {
  keyId: string;
  keyName: string;
  projectId: string;
  /** The project owner: the key acts with this user's authority on this project only */
  ownerId: string;
}

/** Resolves an `Authorization: Bearer bwk_…` header to its project, or throws AgentAuthError. */
export async function authenticateAgent(authorization: string | null): Promise<AgentContext> {
  const m = /^Bearer\s+(\S+)$/.exec(authorization ?? "");
  if (!m || !KEY_RE.test(m[1])) throw new AgentAuthError("Missing or malformed agent key.");
  const row = await db.agentKey.findUnique({
    where: { keyHash: hashKey(m[1]) },
    include: { project: { select: { id: true, ownerId: true } } },
  });
  if (!row || row.revokedAt) throw new AgentAuthError("Invalid or revoked agent key.");
  // Best-effort usage stamp, at most once a minute.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.agentKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  return { keyId: row.id, keyName: row.name, projectId: row.project.id, ownerId: row.project.ownerId };
}
