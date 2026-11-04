"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bot, KeyRound, Loader2, Copy } from "lucide-react";
import { createAgentKeyAction, revokeAgentKeyAction } from "@/app/actions/agent";
import { useI18n } from "@/i18n/client";
import { formatDateTime, formatMoney } from "@/i18n/format";
import { Badge, Button, Input, Notice, cx } from "@/components/ui";

export interface AgentKeyRow { id: string; name: string; prefix: string; createdAt: string | Date; lastUsedAt: string | Date | null; revokedAt: string | Date | null }
export interface ChangeRow { id: string; summary: string; status: string; createdAt: string | Date; costDelta: number }

/** Switch agent access and the record of agent-proposed changes for one project. */
export function AgentPanel({ projectId, keys, changes, currency }: { projectId: string; keys: AgentKeyRow[]; changes: ChangeRow[]; currency: string }) {
  const { bcp47 } = useI18n();
  const [pending, start] = useTransition();
  const [name, setName] = useState("Switch room agent");
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = keys.filter((k) => !k.revokedAt);

  return (
    <section className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <div className="rounded-xl border border-line bg-surface">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3 font-medium"><Bot className="size-4 text-accent-strong" aria-hidden /> Agent change requests</div>
        {changes.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-muted">No agent changes yet. Changes a Switch agent proposes appear here with their cost impact, and need your approval before they&apos;re saved.</p>
        ) : (
          <ol>
            {changes.map((c) => (
              <li key={c.id} className="border-b border-line last:border-0">
                <Link href={`/app/projects/${projectId}/changes/${c.id}`} className="flex flex-col gap-1 px-5 py-3 hover:bg-accent-soft/30 sm:flex-row sm:items-center sm:gap-3">
                  <span className="min-w-0 flex-1 truncate text-[13.5px]">{c.summary}</span>
                  <span className={cx("text-[12.5px] tabular", c.costDelta > 0 ? "text-warn" : c.costDelta < 0 ? "text-ok" : "text-faint")}>
                    {Math.abs(c.costDelta) < 0.005 ? "no cost change" : `${c.costDelta > 0 ? "+" : "−"}${formatMoney(Math.abs(c.costDelta), currency, bcp47)}`}
                  </span>
                  <Badge tone={c.status === "PENDING" ? "accent" : "neutral"}>{c.status.toLowerCase()}</Badge>
                  <span className="text-[12px] text-faint">{formatDateTime(c.createdAt, bcp47)}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>

      <aside className="rounded-xl border border-line bg-surface p-5 xl:self-start">
        <div className="flex items-center gap-2 font-medium"><KeyRound className="size-4 text-accent-strong" aria-hidden /> Switch agent access</div>
        <p className="mt-1 text-[13px] text-muted">A key lets one agent read this project and propose changes. It can&apos;t approve anything — only you can, here in Buildwise.</p>
        {created && (
          <Notice tone="ok" className="mt-3" title="Copy this key now — it won't be shown again">
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-bg px-2 py-1 font-mono text-[12px]">{created}</code>
              <Button size="sm" onClick={() => navigator.clipboard?.writeText(created)} aria-label="Copy key"><Copy className="size-3.5" aria-hidden /></Button>
            </div>
          </Notice>
        )}
        {error && <Notice tone="danger" className="mt-3">{error}</Notice>}
        <form className="mt-3 flex gap-2" onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null);
            const r = await createAgentKeyAction(projectId, name);
            if (r.ok) setCreated(r.key); else setError(r.error);
          });
        }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Key name" />
          <Button type="submit" variant="primary" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Create key</Button>
        </form>
        {active.length > 0 && (
          <ul className="mt-4 divide-y divide-line text-[13px]">
            {active.map((k) => (
              <li key={k.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{k.name} <span className="font-mono text-faint">{k.prefix}…</span></div>
                  <div className="text-[12px] text-faint">{k.lastUsedAt ? `Last used ${formatDateTime(k.lastUsedAt, bcp47)}` : "Not used yet"}</div>
                </div>
                <Button size="sm" disabled={pending} onClick={() => start(() => revokeAgentKeyAction(projectId, k.id))}>Revoke</Button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </section>
  );
}
