import { loadWorkspace } from "@/server/workspace";
import { PlanSheets } from "@/components/drawings/PlanSheets";
import { formatDate } from "@/i18n/format";

export default async function PlansPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, catalog, system, t, bcp47 } = await loadWorkspace(id);
  const site = project.site!;
  return (
    <PlanSheets
      model={project.model}
      projectName={project.name}
      location={`${site.city}, ${site.country}`}
      system={system}
      versionNumber={project.currentVersion!.number}
      versionDate={formatDate(project.currentVersion!.createdAt, bcp47)}
      stageLabel={t(`stage.${project.stage}` as never)}
      materialNames={Object.fromEntries(catalog.map((m) => [m.id, m.name]))}
    />
  );
}
