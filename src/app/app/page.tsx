import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ArrowRight, LayoutGrid, Box, Calculator, Palette, Clock } from "lucide-react";
import { requireUser } from "@/server/auth";
import { listProjectsForUser } from "@/server/projects";
import { getI18n, getMeasurementSystem } from "@/server/i18n";
import { Card, CardHeader, EmptyState, LinkButton, Notice, PageHeader } from "@/components/ui";
import { ProjectCard } from "@/components/project/ProjectCard";
import { BudgetBadge } from "@/components/project/BudgetBadge";
import { formatMoney, formatMoneyRange, formatDateTime } from "@/i18n/format";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Home" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const user = await requireUser();
  const { t, bcp47 } = await getI18n();
  const system = await getMeasurementSystem();
  const projects = await listProjectsForUser(user.id);
  const latest = projects[0];
  const recentVersions = await db.designVersion.findMany({
    where: { project: { ownerId: user.id } }, orderBy: { createdAt: "desc" }, take: 5,
    select: { id: true, label: true, number: true, createdAt: true, project: { select: { id: true, name: true } } },
  });

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-8 sm:py-10">
      {notice === "password-reset" && <Notice tone="ok" title="Password updated">You’re signed in, and all other devices have been signed out.</Notice>}
      <PageHeader
        title={t("dash.greeting", { name: user.name.split(" ")[0] })}
        subtitle={t("dash.sub")}
        actions={<LinkButton href="/app/new" variant="primary"><Plus className="size-4" aria-hidden />{t("dash.create")}</LinkButton>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Link href="/app/new" className="group relative overflow-hidden rounded-xl border border-accent/30 bg-accent-soft p-6 transition-colors hover:border-accent/60">
          <div className="grid-texture absolute inset-0 opacity-40" aria-hidden />
          <div className="relative">
            <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-ink"><Plus className="size-5" aria-hidden /></div>
            <h2 className="mt-5 font-display text-lg font-semibold">{t("dash.create")}</h2>
            <p className="mt-1 text-[13.5px] text-muted">{t("dash.createSub")}</p>
            <span className="mt-5 inline-flex items-center gap-1 text-[13px] font-medium text-accent-strong">Start <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden /></span>
          </div>
        </Link>

        {latest ? (
          <Card className="lg:col-span-2">
            <CardHeader title={t("dash.continue")} subtitle={`${latest.name} · ${latest.city}, ${latest.country}`}
              action={<LinkButton href={`/app/projects/${latest.id}`} size="sm" variant="secondary">{t("common.open")}</LinkButton>} />
            <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto]">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <div className="text-[11.5px] uppercase tracking-wide text-faint">{t("dash.estimated")}</div>
                  <div className="mt-1 font-display text-lg font-semibold tabular">{latest.estimate ? formatMoneyRange(latest.estimate, latest.currency, bcp47) : "—"}</div>
                </div>
                <div>
                  <div className="text-[11.5px] uppercase tracking-wide text-faint">{t("dash.budget")}</div>
                  <div className="mt-1 font-display text-lg font-semibold tabular">{latest.budgetTarget ? formatMoney(latest.budgetTarget, latest.currency, bcp47, { compact: true }) : "—"}</div>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <div className="text-[11.5px] uppercase tracking-wide text-faint">{t("ws.budgetStatus")}</div>
                  <div className="mt-1.5">{latest.estimate && <BudgetBadge estimate={latest.estimate} budget={latest.budgetTarget} currency={latest.currency} bcp47={bcp47} t={t} showAmount />}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:flex-col">
                {[
                  { href: "plans", icon: LayoutGrid, label: t("ws.plans") },
                  { href: "3d", icon: Box, label: t("ws.3d") },
                  { href: "materials", icon: Palette, label: t("ws.materials") },
                  { href: "cost", icon: Calculator, label: t("ws.cost") },
                ].map((q) => (
                  <LinkButton key={q.href} href={`/app/projects/${latest.id}/${q.href}`} size="sm" variant="ghost" className="justify-start">
                    <q.icon className="size-4" aria-hidden /> {q.label}
                  </LinkButton>
                ))}
              </div>
            </div>
          </Card>
        ) : (
          <div className="lg:col-span-2"><EmptyState title={t("dash.empty")} action={<LinkButton href="/app/new" variant="primary">{t("dash.create")}</LinkButton>} /></div>
        )}
      </div>

      {projects.length > 0 && (
        <section aria-labelledby="recent">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="recent" className="font-display text-lg font-semibold">{t("dash.recent")}</h2>
            <Link href="/app/projects" className="text-[13px] text-muted hover:text-text">{t("nav.projects")} →</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.slice(0, 3).map((p) => <ProjectCard key={p.id} p={p} system={system} bcp47={bcp47} t={t} />)}
          </div>
        </section>
      )}

      {recentVersions.length > 0 && (
        <Card>
          <CardHeader title="Recent design changes" subtitle="Every significant change is saved as a version you can restore." />
          <ul className="divide-y divide-line">
            {recentVersions.map((v) => (
              <li key={v.id}>
                <Link href={`/app/projects/${v.project.id}/versions`} className="flex items-center gap-3 px-5 py-3 text-[13.5px] hover:bg-surface-2">
                  <Clock className="size-4 text-faint" aria-hidden />
                  <span className="font-mono text-[12px] text-faint">v{v.number}</span>
                  <span className="min-w-0 flex-1 truncate text-text">{v.label}</span>
                  <span className="hidden truncate text-muted sm:block">{v.project.name}</span>
                  <span className="shrink-0 text-[12px] text-faint">{formatDateTime(v.createdAt, bcp47)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
