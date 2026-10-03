import { loadWorkspace } from "@/server/workspace";
import { LazyViewer3D } from "@/components/three/LazyViewer";

export default async function ThreeDPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, colors } = await loadWorkspace(id);
  return (
    <div className="space-y-3">
      <div className="h-[calc(100svh-19rem)] min-h-[420px] lg:h-[calc(100vh-15rem)]">
        <LazyViewer3D model={project.model} colors={colors} />
      </div>
      <p className="text-[12.5px] text-muted">
        The 3D model is generated from the same building model as the plans and cost estimate. Materials shown reflect your current selections.
        Colours are representative; textures and lighting are simplified.
      </p>
    </div>
  );
}
