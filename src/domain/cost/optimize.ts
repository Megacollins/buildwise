/**
 * Budget optimisation. Each option is a real `ModelOp` applied to a copy of
 * the model and re-estimated by the cost engine — savings are measured, not guessed.
 */
import type { BuildingModel, MaterialCategory } from "@/domain/model/types";
import { applyOp, type ModelOp } from "@/domain/model/operations";
import type { Region } from "@/domain/regions/types";
import type { RegionalMaterial, QualityTier } from "@/domain/materials/types";
import { TIERS } from "@/domain/materials/types";
import { estimateCost } from "./engine";

export interface OptimisationOption {
  id: string;
  title: string;
  detail: string;
  tradeoff: string;
  op: ModelOp;
  /** Reduction in expected (mid-point) cost; positive = saving */
  saving: number;
  newExpected: number;
}

const OPTIONAL_ROOMS = ["office", "storage", "family"] as const;

export function optimisationOptions(model: BuildingModel, region: Region, catalog: RegionalMaterial[]): OptimisationOption[] {
  const base = estimateCost(model, region, catalog).expected;
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const out: OptimisationOption[] = [];
  const tryOp = (id: string, title: string, detail: string, tradeoff: string, op: ModelOp) => {
    try {
      const next = applyOp(model, op);
      const e = estimateCost(next, region, catalog).expected;
      if (base - e > base * 0.002) out.push({ id, title, detail, tradeoff, op, saving: base - e, newExpected: e });
    } catch {
      /* option not applicable to this design */
    }
  };

  tryOp("area-8", "Reduce floor area by 8%", "Scales every room slightly; the room list stays the same.", "Rooms become a little smaller.", { kind: "scale", factor: 0.92 });

  const cheaperRoofs = (["gable", "hip", "flat"] as const).filter((t) => t !== model.roof.type);
  for (const t of cheaperRoofs) tryOp(`roof-${t}`, `Simplify roof to ${t}`, `Changes the roof from ${model.roof.type} to ${t}.`, "Changes the look of the house.", { kind: "roof", type: t });

  tryOp("glazing", "Smaller windows", "Reduces window sizes by about 20%.", "Less daylight and view; may help with heat gain in hot climates.", { kind: "glazing", factor: Math.max(0.6, model.params.glazingFactor * 0.8) });

  for (const room of model.levels.flatMap((l) => l.rooms).filter((r) => (OPTIONAL_ROOMS as readonly string[]).includes(r.type))) {
    tryOp(`remove-${room.id}`, `Remove ${room.name}`, "Its space is merged into the neighbouring room.", "You lose this room.", { kind: "removeRoom", roomId: room.id });
  }

  // Single-category downgrades
  for (const [category, materialId] of Object.entries(model.selections) as [MaterialCategory, string][]) {
    const current = byId.get(materialId);
    if (!current) continue;
    const lower = TIERS[TIERS.indexOf(current.tier) - 1];
    const alt = catalog.find((m) => m.category === category && m.tier === lower && m.price);
    if (alt) tryOp(`mat-${category}`, `${alt.name} instead of ${current.name}`, `${category.replace(/_/g, " ")}: ${current.tier} → ${alt.tier}.`, "Lower specification finish.", { kind: "selection", category, materialId: alt.id });
  }

  // Whole finishing package one tier down
  const pkg: Record<string, string> = {};
  for (const [category, materialId] of Object.entries(model.selections)) {
    const cur = byId.get(materialId);
    const lower: QualityTier | undefined = cur ? TIERS[TIERS.indexOf(cur.tier) - 1] : undefined;
    const alt = lower && catalog.find((m) => m.category === category && m.tier === lower && m.price);
    if (alt) pkg[category] = alt.id;
  }
  if (Object.keys(pkg).length > 2) tryOp("finish-package", "Step every finish down one tier", "Applies a lower quality tier across all finishes.", "Overall finish quality is lower.", { kind: "selections", selections: pkg });

  return out.sort((a, b) => b.saving - a.saving).slice(0, 8);
}
