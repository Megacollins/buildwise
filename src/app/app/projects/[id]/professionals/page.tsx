import { loadWorkspace } from "@/server/workspace";
import { db } from "@/server/db";
import { Badge, Card, CardHeader, Notice } from "@/components/ui";
import { ReviewRequestForm } from "@/components/project/ReviewRequestForm";
import { PRO_CATEGORIES } from "@/domain/professionals";
import { formatDateTime } from "@/i18n/format";

export default async function ProjectProfessionalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, region, bcp47 } = await loadWorkspace(id);
  const requests = await db.reviewRequest.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } });
  const versionNumbers = new Map((await db.designVersion.findMany({ where: { projectId: project.id }, select: { id: true, number: true } })).map((v) => [v.id, v.number]));
  const label = Object.fromEntries(PRO_CATEGORIES.map(([v, l]) => [v, l]));
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <div className="space-y-5">
        <Notice tone="warn" title="No professionals are verified yet">
          Buildwise does not yet verify licences or credentials, so no one is listed as verified. Requests are recorded now and will be matched once verification is in place for {region.city}.
        </Notice>
        <Card>
          <CardHeader title="Request professional review" subtitle="Before construction, a qualified professional must review and develop this concept." />
          <div className="p-5"><ReviewRequestForm projectId={project.id} /></div>
        </Card>
      </div>
      <Card className="xl:self-start">
        <CardHeader title="Review requests" />
        {requests.length ? (
          <ul className="divide-y divide-line">
            {requests.map((r) => (
              <li key={r.id} className="px-5 py-3 text-[13px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-text">{label[r.category]}</span>
                  <Badge tone="warn">{r.status === "REQUESTED" ? "Awaiting match" : r.status}</Badge>
                </div>
                <div className="mt-0.5 text-[12px] text-muted">Design v{versionNumbers.get(r.versionId) ?? "?"} · {formatDateTime(r.createdAt, bcp47)}</div>
                {r.message && <p className="mt-1 text-[12.5px] text-muted">{r.message}</p>}
              </li>
            ))}
          </ul>
        ) : <p className="p-5 text-[13px] text-muted">No requests yet.</p>}
      </Card>
    </div>
  );
}
