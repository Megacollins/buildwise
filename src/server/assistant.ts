import "server-only";
/**
 * Design assistant service.
 *
 * Providers translate a user's request into *proposals*: validated ModelOps
 * with a measured cost impact. Nothing is applied until the user accepts a
 * proposal, and every proposal goes through the same server-side applyOp +
 * cost engine path as manual edits. An LLM provider can be added behind the
 * same interface; its output must still be validated with ModelOpSchema.
 */
import type { BuildingModel, RoomType } from "@/domain/model/types";
import { applyOp, ModelOpSchema, type ModelOp } from "@/domain/model/operations";
import { estimateCost } from "@/domain/cost/engine";
import { optimisationOptions } from "@/domain/cost/optimize";
import type { Region } from "@/domain/regions/types";
import type { RegionalMaterial } from "@/domain/materials/types";

export interface Proposal { label: string; op: ModelOp; costDelta: number }
export interface AssistantResult { reply: string; proposals: Proposal[]; provider: string }

interface AssistantProvider {
  name: string;
  interpret(message: string, ctx: { model: BuildingModel; region: Region; catalog: RegionalMaterial[] }): Promise<{ reply: string; ops: { label: string; op: ModelOp }[] }>;
}

const ROOM_WORDS: [RegExp, RoomType[]][] = [
  [/kitchen/, ["kitchen"]], [/living|lounge|sitting/, ["living", "family"]], [/dining/, ["dining"]],
  [/master|main bed/, ["master_bedroom"]], [/guest/, ["guest_bedroom"]], [/bed ?room/, ["bedroom", "master_bedroom", "guest_bedroom"]],
  [/bath|toilet|wc/, ["bathroom", "wc"]], [/office|study/, ["office"]], [/laundry/, ["laundry"]], [/garage/, ["garage"]],
];

const ruleBased: AssistantProvider = {
  name: "rule-based",
  async interpret(message, { model, region, catalog }) {
    const t = message.toLowerCase();
    const rooms = model.levels.flatMap((l) => l.rooms);
    const ops: { label: string; op: ModelOp }[] = [];

    const bigger = /\b(bigger|larger|more space|enlarge|expand|wider)\b/.test(t);
    const smaller = /\b(smaller|reduce|shrink|narrower)\b/.test(t) && !/\b(cost|budget|price)\b/.test(t);
    if (bigger || smaller) {
      for (const [re, types] of ROOM_WORDS) {
        if (!re.test(t)) continue;
        const room = rooms.find((r) => types.includes(r.type));
        if (!room) break;
        const delta = bigger ? 600 : -600;
        ops.push({ label: `${bigger ? "Enlarge" : "Reduce"} ${room.name} by 0.6 m (width)`, op: { kind: "resizeRoom", roomId: room.id, axis: "width", delta } });
        ops.push({ label: `${bigger ? "Enlarge" : "Reduce"} ${room.name} by 0.6 m (depth)`, op: { kind: "resizeRoom", roomId: room.id, axis: "depth", delta } });
        break;
      }
    }
    if (/\b(natural light|more light|brighter|daylight|bigger windows|larger windows)\b/.test(t)) {
      ops.push({ label: "Enlarge windows in habitable rooms by 25%", op: { kind: "glazing", factor: Math.min(1.8, model.params.glazingFactor * 1.25) } });
    }
    if (/\b(more modern|modern exterior|contemporary look|flat roof)\b/.test(t)) {
      ops.push({ label: "Flat roof with parapet", op: { kind: "roof", type: "flat" } });
      const ext = catalog.find((m) => m.id === "ext-timber" && m.price);
      if (ext) ops.push({ label: `${ext.name} exterior`, op: { kind: "selection", category: "exterior_finish", materialId: ext.id } });
    }
    if (/\b(swimming[- ]?pool|pool)\b/.test(t) && !/\b(no|remove|without)\b.*pool/.test(t)) {
      for (const size of ["medium", "small"] as const) ops.push({ label: `Add a ${size} swimming pool (${size === "medium" ? "8 × 4" : "6 × 3"} m) in the garden`, op: { kind: "pool", size } });
    }
    if (/\b(remove|no|without)\b.*\bpool\b/.test(t)) ops.push({ label: "Remove the swimming pool", op: { kind: "pool", size: "none" } });
    if (/\b(terrace|roof terrace|rooftop|set ?back)\b/.test(t)) {
      const main = model.massing?.groups.findIndex((g) => g.label === "Main volume") ?? -1;
      const wing = model.massing?.groups.findIndex((g) => g.label !== "Main volume" && g.depth > 0) ?? -1;
      if (wing >= 0) ops.push({ label: `Make the ${model.massing!.groups[wing].label.toLowerCase()} single-storey with a terrace on its roof`, op: { kind: "levelDepth", group: wing, level: 0, depth: 0 } });
      if (main >= 0) ops.push({ label: "Set the upper floor back 1.5 m for a terrace along the front", op: { kind: "levelDepth", group: main, level: 0, depth: -1500 } });
    }
    if (/\b(budget|cheaper|too expensive|expensive|reduce cost|save money|afford|cost less)\b/.test(t)) {
      for (const o of optimisationOptions(model, region, catalog).slice(0, 4)) ops.push({ label: o.title, op: o.op });
    }

    let reply: string;
    if (/\b(another|extra|add|additional|one more)\b.*\bbed ?room\b/.test(t)) {
      reply = "Adding a room changes the whole layout, so it's best done by generating a new concept with one more bedroom (New home → same plot). I can't insert rooms into an existing plan yet.";
    } else if (/\b(parents?|elderly)\b.*\b(downstairs|ground)\b/.test(t)) {
      const ground = model.levels[0].rooms.find((r) => r.type.includes("bedroom"));
      reply = ground
        ? `The ${ground.name} is already on the ground floor (${ground.area.toFixed(1)} m²) with a bathroom nearby — suitable for parents. Ask me to make it bigger if needed.`
        : "This design has no ground-floor bedroom. Generate a new concept with 'Bedroom on the ground floor' selected.";
    } else if (ops.length) {
      reply = "Here's what I can change. Each option shows its measured effect on the estimate — nothing is applied until you choose.";
    } else {
      reply = "I can add a pool or a terrace, resize rooms (e.g. “make the kitchen bigger”), add daylight, change the roof or exterior, and find cheaper alternatives. Try one of those.";
    }
    return { reply, ops };
  },
};

export function getAssistantProvider(): AssistantProvider {
  // Future: if (process.env.ANTHROPIC_API_KEY) return llmProvider; — outputs must pass ModelOpSchema.
  return ruleBased;
}

export async function interpretRequest(message: string, model: BuildingModel, region: Region, catalog: RegionalMaterial[]): Promise<AssistantResult> {
  const provider = getAssistantProvider();
  const { reply, ops } = await provider.interpret(message, { model, region, catalog });
  const baseEstimate = estimateCost(model, region, catalog);
  const base = baseEstimate.expected;
  const proposals: Proposal[] = [];
  for (const { label, op } of ops) {
    const valid = ModelOpSchema.safeParse(op);
    if (!valid.success) continue;
    try {
      const next = applyOp(model, valid.data);
      const e = estimateCost(next, region, catalog);
      // Say plainly whether a resize grows the building or borrows space from a neighbour.
      const dGfa = e.grossFloorArea - baseEstimate.grossFloorArea;
      const note = valid.data.kind === "resizeRoom"
        ? Math.abs(dGfa) > 0.5 ? ` — ${dGfa > 0 ? "extends" : "shrinks"} the building by ${Math.abs(dGfa).toFixed(1)} m²` : " — takes space from the neighbouring room"
        : "";
      proposals.push({ label: label + note, op: valid.data, costDelta: e.expected - base });
    } catch {
      /* not applicable to this design (e.g. would exceed plot) */
    }
  }
  const finalReply = ops.length && !proposals.length
    ? "Those changes don't fit this design (for example they would push the house past the plot boundary or make a neighbouring room too small)."
    : reply;
  return { reply: finalReply, proposals, provider: provider.name };
}
