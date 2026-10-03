"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, MousePointerClick, Sparkles, Send, Trash2, ArrowLeftRight, ArrowUpDown } from "lucide-react";
import type { BuildingModel, RoofType } from "@/domain/model/types";
import type { ModelOp } from "@/domain/model/operations";
import { wallLen } from "@/domain/model/geometry";
import { validateModel } from "@/domain/model/validate";
import { FloorPlan } from "@/components/drawings/FloorPlan";
import { applyOpAction, assistantAction } from "@/app/actions/projects";
import { useI18n } from "@/i18n/client";
import { formatMoney, formatMoneyRange } from "@/i18n/format";
import { formatArea, formatLength } from "@/domain/units";
import { Button, Input, Notice, cx } from "@/components/ui";

type Proposal = { label: string; op: ModelOp; costDelta: number };

export function DesignEditor({ projectId, model, currency, total, budget }: {
  projectId: string; model: BuildingModel; currency: string; total: [number, number]; budget: number | null;
}) {
  const { t, bcp47, system } = useI18n();
  const [levelId, setLevelId] = useState(model.levels[0].id);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [wallId, setWallId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastDelta, setLastDelta] = useState<number | null>(null);
  const prevExpected = useRef((total[0] + total[1]) / 2);

  const level = model.levels.find((l) => l.id === levelId) ?? model.levels[0];
  const room = level.rooms.find((r) => r.id === roomId) ?? null;
  const wall = level.walls.find((w) => w.id === wallId) ?? null;
  const expected = (total[0] + total[1]) / 2;
  const check = validateModel(model);

  useEffect(() => {
    if (Math.abs(expected - prevExpected.current) > 1) setLastDelta(expected - prevExpected.current);
    prevExpected.current = expected;
  }, [expected]);

  const run = (op: ModelOp, source: "edit" | "assistant" = "edit", after?: () => void) => {
    setError(null);
    start(async () => {
      const res = await applyOpAction(projectId, op, source);
      if (!res.ok) setError(res.error ?? t("common.error"));
      else after?.();
    });
  };

  const moveWall = (delta: number) => {
    if (!wall) return;
    const vertical = wall.a.x === wall.b.x;
    const at = vertical ? wall.a.x : wall.a.y;
    const from = vertical ? wall.a.y : wall.a.x;
    run({ kind: "moveWall", levelId: level.id, wallId: wall.id, delta }, "edit", () => {
      // Walls are derived; predict the moved wall's new id so the selection follows it.
      setWallId(at === 0 ? wall.id : `${level.id}-w${vertical ? "v" : "h"}${at + delta}-${from}`);
    });
  };

  const wallDesc = (() => {
    if (!wall) return null;
    const vertical = wall.a.x === wall.b.x;
    const names = wall.rooms.map((id) => level.rooms.find((r) => r.id === id)?.name).filter(Boolean);
    return {
      vertical,
      label: wall.exterior ? `Exterior wall — ${names[0]}` : `Partition between ${names.join(" and ")}`,
      neg: vertical ? "Left" : "Towards front", pos: vertical ? "Right" : "Towards rear",
    };
  })();

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Level" className="flex rounded-lg border border-line bg-surface p-0.5">
            {model.levels.map((l) => (
              <button key={l.id} role="tab" aria-selected={l.id === level.id} onClick={() => { setLevelId(l.id); setRoomId(null); setWallId(null); }}
                className={cx("rounded-md px-3 py-1.5 text-[13px]", l.id === level.id ? "bg-surface-3 font-medium text-text" : "text-muted hover:text-text")}>{l.name}</button>
            ))}
          </div>
          <span title="Deterministic model check" className={cx("rounded-md border px-2 py-0.5 text-[12px]", check.valid ? "border-ok/30 bg-ok-soft text-ok" : "border-danger/30 bg-danger-soft text-danger")}>
            {check.valid ? `Model check ✓ ${check.results.filter((r) => r.status === "pass").length}/${check.results.length}` : `${check.errors} model problem(s)`}
          </span>
          <div className="ms-auto flex items-center gap-3 text-[13px]" aria-live="polite">
            {pending && <span className="flex items-center gap-1.5 text-muted"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Updating model…</span>}
            <span className="tabular text-text">{formatMoneyRange(total, currency, bcp47)}</span>
            {lastDelta !== null && !pending && (
              <span className={cx("tabular text-[12.5px] font-medium", lastDelta > 0 ? "text-warn" : "text-ok")}>
                {lastDelta > 0 ? "+" : "−"}{formatMoney(Math.abs(lastDelta), currency, bcp47, { compact: true })}
              </span>
            )}
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-paper">
          <div className="aspect-[4/3] max-h-[72vh] w-full">
            <FloorPlan model={model} levelId={level.id} system={system} showTags={false}
              selectedRoomId={roomId} selectedWallId={wallId}
              onRoomClick={(id) => { setRoomId(id); setWallId(null); }}
              onWallClick={(id) => { setWallId(id); setRoomId(null); }} />
          </div>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        {model.warnings.length > 0 && (
          <Notice tone="warn" title="Design notes"><ul className="list-disc space-y-0.5 ps-4">{model.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Notice>
        )}
      </div>

      <div className="space-y-4">
        <section className="rounded-xl border border-line bg-surface" aria-label="Selection">
          {!room && !wall && (
            <div className="flex items-start gap-3 p-4 text-[13px] text-muted">
              <MousePointerClick className="mt-0.5 size-4 shrink-0 text-accent-strong" aria-hidden />
              <p>Select a <span className="text-text">room</span> to resize it, or a <span className="text-text">wall</span> to move it. Plans, 3D, quantities and cost all update from the same model.</p>
            </div>
          )}
          {wall && wallDesc && (
            <div className="space-y-3 p-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-faint">Wall</div>
                <div className="font-medium text-text">{wallDesc.label}</div>
                <div className="text-[12.5px] text-muted tabular">{formatLength(wallLen(wall), system)} long · {wall.thickness} mm thick</div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[12.5px] text-muted">{wallDesc.vertical ? <ArrowLeftRight className="size-3.5" /> : <ArrowUpDown className="size-3.5" />} Move wall</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[-300, -100, 100, 300].map((d) => (
                    <Button key={d} size="sm" disabled={pending} onClick={() => moveWall(d)} title={`${d < 0 ? wallDesc.neg : wallDesc.pos} ${Math.abs(d)} mm`}>
                      {d > 0 ? "+" : "−"}{Math.abs(d) / 1000} m
                    </Button>
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-faint"><span>← {wallDesc.neg}</span><span>{wallDesc.pos} →</span></div>
              </div>
              {wall.exterior && <p className="text-[12px] text-faint">Moving an exterior wall changes the building footprint on every floor.</p>}
            </div>
          )}
          {room && (
            <RoomPanel key={room.id} room={room} pending={pending}
              onResize={(axis, delta) => run({ kind: "resizeRoom", roomId: room.id, axis, delta })}
              onRename={(name) => run({ kind: "renameRoom", roomId: room.id, name })}
              onRemove={() => run({ kind: "removeRoom", roomId: room.id }, "edit", () => setRoomId(null))} />
          )}
        </section>

        <section className="space-y-3 rounded-xl border border-line bg-surface p-4" aria-label="Building">
          <div className="text-[13px] font-medium text-text">Form & roof</div>
          <div className="grid grid-cols-3 gap-1.5">
            {(["flat", "gable", "hip"] as RoofType[]).map((r) => (
              <Button key={r} size="sm" variant={model.roof.type === r ? "primary" : "secondary"} disabled={pending || model.roof.type === r}
                onClick={() => run({ kind: "roof", type: r })} className="capitalize">{r}</Button>
            ))}
          </div>
          {model.levels.length > 1 && (model.massing?.groups ?? []).map((g, gi) => {
            const up = g.upper?.[0] ?? g.depth;
            if (g.label === "Main volume") {
              return (
                <div key={`up-${gi}`} className="pt-1">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-medium text-text">Upper floor</span>
                    <span className="text-muted tabular">{up < 0 ? `set back ${(-up / 1000).toFixed(1)} m · terrace in front` : "flush with ground floor"}</span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                    <Button size="sm" disabled={pending || up <= -3000} onClick={() => run({ kind: "levelDepth", group: gi, level: 0, depth: Math.min(0, up) - 300 })}>Set back</Button>
                    <Button size="sm" disabled={pending || up >= 0} onClick={() => run({ kind: "levelDepth", group: gi, level: 0, depth: Math.min(0, up + 300) })}>Forward</Button>
                    <Button size="sm" disabled={pending || up === 0} onClick={() => run({ kind: "levelDepth", group: gi, level: 0, depth: 0 })}>Flush</Button>
                  </div>
                  <p className="mt-1 text-[11.5px] text-faint">A set-back upper floor gives a terrace over the ground floor (needs a flat roof).</p>
                </div>
              );
            }
            return g.depth > 0 ? (
              <div key={`up-${gi}`} className="pt-1">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium text-text">{g.label} upstairs</span>
                  <span className="text-muted">{up === g.depth ? "full height" : up === 0 ? "terrace on its roof" : `${(up / 1000).toFixed(1)} m`}</span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <Button size="sm" variant={up === g.depth ? "primary" : "secondary"} disabled={pending || up === g.depth} onClick={() => run({ kind: "levelDepth", group: gi, level: 0, depth: g.depth })}>Full height</Button>
                  <Button size="sm" variant={up === 0 ? "primary" : "secondary"} disabled={pending || up === 0} onClick={() => run({ kind: "levelDepth", group: gi, level: 0, depth: 0 })}>Terrace on top</Button>
                </div>
              </div>
            ) : null;
          })}
          {(model.massing?.groups ?? []).map((g, gi) => g.label === "Main volume" ? null : (
            <div key={gi} className="pt-1">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-medium text-text">{g.label}</span>
                <span className="text-muted tabular">{g.depth ? `projects ${(g.depth / 1000).toFixed(1)} m` : "flush"}</span>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                <Button size="sm" disabled={pending || g.depth <= 0} onClick={() => run({ kind: "projection", group: gi, depth: Math.max(0, g.depth - 300) })}>−0.3 m</Button>
                <Button size="sm" disabled={pending || g.depth >= 4000} onClick={() => run({ kind: "projection", group: gi, depth: Math.min(4000, g.depth + 300) })}>+0.3 m</Button>
                <Button size="sm" disabled={pending || g.depth === 0} onClick={() => run({ kind: "projection", group: gi, depth: 0 })}>Flatten</Button>
              </div>
              <p className="mt-1 text-[11.5px] text-faint">Runs the full height of the house. Select its side wall on the plan to make it wider or narrower.</p>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1 text-[13px]">
            <span className="font-medium text-text">Window size</span>
            <span className="text-muted tabular">×{model.params.glazingFactor.toFixed(2)}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" disabled={pending || model.params.glazingFactor <= 0.6} onClick={() => run({ kind: "glazing", factor: Math.max(0.6, +(model.params.glazingFactor - 0.15).toFixed(2)) })}>Smaller</Button>
            <Button size="sm" disabled={pending || model.params.glazingFactor >= 1.7} onClick={() => run({ kind: "glazing", factor: Math.min(1.7, +(model.params.glazingFactor + 0.15).toFixed(2)) })}>Larger</Button>
          </div>
        </section>

        <Assistant projectId={projectId} currency={currency} budget={budget} onApply={(op) => run(op, "assistant")} pending={pending} />
      </div>
    </div>
  );
}

function RoomPanel({ room, pending, onResize, onRename, onRemove }: {
  room: BuildingModel["levels"][number]["rooms"][number]; pending: boolean;
  onResize: (axis: "width" | "depth", delta: number) => void; onRename: (name: string) => void; onRemove: () => void;
}) {
  const { system } = useI18n();
  const [name, setName] = useState(room.name);
  const removable = ["office", "storage", "family"].includes(room.type);
  return (
    <div className="space-y-3 p-4">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-faint">Room</div>
        <form className="mt-1 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (name.trim() && name !== room.name) onRename(name.trim()); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Room name" className="h-8" maxLength={40} />
          <Button size="sm" type="submit" disabled={pending || name === room.name}>Rename</Button>
        </form>
        <div className="mt-2 text-[13px] text-muted tabular">
          {formatArea(room.area, system)} · {formatLength(room.clearWidth, system)} × {formatLength(room.clearDepth, system)} clear
        </div>
      </div>
      {room.type !== "hall" && (["width", "depth"] as const).map((axis) => (
        <div key={axis}>
          <div className="mb-1 text-[12.5px] capitalize text-muted">{axis}</div>
          <div className="grid grid-cols-4 gap-1.5">
            {[-300, -100, 100, 300].map((d) => (
              <Button key={d} size="sm" disabled={pending || room.type === "stair" && axis === "width"} onClick={() => onResize(axis, d)}>{d > 0 ? "+" : "−"}{Math.abs(d) / 1000} m</Button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[12px] text-faint">Resizing a room moves a shared wall, so the neighbouring room changes too.</p>
      {removable && (
        <Button size="sm" variant="danger" disabled={pending} onClick={onRemove}><Trash2 className="size-3.5" aria-hidden /> Remove room</Button>
      )}
    </div>
  );
}

function Assistant({ projectId, currency, budget, onApply, pending }: {
  projectId: string; currency: string; budget: number | null; onApply: (op: ModelOp) => void; pending: boolean;
}) {
  const { bcp47 } = useI18n();
  const [message, setMessage] = useState("");
  const [thinking, startThinking] = useTransition();
  const [reply, setReply] = useState<{ q: string; text: string; proposals: Proposal[] } | null>(null);
  const suggestions = ["Make the kitchen bigger", "I want more natural light", "This is above my budget", "Make the exterior more modern"];

  const ask = (q: string) => {
    if (!q.trim()) return;
    startThinking(async () => {
      const r = await assistantAction(projectId, q);
      setReply({ q, text: r.reply, proposals: r.proposals });
      setMessage("");
    });
  };

  return (
    <section className="rounded-xl border border-line bg-surface" aria-label="Design assistant">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 text-[13.5px] font-medium"><Sparkles className="size-4 text-accent-strong" aria-hidden /> Design assistant</div>
        <span className="text-[11px] text-faint">Rule-based preview</span>
      </div>
      <div className="space-y-3 p-4">
        {!reply && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} onClick={() => ask(s)} disabled={thinking} className="rounded-full border border-line px-2.5 py-1 text-[12px] text-muted hover:border-line-strong hover:text-text">{s}</button>
            ))}
          </div>
        )}
        {reply && (
          <div className="space-y-2.5" aria-live="polite">
            <div className="ms-auto w-fit max-w-[85%] rounded-lg bg-surface-3 px-3 py-1.5 text-[13px] text-text">{reply.q}</div>
            <p className="text-[13px] text-muted">{reply.text}</p>
            {reply.proposals.length > 0 && (
              <ul className="space-y-1.5">
                {reply.proposals.map((p, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2">
                    <span className="min-w-0 flex-1 text-[12.5px] text-text">{p.label}</span>
                    <span className={cx("whitespace-nowrap text-[12px] font-medium tabular", p.costDelta > 0 ? "text-warn" : "text-ok")}>
                      {p.costDelta > 0 ? "+" : "−"}{formatMoney(Math.abs(p.costDelta), currency, bcp47, { compact: true })}
                    </span>
                    <Button size="sm" disabled={pending} onClick={() => onApply(p.op)}>Apply</Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); ask(message); }}>
          <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ask for a change…" aria-label="Ask the design assistant" className="h-9" maxLength={500} />
          <Button type="submit" size="sm" variant="primary" className="h-9" disabled={thinking || !message.trim()} aria-label="Send">
            {thinking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4 rtl:rotate-180" aria-hidden />}
          </Button>
        </form>
        {budget ? null : <p className="text-[11.5px] text-faint">Tip: set a budget to get cost-targeted suggestions.</p>}
        <p className="text-[11.5px] text-faint">Suggestions are structured changes to your building model, priced by the cost engine before you apply them. Understands English today.</p>
      </div>
    </section>
  );
}
