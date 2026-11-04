import { loadWorkspace } from "@/server/workspace";
import { db } from "@/server/db";
import { VersionList, type VersionRow } from "@/components/project/VersionList";
import type { BuildingModel } from "@/domain/model/types";
import type { Comparison } from "@/domain/changes/compare";
import { AgentPanel } from "@/components/project/AgentPanel";
import { listAgentKeys } from "@/server/agent/keys";

export default async function VersionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, user } = await loadWorkspace(id); // enforces ownership
  const [rows, keys, changes] = await Promise.all([
    db.designVersion.findMany({ where: { projectId: project.id }, orderBy: { number: "desc" } }),
    listAgentKeys(project.id, user.id),
    db.changeRequest.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const versions: VersionRow[] = rows.map((v) => {
    const m = v.model as unknown as BuildingModel;
    const rooms = m.levels.flatMap((l) => l.rooms).filter((r) => r.type !== "hall");
    return {
      id: v.id, number: v.number, label: v.label, source: v.source, createdAt: v.createdAt,
      estimate: [Number(v.estimateLow), Number(v.estimateHigh)], grossFloorAreaM2: v.grossFloorAreaM2,
      current: v.id === project.currentVersionId, rooms: rooms.length,
      bedrooms: rooms.filter((r) => r.type.includes("bedroom")).length, roof: m.roof.type,
    };
  });
  return (
    <>
      <VersionList projectId={project.id} versions={versions} currency={project.currency} />
      <AgentPanel projectId={project.id} keys={keys} currency={project.currency}
        changes={changes.map((c) => ({ id: c.id, summary: c.summary, status: c.status, createdAt: c.createdAt, costDelta: (c.comparison as unknown as Comparison).cost.delta }))} />
    </>
  );
}
