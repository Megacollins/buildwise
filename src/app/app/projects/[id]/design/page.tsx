import { loadWorkspace } from "@/server/workspace";
import { DesignEditor } from "@/components/project/DesignEditor";

export default async function DesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await loadWorkspace(id);
  return <DesignEditor projectId={project.id} model={project.model} currency={project.currency} total={project.estimate.total} budget={project.budgetTarget} />;
}
