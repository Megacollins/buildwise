import type { Metadata } from "next";
import { Building2, Ruler, Plug, Calculator, HardHat, Sofa, Hammer } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getI18n } from "@/server/i18n";
import { db } from "@/server/db";
import { Card, EmptyState, LinkButton, Notice, PageHeader, Badge } from "@/components/ui";
import { PRO_CATEGORIES } from "@/domain/professionals";

export const metadata: Metadata = { title: "Professionals" };
const ICONS = [Building2, Ruler, Plug, Calculator, HardHat, Sofa, Hammer];

export default async function ProfessionalsPage() {
  const user = await requireUser();
  const { t } = await getI18n();
  const latest = await db.project.findFirst({ where: { ownerId: user.id }, orderBy: { updatedAt: "desc" }, select: { id: true } });
  const count = await db.professional.count({ where: { verificationStatus: "VERIFIED" } });
  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader title={t("nav.professionals")} subtitle="The people who turn a concept into a safe, approved, buildable home."
        actions={latest ? <LinkButton href={`/app/projects/${latest.id}/professionals`} variant="primary">Request professional review</LinkButton> : undefined} />
      <Notice tone="warn" title="Directory not yet open">
        We will only list professionals after checking their credentials. Until that verification system exists, the directory is empty — we won’t show unverified people as if they were vetted.
      </Notice>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PRO_CATEGORIES.map(([v, l, d], i) => {
          const Icon = ICONS[i];
          return (
            <Card key={v} className="p-5">
              <Icon className="size-5 text-accent-strong" aria-hidden />
              <div className="mt-3 font-medium text-text">{l}</div>
              <p className="mt-1 text-[12.5px] text-muted">{d}</p>
              <Badge className="mt-3">0 verified</Badge>
            </Card>
          );
        })}
      </div>
      {count === 0 && <EmptyState title="No verified professionals in your region yet" body="Request a review from a project and we’ll record it against that design version." />}
    </main>
  );
}
