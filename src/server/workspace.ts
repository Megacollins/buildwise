import "server-only";
import { notFound } from "next/navigation";
import { requireUser } from "./auth";
import { getProjectForUser } from "./projects";
import { getRegion, getRegionalCatalog } from "./catalog";
import { getI18n, getMeasurementSystem } from "./i18n";
import { selectionColors } from "@/domain/materials/colors";

/** Everything a project workspace page needs, with ownership enforced. */
export async function loadWorkspace(projectId: string) {
  const user = await requireUser();
  const project = await getProjectForUser(projectId, user.id);
  if (!project) notFound();
  const [region, catalog, i18n, system] = await Promise.all([
    getRegion(project.regionId), getRegionalCatalog(project.regionId), getI18n(), getMeasurementSystem(),
  ]);
  if (!region) notFound();
  return { user, project, region, catalog, colors: selectionColors(project.model, catalog), system, ...i18n };
}
