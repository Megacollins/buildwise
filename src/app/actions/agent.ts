"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/server/auth";
import { createAgentKey, revokeAgentKey } from "@/server/agent/keys";
import { decideChange, DecisionError } from "@/server/changes";
import { NotFoundError } from "@/server/projects";
import { consumeRateLimit } from "@/server/rate-limit";

/** Creates a project-scoped key for a Switch agent. The key is returned once and never stored. */
export async function createAgentKeyAction(projectId: string, name: string) {
  const user = await requireUser();
  const rl = await consumeRateLimit(`agent-key:${user.id}`, 10, 3600);
  if (!rl.ok) return { ok: false as const, error: "Too many keys created recently. Try again later." };
  try {
    const k = await createAgentKey(String(projectId), user.id, String(name ?? ""));
    refresh();
    return { ok: true as const, key: k.key, prefix: k.prefix };
  } catch {
    return { ok: false as const, error: "Project not found." };
  }
}

export async function revokeAgentKeyAction(projectId: string, keyId: string) {
  const user = await requireUser();
  await revokeAgentKey(String(projectId), String(keyId), user.id).catch(() => false);
  refresh();
}

/** The owner's approval or rejection. Approval here is what allows an agent to apply a change. */
export async function decideChangeAction(projectId: string, changeId: string, decision: "approve" | "reject", note?: string) {
  const user = await requireUser();
  if (decision !== "approve" && decision !== "reject") return { ok: false as const, error: "Invalid decision." };
  try {
    await decideChange(String(projectId), String(changeId), user.id, decision, note ? String(note) : undefined);
    refresh();
    return { ok: true as const };
  } catch (e) {
    if (e instanceof DecisionError) { refresh(); return { ok: false as const, error: e.message }; }
    if (e instanceof NotFoundError) return { ok: false as const, error: "Change not found." };
    throw e;
  }
}
