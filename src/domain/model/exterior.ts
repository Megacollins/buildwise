/**
 * Derivation of exterior elements (entrance, porch, balconies, window hoods,
 * AC units, boundary, gates, paving, drains, trees, services, lighting) from
 * the exterior intent and the rebuilt levels. Deterministic, like build.ts.
 *
 * Coordinates: `attached` elements are building-local (same frame as rooms);
 * `site` elements are plot coordinates. siteOf() converts.
 */
import type { BuildingModel, ExteriorGeometry, Point, Rect, RoomType } from "./types";
import { buildingBounds, exposedRects, roofGeometry, wallFrame, wallOutward } from "./geometry";
import type { Mm } from "@/domain/units";

const AC_ROOMS: RoomType[] = ["bedroom", "master_bedroom", "guest_bedroom", "living", "family", "office"];
const BOUNDARY_THICKNESS: Record<string, Mm> = { masonry_wall: 225, low_wall: 225, fence: 60, hedge: 600 };

const overlaps = (a: Rect, b: Rect, pad = 0) =>
  a.x < b.x + b.width + pad && a.x + a.width + pad > b.x && a.y < b.y + b.depth + pad && a.y + a.depth + pad > b.y;

export function deriveExterior(model: BuildingModel): { geometry: ExteriorGeometry; warnings: string[] } {
  const warnings: string[] = [];
  const ex = model.exterior;
  const t = model.params.wallThickness.exterior;
  const o = model.site.footprintOrigin;
  const ground = model.levels.find((l) => l.index === 0)!;

  // ---- Entrance: porch and steps --------------------------------------------
  const entrance = ground.doors.find((d) => d.kind === "entrance");
  const entranceWall = entrance && ground.walls.find((w) => w.id === entrance.wallId);
  let porch: ExteriorGeometry["attached"]["porch"] = null;
  let steps: ExteriorGeometry["attached"]["steps"] = null;
  let entranceX = model.footprint.width / 2;
  if (entrance && entranceWall) {
    const { ux } = wallFrame(entranceWall);
    entranceX = entranceWall.a.x + ux * (entrance.offset + entrance.width / 2);
    const wallY = entranceWall.a.y;
    let front = wallY - t / 2;
    // Free span along the entrance wall: not blocked by any room projecting in front of it.
    const blockers = ground.rooms.filter((r) => r.y < wallY - 1);
    let lo = Math.min(...ground.rooms.map((r) => r.x)) - t / 2, hi = Math.max(...ground.rooms.map((r) => r.x + r.width)) + t / 2;
    let loIsWing = false, hiIsWing = false;
    for (const r of blockers) {
      if (r.x + r.width <= entranceX && r.x + r.width + t / 2 > lo) { lo = r.x + r.width + t / 2; loIsWing = true; }
      else if (r.x >= entranceX && r.x - t / 2 < hi) { hi = r.x - t / 2; hiIsWing = true; }
    }
    if (ex.porch) {
      const width = Math.min(hi - lo, Math.max(3000, entrance.width + 2400));
      const x = Math.min(Math.max(entranceX - width / 2, lo), hi - width);
      const r: Rect = { x, y: front - ex.porch.depth, width, depth: ex.porch.depth };
      // In the inner corner of an L the wing wall carries one side, so only free edges get a column.
      const againstLeftWing = loIsWing && x <= lo + 1, againstRightWing = hiIsWing && x + width >= hi - 1;
      const columns: Point[] = !ex.porch.columns ? [] : [
        ...(againstLeftWing ? [] : [{ x: x + 175, y: r.y + 175 }]),
        ...(againstRightWing ? [] : [{ x: x + width - 175, y: r.y + 175 }]),
      ];
      porch = { ...r, columns, canopyTop: Math.min(2900, ground.height - 300) };
      front = r.y;
    }
    if (ex.plinth >= 100) {
      const risers = Math.ceil(ex.plinth / 170);
      const tread = 300;
      const depth = Math.max(1, risers - (porch ? 1 : 0)) * tread;
      const width = porch ? Math.min(porch.width, entrance.width + 1200) : entrance.width + 1200;
      // Same free span as the porch: steps never run into a projecting wing.
      const sw = Math.min(width, hi - lo);
      steps = { x: Math.min(Math.max(entranceX - sw / 2, lo), hi - sw), y: front - depth, width: sw, depth, risers, riserHeight: Math.round(ex.plinth / risers), tread };
    }
  }

  // ---- Balconies, hoods, AC units --------------------------------------------
  const balconies: ExteriorGeometry["attached"]["balconies"] = [];
  const hoods: ExteriorGeometry["attached"]["hoods"] = [];
  const acUnits: ExteriorGeometry["attached"]["acUnits"] = [];
  for (const level of model.levels) {
    for (const win of level.windows) {
      const wall = level.walls.find((w) => w.id === win.wallId)!;
      const { ux, uy } = wallFrame(wall);
      const a0 = { x: wall.a.x + ux * win.offset, y: wall.a.y + uy * win.offset };
      const side = wallOutward(level, wall);
      const along = (len: Mm, pad: Mm): Rect => {
        // Rectangle outside the wall face, spanning the opening ± pad.
        if (side === "front" || side === "rear") {
          const x = Math.min(a0.x, a0.x + ux * win.width) - pad;
          return side === "front" ? { x, y: wall.a.y - t / 2 - len, width: win.width + 2 * pad, depth: len } : { x, y: wall.a.y + t / 2, width: win.width + 2 * pad, depth: len };
        }
        const y = Math.min(a0.y, a0.y + uy * win.width) - pad;
        return side === "left" ? { x: wall.a.x - t / 2 - len, y, width: len, depth: win.width + 2 * pad } : { x: wall.a.x + t / 2, y, width: len, depth: win.width + 2 * pad };
      };
      if (win.terrace) continue;
      if (win.balconyDoor && level.index > 0 && ex.balconyDepth > 0 && (side === "front" || side === "rear")) {
        const room = level.rooms.find((r) => r.id === win.roomId)!;
        const width = Math.min(room.clearWidth - 200, Math.max(2400, win.width + 1200));
        const r = along(ex.balconyDepth, (width - win.width) / 2);
        balconies.push({ ...r, id: `${level.id}-bal-${room.id}`, levelId: level.id, roomId: room.id, elevation: level.elevation, side: side === "front" ? "front" : "rear" });
        continue;
      }
      if (ex.shadingDepth > 0 && !win.balconyDoor) {
        const r = along(ex.shadingDepth, 150);
        hoods.push({ ...r, id: `${win.id}-hood`, windowId: win.id, levelId: level.id, z: level.elevation + win.sill + win.height + 150 });
      }
    }
  }
  // Hoods directly under a balcony or porch are redundant — the slab above already shades them.
  const covered = (h: (typeof hoods)[number]) =>
    balconies.some((b) => b.elevation > h.z && overlaps(b, h)) || (!!porch && h.z < porch.canopyTop + 200 && overlaps(porch, h));
  const finalHoods = hoods.filter((h) => !covered(h));

  if (ex.services.acUnits) {
    const used = new Map<string, Rect[]>();
    for (const level of model.levels) {
      for (const room of level.rooms.filter((r) => AC_ROOMS.includes(r.type))) {
        // Prefer side and rear walls — keep units off the street façade.
        const walls = level.walls.filter((w) => w.exterior && w.rooms[0] === room.id)
          .sort((a, b) => rank(a) - rank(b));
        function rank(w: (typeof walls)[number]) { const sd = wallOutward(level, w); return sd === "front" ? 2 : sd === "rear" ? 1 : 0; }
        const placed = walls.some((wall) => {
          const L = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
          const { ux, uy } = wallFrame(wall);
          const busy = level.windows.filter((w) => w.wallId === wall.id).map((w) => [w.offset - 150, w.offset + w.width + 150] as const);
          for (const s of [300, L - 1200, L / 2 - 450]) {
            if (s < 0 || s + 900 > L) continue;
            if (busy.some(([a, b]) => s < b && s + 900 > a)) continue;
            const p = { x: wall.a.x + ux * s, y: wall.a.y + uy * s };
            const sd = wallOutward(level, wall);
            const r: Rect = wall.a.y === wall.b.y
              ? { x: Math.min(p.x, p.x + ux * 900), y: sd === "front" ? wall.a.y - t / 2 - 350 : wall.a.y + t / 2, width: 900, depth: 350 }
              : { x: sd === "left" ? wall.a.x - t / 2 - 350 : wall.a.x + t / 2, y: Math.min(p.y, p.y + uy * 900), width: 350, depth: 900 };
            const key = `${level.id}`;
            if ((used.get(key) ?? []).some((u) => overlaps(u, r, 100))) continue;
            used.set(key, [...(used.get(key) ?? []), r]);
            acUnits.push({ ...r, id: `${room.id}-ac`, roomId: room.id, z: level.index === 0 ? 0 : level.elevation + 200, h: 600 });
            return true;
          }
          return false;
        });
        if (!placed) warnings.push(`No clear exterior wall for ${room.name}'s AC outdoor unit — a professional should locate it.`);
      }
    }
  }

  // ---- Site: boundary, gates, paving, drains --------------------------------
  const PW = model.site.plot.width, PD = model.site.plot.depth;
  const boundary: ExteriorGeometry["site"]["boundary"] = [];
  const gates: ExteriorGeometry["site"]["gates"] = [];
  const dw = model.site.driveway;
  const entranceSiteX = entranceX + o.x;

  const frontKind = ex.boundary.front, sideKind = ex.boundary.sides;
  const ft = frontKind === "none" ? 0 : BOUNDARY_THICKNESS[frontKind];
  const st = sideKind === "none" ? 0 : BOUNDARY_THICKNESS[sideKind];
  if (frontKind !== "none") {
    // Openings in the front boundary: vehicle gate over the driveway, pedestrian gate at the entrance.
    const openings: [number, number, "vehicle" | "pedestrian" | null][] = [];
    if (dw) {
      const gw = ex.gate ? Math.min(Math.max(ex.gate.vehicleWidth, dw.width), PW - 2 * st - 1000) : dw.width;
      const gx = Math.min(Math.max(dw.x + dw.width / 2 - gw / 2, st), PW - st - gw);
      openings.push([gx, gx + gw, ex.gate ? "vehicle" : null]);
    }
    const pw = 1200;
    let px = entranceSiteX - pw / 2;
    if (openings.some(([a, b]) => px < b + 600 && px + pw > a - 600)) {
      const [a, b] = openings[0];
      px = a - 600 - pw >= st ? a - 600 - pw : b + 600;
    }
    if (px + pw <= PW - st) openings.push([px, px + pw, ex.gate?.pedestrian ? "pedestrian" : null]);
    openings.sort((x, y) => x[0] - y[0]);
    let cursor = 0;
    openings.forEach(([a, b, kind], i) => {
      if (a > cursor) boundary.push({ id: `bnd-front-${i}`, a: { x: cursor, y: ft / 2 }, b: { x: a, y: ft / 2 }, height: ex.boundary.frontHeight, thickness: ft, kind: frontKind });
      if (kind) gates.push({ id: `gate-${kind}`, kind, a: { x: a, y: ft / 2 }, b: { x: b, y: ft / 2 }, height: ex.boundary.frontHeight });
      cursor = b;
    });
    if (cursor < PW) boundary.push({ id: "bnd-front-end", a: { x: cursor, y: ft / 2 }, b: { x: PW, y: ft / 2 }, height: ex.boundary.frontHeight, thickness: ft, kind: frontKind });
  }
  if (sideKind !== "none") {
    boundary.push(
      { id: "bnd-left", a: { x: st / 2, y: ft }, b: { x: st / 2, y: PD }, height: ex.boundary.height, thickness: st, kind: sideKind },
      { id: "bnd-right", a: { x: PW - st / 2, y: ft }, b: { x: PW - st / 2, y: PD }, height: ex.boundary.height, thickness: st, kind: sideKind },
      { id: "bnd-rear", a: { x: st, y: PD - st / 2 }, b: { x: PW - st, y: PD - st / 2 }, height: ex.boundary.height, thickness: st, kind: sideKind },
    );
  }

  const ob = buildingBounds(model).outer;
  const bldg: Rect = { x: o.x + ob.x0, y: o.y + ob.y0, width: ob.x1 - ob.x0, depth: ob.y1 - ob.y0 };
  const frontOfBuilding = o.y + (steps?.y ?? porch?.y ?? -t / 2);
  const paving: Rect[] = [];
  const paths: Rect[] = [];
  if (ex.compound.paving === "front_yard") {
    paving.push({ x: st, y: ft, width: PW - 2 * st, depth: Math.max(0, bldg.y - ft) });
  } else if (frontOfBuilding > ft + 300) {
    paths.push({ x: entranceSiteX - 600, y: ft, width: 1200, depth: frontOfBuilding - ft });
  }

  const drains: ExteriorGeometry["site"]["drains"] = [];
  if (ex.compound.drains) {
    const i = Math.max(st, ft) + 200;
    drains.push(
      { a: { x: i, y: i }, b: { x: PW - i, y: i } }, { a: { x: PW - i, y: i }, b: { x: PW - i, y: PD - i } },
      { a: { x: PW - i, y: PD - i }, b: { x: i, y: PD - i } }, { a: { x: i, y: PD - i }, b: { x: i, y: i } },
    );
  }

  // ---- Terraces: the exposed roof of a lower floor ---------------------------
  const terraces: ExteriorGeometry["attached"]["terraces"] = [];
  const sortedLevels = [...model.levels].sort((a, b) => a.index - b.index);
  const onWall = (p: Point, w: { a: Point; b: Point }) =>
    w.a.y === w.b.y
      ? Math.abs(p.y - w.a.y) <= 1 && p.x >= Math.min(w.a.x, w.b.x) - 1 && p.x <= Math.max(w.a.x, w.b.x) + 1
      : Math.abs(p.x - w.a.x) <= 1 && p.y >= Math.min(w.a.y, w.b.y) - 1 && p.y <= Math.max(w.a.y, w.b.y) + 1;
  for (let i = 1; i < sortedLevels.length; i++) {
    const lower = sortedLevels[i - 1], upper = sortedLevels[i];
    const lowerExt = lower.walls.filter((w) => w.exterior);
    for (const [k, r] of exposedRects(lower.rooms, upper.rooms).entries()) {
      if (Math.min(r.width, r.depth) < 900) continue;
      const corners = [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.depth }, { x: r.x, y: r.y + r.depth }];
      const balustrade: { a: Point; b: Point }[] = [];
      for (let e = 0; e < 4; e++) {
        const a = corners[e], b = corners[(e + 1) % 4];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (lowerExt.some((w) => onWall(mid, w))) balustrade.push({ a, b });
      }
      terraces.push({ ...r, id: `${upper.id}-terrace-${k + 1}`, levelId: upper.id, elevation: upper.elevation, balustrade });
    }
  }

  // ---- Services in the compound --------------------------------------------
  const services: ExteriorGeometry["site"]["services"] = [];
  let pool: ExteriorGeometry["site"]["pool"] = null;
  if (ex.pool) {
    const deckM = 1200;
    const clear = (r: Rect) => !overlaps(r, bldg, 1500) && !(dw && overlaps(r, dw, 600)) && !paving.some((pv) => overlaps(r, pv))
      && r.x >= st + 600 && r.y >= ft + 600 && r.x + r.width <= PW - st - 600 && r.y + r.depth <= PD - st - 600;
    const tryPlace = (L: Mm, Wd: Mm) => {
      const cands: Rect[] = [];
      const rearY = bldg.y + bldg.depth + 1500;
      for (const [w, d] of [[L, Wd], [Wd, L]] as const) {
        const dwW = w + 2 * deckM, dwD = d + 2 * deckM;
        // Rear garden (centred, then towards each side), then the side yards.
        cands.push({ x: (PW - dwW) / 2, y: rearY, width: dwW, depth: dwD });
        cands.push({ x: st + 600, y: rearY, width: dwW, depth: dwD }, { x: PW - st - 600 - dwW, y: rearY, width: dwW, depth: dwD });
        cands.push({ x: st + 600, y: bldg.y, width: dwW, depth: dwD }, { x: PW - st - 600 - dwW, y: bldg.y, width: dwW, depth: dwD });
      }
      return cands.find(clear) ?? null;
    };
    const L0 = ex.pool.length, W0 = ex.pool.width;
    let deck: Rect | null = null, size: [Mm, Mm] = [L0, W0];
    for (const f of [1, 0.85, 0.7]) {
      const L = Math.max(5000, Math.round((L0 * f) / 100) * 100), Wd = Math.max(2500, Math.round((W0 * f) / 100) * 100);
      deck = tryPlace(L, Wd);
      if (deck) { size = [L, Wd]; break; }
    }
    if (deck) {
      const water: Rect = { x: deck.x + deckM, y: deck.y + deckM, width: deck.width - 2 * deckM, depth: deck.depth - 2 * deckM };
      const equipment: Rect = { x: deck.x + deck.width - 1200, y: deck.y + deck.depth - 900, width: 1200, depth: 800 };
      pool = { water, deck, equipment };
      if (size[0] !== L0) warnings.push(`The pool was reduced to ${(size[0] / 1000).toFixed(1)} × ${(size[1] / 1000).toFixed(1)} m to fit the garden.`);
    } else {
      warnings.push(`There isn't room for a ${(L0 / 1000).toFixed(1)} × ${(W0 / 1000).toFixed(1)} m pool in the garden — it needs about ${((L0 + 2 * deckM) / 1000).toFixed(1)} × ${((W0 + 2 * deckM) / 1000).toFixed(1)} m of open ground clear of the house. Try a larger plot or a smaller footprint.`);
    }
  }

  const blocked = (r: Rect) => overlaps(r, bldg, 1000) || (!!dw && overlaps(r, dw, 300)) || services.some((s) => s.placement !== "roof" && overlaps(s, r, 600)) || (!!pool && overlaps(r, pool.deck, 600))
    || r.x < st || r.y < ft || r.x + r.width > PW - st || r.y + r.depth > PD - st;
  const place = (kind: "water_tank" | "generator_house", w: Mm, d: Mm, h: Mm, label: string, extra: Partial<ExteriorGeometry["site"]["services"][number]> = {}) => {
    const m = 600;
    const candidates: Rect[] = [
      { x: st + m, y: PD - st - m - d, width: w, depth: d }, { x: PW - st - m - w, y: PD - st - m - d, width: w, depth: d },
      { x: st + m, y: bldg.y + bldg.depth / 2 - d / 2, width: w, depth: d }, { x: PW - st - m - w, y: bldg.y + bldg.depth / 2 - d / 2, width: w, depth: d },
    ];
    const r = candidates.find((c) => !blocked(c));
    if (r) services.push({ ...r, id: kind, kind, h, ...extra });
    else warnings.push(`No space in the compound for the ${label} — a professional should site it.`);
  };
  if (ex.services.waterTank) {
    // A roof tank stands on the flat roof behind the parapet; with a pitched roof it goes underground instead.
    let tank = ex.services.tank ?? "stand";
    if (tank === "roof" && model.roof.type !== "flat") tank = "underground";
    if (tank === "roof") {
      const top = model.levels.reduce((a, b) => (b.index > a.index ? b : a));
      // Low sectional tank (~5 m³) over the largest room it fits on, clear of the parapet.
      const w = 2500, d = 2000;
      const host = [...top.rooms].filter((r) => r.type !== "stair" && r.width - t >= w + 600 && r.depth - t >= d + 600)
        .sort((a, b) => b.width * b.depth - a.width * a.depth)[0];
      if (host) {
        services.push({ id: "water_tank", kind: "water_tank", placement: "roof", x: o.x + host.x + (host.width - w) / 2, y: o.y + host.y + (host.depth - d) / 2, width: w, depth: d, h: 1000, z: ex.plinth + roofGeometry(model).eaveZ + 150 });
      } else tank = "underground";
    }
    if (tank === "underground") place("water_tank", 2500, 2000, 150, "underground water tank", { placement: "underground" });
    if (tank === "stand") place("water_tank", 2000, 2000, 5500, "water tank stand", { placement: "stand" });
  }
  if (ex.services.generatorHouse) place("generator_house", 2400, 1800, 2400, "generator house");

  // ---- Trees: a deterministic grid over open ground --------------------------
  const trees: ExteriorGeometry["site"]["trees"] = [];
  if (ex.compound.trees !== "none") {
    const spec = { palms: { r: 1500, h: 7000, step: 4000, kind: "palm" as const }, shade: { r: 2600, h: 7500, step: 6500, kind: "shade" as const }, ornamental: { r: 1300, h: 4000, step: 4500, kind: "ornamental" as const } }[ex.compound.trees];
    const inset = Math.max(st, ft) + spec.r + 300;
    const busy = [bldg, ...(dw ? [dw] : []), ...paving, ...paths, ...services.filter((sv) => sv.placement !== "roof"), ...(pool ? [pool.deck] : [])];
    for (let y = inset; y <= PD - inset; y += spec.step) {
      for (let x = inset; x <= PW - inset; x += spec.step) {
        const disc: Rect = { x: x - spec.r, y: y - spec.r, width: 2 * spec.r, depth: 2 * spec.r };
        if (busy.some((b) => overlaps(disc, b, 400))) continue;
        // Keep trees near the boundary so the middle of the yard stays usable.
        const nearEdge = x - inset < spec.step || PW - inset - x < spec.step || PD - inset - y < spec.step;
        if (!nearEdge) continue;
        trees.push({ id: `tree-${trees.length + 1}`, x, y, radius: spec.r, height: spec.h, kind: spec.kind });
      }
    }
  }

  // ---- Planting beds along free boundary edges ------------------------------
  const beds: Rect[] = [];
  const shrubs: { x: Mm; y: Mm; r: Mm }[] = [];
  if (sideKind !== "none" || frontKind !== "none") {
    const bedW = 1000;
    const strips: Rect[] = [
      { x: st, y: ft, width: bedW, depth: PD - ft - st },
      { x: PW - st - bedW, y: ft, width: bedW, depth: PD - ft - st },
      { x: st + bedW, y: PD - st - bedW, width: PW - 2 * st - 2 * bedW, depth: bedW },
    ];
    const keepOut: Rect[] = [
      { ...bldg, x: bldg.x - 600, y: bldg.y - 600, width: bldg.width + 1200, depth: bldg.depth + 1200 },
      ...(dw ? [dw] : []), ...paving, ...paths, ...services.filter((sv) => sv.placement !== "roof").map((sv) => ({ ...sv, x: sv.x - 300, y: sv.y - 300, width: sv.width + 600, depth: sv.depth + 600 })),
      ...(pool ? [pool.deck] : []),
    ];
    for (const r of exposedRects(strips, keepOut)) {
      if (Math.max(r.width, r.depth) < 1500 || Math.min(r.width, r.depth) < 600) continue;
      beds.push(r);
      const along = r.width >= r.depth;
      const len = along ? r.width : r.depth;
      const n = Math.max(1, Math.floor(len / 900));
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        shrubs.push({ x: along ? r.x + f * r.width : r.x + r.width / 2, y: along ? r.y + r.depth / 2 : r.y + f * r.depth, r: 320 + ((i * 7919) % 5) * 40 });
      }
    }
  }

  // ---- Parking bays (open parking) -------------------------------------------
  const parkingBays: Rect[] = [];
  if (dw && !model.site.parking.covered && model.site.parking.spaces > 0) {
    const n = model.site.parking.spaces;
    const bw = dw.width / n;
    for (let i = 0; i < n; i++) parkingBays.push({ x: dw.x + i * bw + 150, y: dw.y + Math.max(300, dw.depth - 5300), width: bw - 300, depth: Math.min(5000, dw.depth - 300) });
  }

  // ---- Carport over the bays ----------------------------------------------------
  const carports: NonNullable<ExteriorGeometry["site"]["carports"]> = [];
  if (ex.carport && dw && parkingBays.length) {
    const x0 = Math.min(...parkingBays.map((b) => b.x)) - 100, x1 = Math.max(...parkingBays.map((b) => b.x + b.width)) + 100;
    const y0 = Math.min(...parkingBays.map((b) => b.y)) - 100, y1 = Math.max(...parkingBays.map((b) => b.y + b.depth)) + 100;
    const r: Rect = { x: Math.max(dw.x, x0), y: Math.max(dw.y, y0), width: Math.min(dw.x + dw.width, x1) - Math.max(dw.x, x0), depth: Math.min(dw.y + dw.depth, y1) - Math.max(dw.y, y0) };
    // Posts on both long edges, between bays, so no post stands in a bay.
    const xs = [r.x + 100, ...parkingBays.slice(1).map((b) => b.x - 150), r.x + r.width - 100];
    const posts = xs.flatMap((x) => [{ x, y: r.y + 100 }, { x, y: r.y + r.depth - 100 }]);
    if (!overlaps(r, bldg, 0)) carports.push({ ...r, id: "carport-1", height: 2500, posts });
    else warnings.push("The carport would touch the house, so it was left out — a professional can detail an attached canopy instead.");
  } else if (ex.carport && !parkingBays.length) {
    warnings.push("A carport was requested but there are no open parking bays to cover (parking is in a garage or set to zero).");
  }

  // ---- Lighting ---------------------------------------------------------------
  const lights: ExteriorGeometry["site"]["lights"] = [];
  if (porch) for (const c of porch.columns.length ? porch.columns : [{ x: porch.x + 300, y: porch.y + porch.depth - 200 }, { x: porch.x + porch.width - 300, y: porch.y + porch.depth - 200 }]) {
    lights.push({ id: `light-porch-${lights.length}`, x: c.x + o.x, y: c.y + o.y, z: ex.plinth + porch.canopyTop - 200, kind: "porch" });
  }
  if (ex.compound.lighting) {
    for (const g of gates) lights.push({ id: `light-${g.id}-a`, x: g.a.x, y: g.a.y, z: g.height + 300, kind: "gate" }, { id: `light-${g.id}-b`, x: g.b.x, y: g.b.y, z: g.height + 300, kind: "gate" });
    for (const b of boundary.filter((s) => s.kind === "masonry_wall")) {
      const len = Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y);
      for (let d = 4000; d < len - 2000; d += 8000) {
        const f = d / len;
        lights.push({ id: `light-${b.id}-${d}`, x: b.a.x + (b.b.x - b.a.x) * f, y: b.a.y + (b.b.y - b.a.y) * f, z: b.height + 200, kind: "perimeter" });
      }
    }
  }

  return {
    geometry: {
      attached: { steps, porch, balconies, hoods: finalHoods, acUnits, terraces },
      site: { boundary, gates, paving, paths, drains, trees, services, lights, pool, planting: { beds, shrubs }, parkingBays, carports },
    },
    warnings,
  };
}

/** Building-local rectangle → plot coordinates. */
export function siteRect(model: BuildingModel, r: Rect): Rect {
  return { x: r.x + model.site.footprintOrigin.x, y: r.y + model.site.footprintOrigin.y, width: r.width, depth: r.depth };
}
