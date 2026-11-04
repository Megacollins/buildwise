import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/server/auth";
import { getChangeRequestForOwner } from "@/server/changes";
import { NotFoundError } from "@/server/projects";
import { getI18n } from "@/server/i18n";
import { formatDateTime, formatMoney } from "@/i18n/format";
import { Badge, Card, CardHeader, Notice, cx } from "@/components/ui";
import { ChangeDecision } from "@/components/project/ChangeDecision";

export const dynamic = "force-dynamic";

export default async function ChangePage({ params }: { params: Promise<{ id: string; changeId: string }> }) {
  const { id, changeId } = await params;
  const user = await requireUser();
  const cr = await getChangeRequestForOwner(id, changeId, user.id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const { bcp47 } = await getI18n();
  const c = cr.comparison;
  const money = (n: number) => formatMoney(n, c.currency, bcp47);
  const signed = (n: number, f: (n: number) => string) => (Math.abs(n) < 0.005 ? "—" : `${n > 0 ? "+" : "−"}${f(Math.abs(n))}`);
  const unit = (u: string) => (u === "count" ? "" : ` ${u}`);
  const stale = cr.status === "PENDING" && cr.project.currentVersionId !== cr.baseVersionId;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href={`/app/projects/${id}/versions`} className="text-[13px] text-muted hover:text-text">← Versions &amp; agent changes</Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={cr.status === "PENDING" ? "accent" : "neutral"}>{cr.status.toLowerCase()}</Badge>
          <Badge>via {cr.requestedVia}</Badge>
          <span className="text-[12.5px] text-muted">{formatDateTime(cr.createdAt, bcp47)}</span>
        </div>
        <h2 className="mt-2 font-display text-lg font-semibold">{cr.summary}</h2>
        {cr.requestText && <p className="mt-1 text-[13.5px] text-muted">Requested: “{cr.requestText}”</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-faint">Estimate now (mid)</div>
          <div className="mt-1 text-lg font-semibold tabular">{money(c.cost.before.expected)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-faint">With this change</div>
          <div className="mt-1 text-lg font-semibold tabular">{money(c.cost.after.expected)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-faint">Difference</div>
          <div className={cx("mt-1 text-lg font-semibold tabular", c.cost.delta > 0 ? "text-warn" : c.cost.delta < 0 ? "text-ok" : "")}>
            {signed(c.cost.delta, money)} <span className="text-[13px] font-normal text-muted">({c.cost.deltaPct > 0 ? "+" : ""}{c.cost.deltaPct}%)</span>
          </div>
        </Card>
      </div>

      {(c.rooms.length > 0 || c.quantities.length > 0) && (
        <Card>
          <CardHeader title="Quantities" subtitle="Measured from the current and proposed building models" />
          <table className="w-full text-[13px]">
            <thead className="text-[11.5px] uppercase tracking-wide text-faint">
              <tr><th className="px-5 py-2 text-start font-medium">Item</th><th className="px-3 py-2 text-end font-medium">Now</th><th className="px-3 py-2 text-end font-medium">Proposed</th><th className="px-5 py-2 text-end font-medium">Change</th></tr>
            </thead>
            <tbody className="divide-y divide-line tabular">
              {c.rooms.map((r) => (
                <tr key={`room-${r.id}`}>
                  <td className="px-5 py-2">{r.name} <span className="text-faint">({r.level})</span></td>
                  <td className="px-3 py-2 text-end">{r.before === null ? "—" : `${r.before} m²`}</td>
                  <td className="px-3 py-2 text-end">{r.after === null ? "removed" : `${r.after} m²`}</td>
                  <td className="px-5 py-2 text-end">{signed(r.delta, (n) => `${n} m²`)}</td>
                </tr>
              ))}
              {c.quantities.map((q) => (
                <tr key={`q-${q.key}`}>
                  <td className="px-5 py-2">{q.label}</td>
                  <td className="px-3 py-2 text-end">{q.before}{unit(q.unit)}</td>
                  <td className="px-3 py-2 text-end">{q.after}{unit(q.unit)}</td>
                  <td className="px-5 py-2 text-end">{signed(q.delta, (n) => `${n}${unit(q.unit)}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {c.lines.length > 0 && (
        <Card>
          <CardHeader title="Cost lines that change" subtitle={`From the Buildwise cost engine · price data: ${c.dataStatus}`} />
          <table className="w-full text-[13px]">
            <thead className="text-[11.5px] uppercase tracking-wide text-faint">
              <tr><th className="px-5 py-2 text-start font-medium">Line</th><th className="px-3 py-2 text-end font-medium">Now</th><th className="px-3 py-2 text-end font-medium">Proposed</th><th className="px-5 py-2 text-end font-medium">Change</th></tr>
            </thead>
            <tbody className="divide-y divide-line tabular">
              {c.lines.slice(0, 15).map((l) => (
                <tr key={l.id}>
                  <td className="px-5 py-2">{l.label}</td>
                  <td className="px-3 py-2 text-end">{money(l.costBefore)}</td>
                  <td className="px-3 py-2 text-end">{money(l.costAfter)}</td>
                  <td className={cx("px-5 py-2 text-end", l.delta > 0 ? "text-warn" : "text-ok")}>{signed(l.delta, money)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {c.checks.warnings.length > 0 && <Notice tone="warn" title="Model check warnings">{c.checks.warnings.slice(0, 5).join(" · ")}</Notice>}

      <Card className="p-5">
        <div className="font-medium">Decision</div>
        {cr.status === "PENDING" ? (
          <div className="mt-3 space-y-3">
            {stale && <Notice tone="warn">The design changed after this was proposed, so these numbers are out of date. Reject it, or ask the agent to propose it again.</Notice>}
            <ChangeDecision projectId={id} changeId={cr.id} canApprove={!stale && c.checks.valid} />
          </div>
        ) : (
          <p className="mt-2 text-[13.5px] text-muted">
            {cr.status.charAt(0) + cr.status.slice(1).toLowerCase()}
            {cr.decidedAt && <> · decided {formatDateTime(cr.decidedAt, bcp47)}</>}
            {cr.decisionNote && <> · “{cr.decisionNote}”</>}
            {cr.failureReason && <> · {cr.failureReason}</>}
            {cr.appliedVersionId && <> · saved as a new version (<Link className="underline" href={`/app/projects/${id}/versions`}>history</Link>)</>}
          </p>
        )}
      </Card>
    </div>
  );
}
