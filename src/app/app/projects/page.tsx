import type { Metadata } from "next";
import { Plus, FolderKanban } from "lucide-react";
import { requireUser } from "@/server/auth";
import { listProjectsForUser } from "@/server/projects";
import { getI18n, getMeasurementSystem } from "@/server/i18n";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { ProjectCard } from "@/components/project/ProjectCard";

export const metadata: Metadata = { title: "My Projects" };

export default async function ProjectsPage() {
  const user = await requireUser();
  const { t, bcp47 } = await getI18n();
  const system = await getMeasurementSystem();
  const projects = await listProjectsForUser(user.id);
  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader title={t("nav.projects")} subtitle={`${projects.length} project${projects.length === 1 ? "" : "s"}`}
        actions={<LinkButton href="/app/new" variant="primary"><Plus className="size-4" aria-hidden />{t("dash.create")}</LinkButton>} />
      {projects.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => <ProjectCard key={p.id} p={p} system={system} bcp47={bcp47} t={t} />)}
        </div>
      ) : (
        <EmptyState icon={<FolderKanban className="size-8" />} title={t("dash.empty")} action={<LinkButton href="/app/new" variant="primary">{t("dash.create")}</LinkButton>} />
      )}
    </main>
  );
}
