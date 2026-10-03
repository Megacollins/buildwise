import { loadWorkspace } from "@/server/workspace";
import { MaterialsPicker } from "@/components/project/MaterialsPicker";

export default async function MaterialsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, region, catalog } = await loadWorkspace(id);
  return <MaterialsPicker projectId={project.id} model={project.model} region={region} catalog={catalog} budget={project.budgetTarget} />;
}
