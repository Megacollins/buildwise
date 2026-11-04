import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../db";
import { createProject, getProjectForUser } from "../projects";
import { authenticateAgent, createAgentKey, revokeAgentKey, type AgentContext } from "./keys";
import { AgentError, applyChange, getChange, previewConcepts, projectSummary, proposeChange, suggestChanges } from "./service";
import { decideChange, DecisionError } from "../changes";
import { NotFoundError } from "../projects";
import { SAMPLE_PROJECTS } from "@/data/sample-projects";

/**
 * Integration tests for the Switch agent flow against the local dev database
 * (npm run test:db). They create their own users and projects and delete them afterwards.
 */
const url = new URL(process.env.DATABASE_URL ?? "postgres://missing");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("test:db only runs against a local database.");

const BASE = "http://buildwise.test";
const sp = SAMPLE_PROJECTS.find((p) => p.regionId === "ng-la-lagos")!;
const userIds: string[] = [];

async function makeOwner(tag: string) {
  const u = await db.user.create({ data: { email: `agent-test-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, name: "Agent test" } });
  userIds.push(u.id);
  const project = await createProject({
    userId: u.id, name: `Agent test ${tag}`, regionId: sp.regionId, plot: sp.plot, requirements: sp.requirements,
    budget: { target: sp.budget.target, min: null, max: null }, conceptKey: sp.conceptKey,
  });
  const { key } = await createAgentKey(project.id, u.id, "test agent");
  const ctx = await authenticateAgent(`Bearer ${key}`);
  return { userId: u.id, projectId: project.id, key, ctx };
}

const current = async (projectId: string, userId: string) => (await getProjectForUser(projectId, userId))!;
const versionCount = (projectId: string) => db.designVersion.count({ where: { projectId } });
async function errorOf(p: Promise<unknown>) {
  try { await p; } catch (e) { return e as AgentError; }
  throw new Error("expected a rejection");
}
async function masterBedroom(o: { projectId: string; userId: string }) {
  const p = await current(o.projectId, o.userId);
  return p.model.levels.flatMap((l) => l.rooms).find((r) => r.type === "master_bedroom")!;
}

let A: Awaited<ReturnType<typeof makeOwner>>;
let B: Awaited<ReturnType<typeof makeOwner>>;

beforeAll(async () => {
  A = await makeOwner("a");
  B = await makeOwner("b");
});

afterAll(async () => {
  await db.project.deleteMany({ where: { ownerId: { in: userIds } } });
  await db.designVersion.deleteMany({ where: { createdById: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("agent authentication", () => {
  it("rejects missing, malformed, unknown and revoked keys", async () => {
    await expect(authenticateAgent(null)).rejects.toThrow(/Missing or malformed/);
    await expect(authenticateAgent("Bearer nope")).rejects.toThrow(/Missing or malformed/);
    await expect(authenticateAgent(`Bearer bwk_${"x".repeat(32)}`)).rejects.toThrow(/Invalid or revoked/);
    const { id, key } = await createAgentKey(A.projectId, A.userId, "short-lived");
    await expect(authenticateAgent(`Bearer ${key}`)).resolves.toMatchObject({ projectId: A.projectId, ownerId: A.userId });
    expect(await revokeAgentKey(A.projectId, id, A.userId)).toBe(true);
    await expect(authenticateAgent(`Bearer ${key}`)).rejects.toThrow(/Invalid or revoked/);
  });

  it("only lets a project's owner create keys for it", async () => {
    await expect(createAgentKey(A.projectId, B.userId, "intruder")).rejects.toThrow(/Project not found/);
  });

  it("scopes a key to its own project", async () => {
    const { change } = await proposeChange(A.ctx, BASE, { op: { kind: "glazing", factor: 1.25 }, requestText: "more glazing" });
    const e = await errorOf(getChange(B.ctx, BASE, change.id));
    expect(e).toBeInstanceOf(AgentError);
    expect(e.status).toBe(404);
    expect((await errorOf(applyChange(B.ctx, BASE, change.id))).status).toBe(404);
    // A key can't be pointed at another project by tampering with its context lookup.
    const forged: AgentContext = { ...B.ctx, projectId: A.projectId };
    await expect(projectSummary(forged, BASE)).rejects.toMatchObject({ status: 404 });
  });
});

describe("reading and suggesting", () => {
  it("summarises the project from the stored design and estimate", async () => {
    const s = await projectSummary(A.ctx, BASE);
    const p = await current(A.projectId, A.userId);
    expect(s.estimate.expected).toBeCloseTo(p.estimate.expected, 1);
    expect(s.links.versions).toBe(`${BASE}/app/projects/${A.projectId}/versions`);
  });

  it("previews concepts for changed requirements without saving anything", async () => {
    const before = await versionCount(A.projectId);
    const r = await previewConcepts(A.ctx, { bedrooms: sp.requirements.bedrooms + 1 });
    expect(r.requirements.bedrooms).toBe(sp.requirements.bedrooms + 1);
    expect(r.concepts).toHaveLength(3);
    expect(await versionCount(A.projectId)).toBe(before);
    await expect(previewConcepts(A.ctx, { bedrooms: "lots" })).rejects.toMatchObject({ status: 400, code: "invalid_requirements" });
  });

  it("turns a plain request into validated operations", async () => {
    const r = await suggestChanges(A.ctx, "make the master bedroom bigger");
    expect(r.options.length).toBeGreaterThan(0);
  });
});

describe("proposing changes", () => {
  it("refuses unsupported or invalid operations and records nothing", async () => {
    const count = () => db.changeRequest.count({ where: { projectId: A.projectId } });
    const n = await count();
    expect(await errorOf(proposeChange(A.ctx, BASE, { op: { kind: "addSwimmingPoolOnRoof" } }))).toMatchObject({ status: 400, code: "invalid_operation" });
    expect(await errorOf(proposeChange(A.ctx, BASE, { op: { kind: "resizeRoom", roomId: "no-such-room", axis: "width", delta: 500 } }))).toMatchObject({ status: 422, code: "operation_refused" });
    expect(await errorOf(proposeChange(A.ctx, BASE, { op: { kind: "selection", category: "flooring", materialId: "not-a-material" } }))).toMatchObject({ status: 422 });
    expect(await errorOf(proposeChange(A.ctx, BASE, {}))).toMatchObject({ status: 400 });
    expect(await count()).toBe(n);
  });

  it("records a pending change with the engine's real before/after cost", async () => {
    const room = await masterBedroom(A);
    const p = await current(A.projectId, A.userId);
    const { change, duplicate } = await proposeChange(A.ctx, BASE, { op: { kind: "resizeRoom", roomId: room.id, axis: "width", delta: 600 }, requestText: "bigger master" });
    expect(duplicate).toBe(false);
    expect(change.status).toBe("PENDING");
    expect(change.baseVersionId).toBe(p.currentVersionId);
    expect(change.comparison.cost.before.expected).toBeCloseTo(p.estimate.expected, 1);
    // The delta is whatever the engine says (resizing can shrink neighbours and lower the cost).
    expect(change.comparison.cost.delta).toBeCloseTo(change.comparison.cost.after.expected - change.comparison.cost.before.expected, 1);
    expect(Math.abs(change.comparison.cost.delta)).toBeGreaterThan(0);
    expect(change.comparison.rooms.find((r) => r.id === room.id)?.delta).toBeGreaterThan(0);
    expect(change.approvalUrl).toBe(`${BASE}/app/projects/${A.projectId}/changes/${change.id}`);
  });

  it("de-duplicates repeated proposals and idempotency keys", async () => {
    const room = await masterBedroom(A);
    const op = { kind: "resizeRoom", roomId: room.id, axis: "width", delta: 300 };
    const first = await proposeChange(A.ctx, BASE, { op, idempotencyKey: "dup-test-0001" });
    const again = await proposeChange(A.ctx, BASE, { op, idempotencyKey: "dup-test-0001" });
    expect(again).toMatchObject({ duplicate: true, change: { id: first.change.id } });
    // Same content, different key order and no idempotency key → still the open request.
    const reordered = await proposeChange(A.ctx, BASE, { op: { delta: 300, axis: "width", roomId: room.id, kind: "resizeRoom" } });
    expect(reordered.change.id).toBe(first.change.id);
    // The key can't be reused for a different change.
    expect(await errorOf(proposeChange(A.ctx, BASE, { op: { ...op, delta: 900 }, idempotencyKey: "dup-test-0001" }))).toMatchObject({ status: 409, code: "idempotency_conflict" });
  });
});

describe("approval and application", () => {
  it("cannot apply without the owner's approval in Buildwise", async () => {
    const before = await current(A.projectId, A.userId);
    const { change } = await proposeChange(A.ctx, BASE, { op: { kind: "glazing", factor: 1.3 } });
    expect(await errorOf(applyChange(A.ctx, BASE, change.id))).toMatchObject({ status: 409, code: "not_applicable_pending" });
    // Someone else can't approve it.
    await expect(decideChange(A.projectId, change.id, B.userId, "approve")).rejects.toBeInstanceOf(NotFoundError);
    // Rejected stays unappliable.
    await decideChange(A.projectId, change.id, A.userId, "reject", "not now");
    expect(await errorOf(applyChange(A.ctx, BASE, change.id))).toMatchObject({ code: "not_applicable_rejected" });
    await expect(decideChange(A.projectId, change.id, A.userId, "approve")).rejects.toBeInstanceOf(DecisionError);
    expect((await current(A.projectId, A.userId)).currentVersionId).toBe(before.currentVersionId);
  });

  it("applies an approved change exactly once as a new labelled version", async () => {
    const room = await masterBedroom(A);
    const { change } = await proposeChange(A.ctx, BASE, { op: { kind: "resizeRoom", roomId: room.id, axis: "width", delta: 600 } });
    await decideChange(A.projectId, change.id, A.userId, "approve", "fine");
    const versions = await versionCount(A.projectId);
    // Two simultaneous apply calls: only one new version.
    const [r1, r2] = await Promise.all([applyChange(A.ctx, BASE, change.id), applyChange(A.ctx, BASE, change.id).catch((e) => e)]);
    expect(r1.change.status).toBe("APPLIED");
    expect(await versionCount(A.projectId)).toBe(versions + 1);
    expect(r2 instanceof AgentError ? r2.code : r2 instanceof Error ? "unexpected" : "ok").not.toBe("unexpected");

    const p = await current(A.projectId, A.userId);
    expect(p.currentVersionId).toBe(r1.change.appliedVersionId);
    expect(p.currentVersion!.label).toMatch(/^Approved change: /);
    expect(p.currentVersion!.source).toBe("switch");
    expect(r1.version).toMatchObject({ id: p.currentVersionId, number: p.currentVersion!.number });
    // The saved estimate is the one the owner approved.
    expect(p.estimate.expected).toBeCloseTo(change.comparison.cost.after.expected, 1);
    // Repeating the call is harmless.
    const again = await applyChange(A.ctx, BASE, change.id);
    expect(again).toMatchObject({ alreadyApplied: true, change: { appliedVersionId: p.currentVersionId } });
    expect(await versionCount(A.projectId)).toBe(versions + 1);
  });

  it("marks a change stale when the design moved on, and won't apply it", async () => {
    const room = await masterBedroom(A);
    const one = (await proposeChange(A.ctx, BASE, { op: { kind: "resizeRoom", roomId: room.id, axis: "depth", delta: -200 } })).change;
    const two = (await proposeChange(A.ctx, BASE, { op: { kind: "glazing", factor: 1.2 } })).change;
    await decideChange(A.projectId, one.id, A.userId, "approve");
    await decideChange(A.projectId, two.id, A.userId, "approve");
    await applyChange(A.ctx, BASE, one.id);
    const head = (await current(A.projectId, A.userId)).currentVersionId;
    expect(await errorOf(applyChange(A.ctx, BASE, two.id))).toMatchObject({ status: 409, code: "stale" });
    expect((await getChange(A.ctx, BASE, two.id)).status).toBe("STALE");
    expect((await current(A.projectId, A.userId)).currentVersionId).toBe(head);

    // Approving after the design moved on is refused too.
    const three = (await proposeChange(A.ctx, BASE, { op: { kind: "glazing", factor: 0.9 } })).change;
    const four = (await proposeChange(A.ctx, BASE, { op: { kind: "glazing", factor: 1.1 } })).change;
    await decideChange(A.projectId, three.id, A.userId, "approve");
    await applyChange(A.ctx, BASE, three.id);
    await expect(decideChange(A.projectId, four.id, A.userId, "approve")).rejects.toThrow(/changed after this was proposed/);
    expect((await getChange(A.ctx, BASE, four.id)).status).toBe("STALE");
  });

  it("records a failed application and leaves the design untouched", async () => {
    const { change } = await proposeChange(A.ctx, BASE, { op: { kind: "glazing", factor: 1.15 } });
    await decideChange(A.projectId, change.id, A.userId, "approve");
    // Simulate the stored operation no longer being applicable (e.g. the room it targets is gone).
    await db.changeRequest.update({ where: { id: change.id }, data: { payload: { kind: "resizeRoom", roomId: "deleted-room", axis: "width", delta: 500 } } });
    const head = (await current(A.projectId, A.userId)).currentVersionId;
    const versions = await versionCount(A.projectId);
    expect(await errorOf(applyChange(A.ctx, BASE, change.id))).toMatchObject({ status: 422, code: "apply_failed" });
    const after = await getChange(A.ctx, BASE, change.id);
    expect(after.status).toBe("FAILED");
    expect(after.failureReason).toBeTruthy();
    expect((await current(A.projectId, A.userId)).currentVersionId).toBe(head);
    expect(await versionCount(A.projectId)).toBe(versions);
    expect(await errorOf(applyChange(A.ctx, BASE, change.id))).toMatchObject({ code: "not_applicable_failed" });
  });

  it("applies an approved new design generated from changed requirements", async () => {
    const bedrooms = sp.requirements.bedrooms + 1;
    const preview = await previewConcepts(B.ctx, { bedrooms });
    const pick = preview.concepts.find((c) => c.feasible)!;
    const { change } = await proposeChange(B.ctx, BASE, { design: { requirements: { bedrooms }, conceptKey: pick.key }, requestText: "add a bedroom" });
    expect(change.kind).toBe("design");
    expect(change.comparison.cost.after.expected).toBeCloseTo(pick.cost.expected, 1);
    await decideChange(B.projectId, change.id, B.userId, "approve");
    const r = await applyChange(B.ctx, BASE, change.id);
    const p = await current(B.projectId, B.userId);
    expect(p.currentVersionId).toBe(r.change.appliedVersionId);
    expect(p.requirements.bedrooms).toBe(bedrooms);
    expect(p.estimate.expected).toBeCloseTo(pick.cost.expected, 1);
  });
});
