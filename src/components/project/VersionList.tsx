"use client";

import { useState, useTransition } from "react";
import { RotateCcw, Loader2, GitCompare } from "lucide-react";
import { restoreVersionAction } from "@/app/actions/projects";
import { useI18n } from "@/i18n/client";
import { formatDateTime, formatMoney, formatMoneyRange } from "@/i18n/format";
import { formatArea } from "@/domain/units";
import { Badge, Button, cx } from "@/components/ui";

export interface VersionRow {
  id: string; number: number; label: string; source: string; createdAt: string | Date;
  estimate: [number, number]; grossFloorAreaM2: number; current: boolean;
  rooms: number; bedrooms: number; roof: string;
}

export function VersionList({ projectId, versions, currency }: { projectId: string; versions: VersionRow[]; currency: string }) {
  const { t, bcp47, system } = useI18n();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const toggle = (id: string) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c.slice(-1), id]));
  const [a, b] = compare.map((id) => versions.find((v) => v.id === id)!).sort((x, y) => x.number - y.number);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <ol className="overflow-hidden rounded-xl border border-line bg-surface">
        {versions.map((v) => (
          <li key={v.id} className={cx("flex flex-col gap-3 border-b border-line px-5 py-4 last:border-0 sm:flex-row sm:items-center", v.current && "bg-accent-soft/40")}>
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={compare.includes(v.id)} onChange={() => toggle(v.id)} className="size-4 accent-[var(--accent)]" aria-label={`Compare version ${v.number}`} />
              <span className="font-mono text-[12.5px] text-faint">v{v.number}</span>
            </label>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] text-text">{v.label}</span>
                {v.current && <Badge tone="accent">{t("common.current")}</Badge>}
                <Badge>{v.source}</Badge>
              </div>
              <div className="mt-0.5 text-[12px] text-muted tabular">{formatDateTime(v.createdAt, bcp47)} · {formatArea(v.grossFloorAreaM2, system, 0)} · {formatMoneyRange(v.estimate, currency, bcp47)}</div>
            </div>
            {!v.current && (
              <Button size="sm" disabled={pending} onClick={() => { setBusy(v.id); start(async () => { await restoreVersionAction(projectId, v.id); setBusy(null); }); }}>
                {busy === v.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RotateCcw className="size-3.5" aria-hidden />} {t("common.restore")}
              </Button>
            )}
          </li>
        ))}
      </ol>
      <aside className="rounded-xl border border-line bg-surface p-5 xl:self-start">
        <div className="flex items-center gap-2 font-medium"><GitCompare className="size-4 text-accent-strong" aria-hidden /> Compare versions</div>
        {a && b ? (
          <table className="mt-4 w-full text-[13px]">
            <thead className="text-[11.5px] uppercase tracking-wide text-faint">
              <tr><th className="py-1.5 text-start font-medium" /><th className="py-1.5 text-end font-medium">v{a.number}</th><th className="py-1.5 text-end font-medium">v{b.number}</th><th className="py-1.5 text-end font-medium">Change</th></tr>
            </thead>
            <tbody className="divide-y divide-line tabular">
              <Row label="Gross area" a={formatArea(a.grossFloorAreaM2, system, 0)} b={formatArea(b.grossFloorAreaM2, system, 0)} d={b.grossFloorAreaM2 - a.grossFloorAreaM2} fmt={(d) => formatArea(Math.abs(d), system, 1)} />
              <Row label="Rooms" a={String(a.rooms)} b={String(b.rooms)} d={b.rooms - a.rooms} fmt={(d) => String(Math.abs(d))} />
              <Row label="Bedrooms" a={String(a.bedrooms)} b={String(b.bedrooms)} d={b.bedrooms - a.bedrooms} fmt={(d) => String(Math.abs(d))} />
              <Row label="Roof" a={a.roof} b={b.roof} />
              <Row label="Estimate (mid)" a={formatMoney((a.estimate[0] + a.estimate[1]) / 2, currency, bcp47, { compact: true })} b={formatMoney((b.estimate[0] + b.estimate[1]) / 2, currency, bcp47, { compact: true })}
                d={(b.estimate[0] + b.estimate[1]) / 2 - (a.estimate[0] + a.estimate[1]) / 2} fmt={(d) => formatMoney(Math.abs(d), currency, bcp47, { compact: true })} />
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-[13px] text-muted">Tick two versions to compare their area, rooms and estimated cost. Restoring a version never deletes history — it creates a new version.</p>
        )}
      </aside>
    </div>
  );
}

function Row({ label, a, b, d, fmt }: { label: string; a: string; b: string; d?: number; fmt?: (d: number) => string }) {
  return (
    <tr>
      <td className="py-2 text-muted">{label}</td><td className="py-2 text-end">{a}</td><td className="py-2 text-end">{b}</td>
      <td className={cx("py-2 text-end", d === undefined || Math.abs(d) < 0.05 ? "text-faint" : d > 0 ? "text-warn" : "text-ok")}>
        {d === undefined || !fmt ? (a === b ? "—" : "changed") : Math.abs(d) < 0.05 ? "—" : `${d > 0 ? "+" : "−"}${fmt(d)}`}
      </td>
    </tr>
  );
}
