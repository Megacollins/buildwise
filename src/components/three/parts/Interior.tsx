"use client";

/**
 * Per-level interior: slabs, floor finishes, stairs with handrails, and fixtures.
 * Fixture positions and sizes come from domain/model/fixtures (the same data the
 * plans draw); this file only gives each kind a recognisable shape inside its box.
 */
import { useMemo, type ReactNode } from "react";
import type { BuildingModel, Level, Room } from "@/domain/model/types";
import { levelFixtures, type Fixture, type FixtureKind } from "@/domain/model/fixtures";
import { Beam, Box, m, type Mats } from "../core";
import { plainMaterial, surfaceMaterial } from "../textures";
import { Car } from "./Site";
import { WallMeshes } from "./Walls";

type Side = "N" | "S" | "E" | "W"; // N = +y

export function LevelMeshes({ model, level, mats, furnished, finished, night, accentWalls, slimFrames }: {
  model: BuildingModel; level: Level; mats: Mats; furnished: boolean; finished: boolean; night: boolean;
  accentWalls: Set<string>; slimFrames: boolean;
}) {
  const t = model.params.wallThickness.exterior;
  const slab = model.params.slabThickness;
  const W = model.footprint.width, D = model.footprint.depth;
  const wallTop = level.height - slab;
  const bands = model.exterior?.visual?.floorBands ?? false;
  const fixtures = useMemo(
    () => (finished ? levelFixtures(level, model.params.wallThickness.interior, t, W, D) : []),
    [level, finished, model.params.wallThickness.interior, t, W, D],
  );
  const rooms = useMemo(() => new Map(level.rooms.map((r) => [r.id, r])), [level]);

  return (
    <group position={[0, m(level.elevation), 0]}>
      {level.index > 0 && level.rooms.map((r) => (
        <group key={`sl-${r.id}`}>
          <Box x0={r.x - t / 2} y0={r.y - t / 2} z0={-slab} x1={r.x + r.width + t / 2} y1={r.y + r.depth + t / 2} z1={0} material={mats.slab} />
          {/* Slab edge expressed on the facade as a horizontal band where the style calls for it */}
          {finished && bands && <Box x0={r.x - t / 2 - 50} y0={r.y - t / 2 - 50} z0={-slab - 40} x1={r.x + r.width + t / 2 + 50} y1={r.y + r.depth + t / 2 + 50} z1={-slab + 120} material={mats.trim} castShadow={false} />}
        </group>
      ))}
      {finished && level.rooms.map((r) => (
        <Box key={r.id} x0={r.x} x1={r.x + r.width} y0={r.y} y1={r.y + r.depth} z0={0} z1={6} material={floorFor(r, mats)} castShadow={false} />
      ))}
      {level.walls.map((w) => (
        <WallMeshes key={w.id} level={level} wall={w} top={wallTop} mats={mats} finished={finished} accent={accentWalls.has(w.id)} slimFrames={slimFrames} />
      ))}
      {level.stairs.map((s) => <StairMesh key={s.id} stair={s} mats={mats} finished={finished} />)}
      {fixtures.filter((f) => furnished || f.fixed).map((f) => {
        const room = rooms.get(f.roomId);
        return room ? <FixtureMesh key={f.id} f={f} room={room} mats={mats} /> : null;
      })}
      {night && level.rooms.filter((r) => r.area > 4 && r.type !== "stair").slice(0, 10).map((r) => (
        <pointLight key={`pl-${r.id}`} position={[m(r.x + r.width / 2), m(level.ceilingHeight - 300), -m(r.y + r.depth / 2)]} intensity={2.2} distance={m(Math.max(r.width, r.depth) * 1.6)} color="#ffd9a0" decay={1.5} />
      ))}
    </group>
  );
}

function floorFor(r: Room, mats: Mats) {
  if (r.type === "bathroom" || r.type === "wc" || r.type === "laundry") return surfaceMaterial("tile", "#dcd8d0", { roughness: 0.35 });
  if (r.type === "garage" || r.type === "storage") return surfaceMaterial("concrete", "#a9a59d");
  return mats.floor;
}

function StairMesh({ stair: s, mats, finished }: { stair: Level["stairs"][number]; mats: Mats; finished: boolean }) {
  const n1 = Math.ceil(s.risers / 2), n2 = s.risers - n1;
  const parts: ReactNode[] = [];
  for (let i = 0; i < n1; i++) parts.push(<Box key={`a${i}`} x0={s.x} x1={s.x + s.flightWidth} y0={s.y + i * s.tread} y1={s.y + (i + 1) * s.tread} z0={i * s.riserHeight} z1={(i + 1) * s.riserHeight} material={mats.stair} />);
  const landingY = s.y + (n1 - 1) * s.tread;
  parts.push(<Box key="land" x0={s.x} x1={s.x + s.width} y0={landingY + s.tread} y1={landingY + s.tread + s.flightWidth} z0={n1 * s.riserHeight - 150} z1={n1 * s.riserHeight} material={mats.stair} />);
  const xR = s.x + s.width - s.flightWidth;
  for (let i = 0; i < n2; i++) {
    const z = (n1 + i + 1) * s.riserHeight;
    parts.push(<Box key={`b${i}`} x0={xR} x1={xR + s.flightWidth} y0={landingY - i * s.tread} y1={landingY - (i - 1) * s.tread} z0={z - s.riserHeight} z1={z} material={mats.stair} />);
  }
  if (finished) {
    // Handrails on the open (well) side of each flight, 900 mm above the nosings, with posts at the ends.
    const xi = s.x + s.flightWidth - 40, xo = xR + 40, rail = 900;
    const a1 = { x: xi, y: s.y + s.tread / 2, z: s.riserHeight + rail }, b1 = { x: xi, y: landingY + s.tread / 2, z: n1 * s.riserHeight + rail };
    const a2 = { x: xo, y: landingY + s.tread / 2, z: (n1 + 1) * s.riserHeight + rail }, b2 = { x: xo, y: landingY - (n2 - 1) * s.tread + s.tread / 2, z: s.risers * s.riserHeight + rail };
    parts.push(<Beam key="r1" a={a1} b={b1} size={45} material={mats.steel} />, <Beam key="r2" a={a2} b={b2} size={45} material={mats.steel} />);
    for (const [k, p] of [a1, b1, a2, b2].entries()) parts.push(<Beam key={`p${k}`} a={{ ...p, z: p.z - rail }} b={p} size={40} material={mats.steel} />);
    // Glass infill along each flight
    parts.push(<Beam key="g1" a={{ ...a1, z: a1.z - rail / 2 }} b={{ ...b1, z: b1.z - rail / 2 }} size={12} material={mats.balGlass} />);
  }
  return <group>{parts}</group>;
}

/** Which side of the room the fixture's back is against (nearest room edge, door-side preference ignored). */
function backSide(f: Fixture, room: Room): Side {
  if (f.kind === "chair") {
    // Chairs face the room's table: back away from the room centre along the room's short axis.
    const cx = room.x + room.width / 2, cy = room.y + room.depth / 2;
    const fx = f.x + f.w / 2, fy = f.y + f.d / 2;
    return Math.abs(fy - cy) * room.width > Math.abs(fx - cx) * room.depth ? (fy > cy ? "N" : "S") : (fx > cx ? "E" : "W");
  }
  const gaps: [Side, number][] = [
    ["S", f.y - room.y], ["N", room.y + room.depth - (f.y + f.d)],
    ["W", f.x - room.x], ["E", room.x + room.width - (f.x + f.w)],
  ];
  return gaps.sort((a, b) => a[1] - b[1])[0][0];
}

const C = {
  fabric: "#7d8790", fabricDark: "#59636b", linen: "#ece7dd", pillow: "#f6f4ef", wood: "#8a6a4d", woodDark: "#5a4535",
  white: "#f5f5f2", steel: "#b9bdc0", black: "#1d1f21", rug: "#b8a58c",
};

function FixtureMesh({ f, room, mats }: { f: Fixture; room: Room; mats: Mats }) {
  const back = backSide(f, room);
  const alongX = back === "N" || back === "S";
  const A = alongX ? f.w : f.d; // length along the back wall
  const V = alongX ? f.d : f.w; // depth into the room
  /** Local box: u along the back wall [u0,u1], v out from the back [v0,v1], z above floor. */
  const L = (key: string, u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, mat: THREE_Material): ReactNode => {
    let x0: number, x1: number, y0: number, y1: number;
    switch (back) {
      case "N": x0 = f.x + u0; x1 = f.x + u1; y0 = f.y + f.d - v1; y1 = f.y + f.d - v0; break;
      case "S": x0 = f.x + u0; x1 = f.x + u1; y0 = f.y + v0; y1 = f.y + v1; break;
      case "E": y0 = f.y + u0; y1 = f.y + u1; x0 = f.x + f.w - v1; x1 = f.x + f.w - v0; break;
      case "W": y0 = f.y + u0; y1 = f.y + u1; x0 = f.x + v0; x1 = f.x + v1; break;
    }
    return <Box key={key} x0={x0} x1={x1} y0={y0} y1={y1} z0={f.z + z0} z1={f.z + z1} material={mat} />;
  };
  const P = (c: string, o: Parameters<typeof plainMaterial>[1] = {}) => plainMaterial(c, o);
  const legs = (top: number, inset: number, mat: THREE_Material, s = 50) => [
    L("l1", inset, inset + s, inset, inset + s, 0, top, mat), L("l2", A - inset - s, A - inset, inset, inset + s, 0, top, mat),
    L("l3", inset, inset + s, V - inset - s, V - inset, 0, top, mat), L("l4", A - inset - s, A - inset, V - inset - s, V - inset, 0, top, mat),
  ];
  const k: FixtureKind = f.kind;
  let parts: ReactNode[] = [];
  switch (k) {
    case "bed": {
      const wood = surfaceMaterial("wood", C.woodDark);
      parts = [
        L("base", 0, A, 60, V, 0, 300, wood),
        L("mat", 30, A - 30, 90, V - 30, 300, 520, P(C.white, { roughness: 0.9 })),
        L("duvet", 10, A - 10, 800, V - 10, 470, 545, P(C.linen, { roughness: 0.95 })),
        L("head", -40, A + 40, 0, 80, 0, 1150, surfaceMaterial("wood", C.woodDark)),
        L("p1", 120, A / 2 - 40, 140, 560, 520, 640, P(C.pillow, { roughness: 0.95 })),
        L("p2", A / 2 + 40, A - 120, 140, 560, 520, 640, P(C.pillow, { roughness: 0.95 })),
      ];
      break;
    }
    case "nightstand":
      parts = [L("b", 0, A, 0, V, 0, 480, surfaceMaterial("wood", C.wood)), L("lamp", A / 2 - 60, A / 2 + 60, V / 2 - 60, V / 2 + 60, 480, 560, P(C.steel, { metalness: 0.6 })),
        L("shade", A / 2 - 110, A / 2 + 110, V / 2 - 110, V / 2 + 110, 560, 760, P("#f3e9d6", { emissive: "#ffe2b0", emissiveIntensity: 0.15 }))];
      break;
    case "sofa": {
      const fab = P(C.fabric, { roughness: 1 }), dark = P(C.fabricDark, { roughness: 1 });
      const seats = Math.max(2, Math.round((A - 400) / 800)), cw = (A - 400) / seats;
      parts = [
        L("base", 0, A, 0, V, 60, 420, fab), L("back", 0, A, 0, 220, 420, 820, fab),
        L("armL", 0, 200, 0, V, 420, 620, fab), L("armR", A - 200, A, 0, V, 420, 620, fab),
        ...Array.from({ length: seats }, (_, i) => L(`c${i}`, 200 + i * cw + 10, 200 + (i + 1) * cw - 10, 220, V - 20, 420, 520, dark)),
        L("feet", 40, A - 40, 40, V - 40, 0, 60, P(C.black)),
      ];
      break;
    }
    case "coffee_table":
      parts = [L("top", 0, A, 0, V, 360, 410, surfaceMaterial("wood", C.wood)), L("shelf", 60, A - 60, 60, V - 60, 100, 130, surfaceMaterial("wood", C.wood)), ...legs(360, 30, P(C.black), 40)];
      break;
    case "dining_table":
      parts = [L("top", 0, A, 0, V, 715, 755, surfaceMaterial("wood", C.wood)), ...legs(715, 60, surfaceMaterial("wood", C.woodDark), 70)];
      break;
    case "chair": {
      const w = surfaceMaterial("wood", C.woodDark), s = P(C.fabricDark, { roughness: 1 });
      parts = [L("seat", 0, A, 0, V, 430, 480, s), L("back", 0, A, 0, 50, 480, 900, w), ...legs(430, 20, w, 40)];
      break;
    }
    case "counter":
      parts = [
        L("plinth", 0, A, 0, V - 60, 0, 100, P(C.black)),
        L("carcass", 0, A, 0, V - 20, 100, 860, mats.cabinet),
        L("top", 0, A, 0, V + 20, 860, 900, mats.counter),
        // Door/drawer joints every 600 mm
        ...Array.from({ length: Math.max(0, Math.floor(A / 600) - 1) }, (_, i) => L(`j${i}`, (i + 1) * 600 - 3, (i + 1) * 600 + 3, V - 22, V - 18, 110, 850, P(C.black))),
      ];
      break;
    case "wall_cabinet":
      parts = [L("box", 0, A, 0, V, 0, f.h, mats.cabinet),
        ...Array.from({ length: Math.max(0, Math.floor(A / 600) - 1) }, (_, i) => L(`j${i}`, (i + 1) * 600 - 3, (i + 1) * 600 + 3, V, V + 3, 10, f.h - 10, P(C.black)))];
      break;
    case "fridge":
      parts = [L("box", 0, A, 0, V, 0, f.h, P("#c9cdd0", { metalness: 0.7, roughness: 0.3 })), L("split", 0, A, V, V + 4, 1150, 1160, P(C.black)),
        L("h1", A - 80, A - 60, V, V + 40, 1250, 1650, P(C.steel, { metalness: 0.8 })), L("h2", A - 80, A - 60, V, V + 40, 700, 1050, P(C.steel, { metalness: 0.8 }))];
      break;
    case "sink":
      parts = [L("bowl", 40, A - 40, 40, V - 40, 880, 905, P(C.steel, { metalness: 0.8, roughness: 0.25 })), L("tap", A / 2 - 20, A / 2 + 20, 0, 40, 900, 1200, P(C.steel, { metalness: 0.9 }))];
      break;
    case "hob":
      parts = [L("glass", 0, A, 0, V, 900, 908, P(C.black, { roughness: 0.15 })), L("hood", 0, A, 0, 450, 1550, 1700, P(C.steel, { metalness: 0.8 }))];
      break;
    case "wc":
      parts = [L("cistern", 30, A - 30, 0, 170, 0, 820, P(C.white, { roughness: 0.2 })), L("pan", 50, A - 50, 170, V, 0, 400, P(C.white, { roughness: 0.2 })), L("seat", 40, A - 40, 180, V, 400, 420, P(C.white, { roughness: 0.3 }))];
      break;
    case "basin":
      parts = [L("vanity", 0, A, 0, V, 0, 820, surfaceMaterial("wood", C.wood)), L("top", 0, A, 0, V, 820, 850, P(C.white, { roughness: 0.2 })), L("mirror", 40, A - 40, 0, 15, 1100, 1800, P("#cfdfe6", { metalness: 0.9, roughness: 0.05 })),
        L("tap", A / 2 - 15, A / 2 + 15, 30, 80, 850, 1050, P(C.steel, { metalness: 0.9 }))];
      break;
    case "shower":
      parts = [L("tray", 0, A, 0, V, 0, 60, P(C.white, { roughness: 0.3 })), L("screen", 0, A, V - 15, V, 60, 2000, mats.balGlass),
        L("head", A / 2 - 100, A / 2 + 100, 0, 250, 2050, 2080, P(C.steel, { metalness: 0.9 }))];
      break;
    case "bathtub":
      parts = [L("shell", 0, A, 0, V, 0, 550, P(C.white, { roughness: 0.2 })), L("water", 80, A - 80, 80, V - 80, 530, 552, P("#cfe6ee", { roughness: 0.05, metalness: 0.2 }))];
      break;
    case "desk":
      parts = [L("top", 0, A, 0, V, 720, 750, surfaceMaterial("wood", C.wood)), L("side", 0, 40, 0, V, 0, 720, surfaceMaterial("wood", C.wood)), L("drawers", A - 420, A, 0, V, 0, 720, surfaceMaterial("wood", C.wood)),
        L("screen", A / 2 - 300, A / 2 + 300, 80, 110, 900, 1250, P(C.black, { roughness: 0.2 })), L("stand", A / 2 - 30, A / 2 + 30, 80, 140, 750, 900, P(C.black))];
      break;
    case "washer":
      parts = [L("box", 0, A, 0, V, 0, 850, P(C.white, { roughness: 0.3 })), L("door", A / 2 - 180, A / 2 + 180, V, V + 20, 220, 580, P("#2f3438", { roughness: 0.2 }))];
      break;
    case "wardrobe":
      parts = [L("box", 0, A, 0, V, 0, f.h, surfaceMaterial("wood", "#cfc6b8")),
        ...Array.from({ length: Math.max(1, Math.round(A / 600)) - 1 }, (_, i) => { const u = ((i + 1) * A) / Math.max(1, Math.round(A / 600)); return L(`j${i}`, u - 4, u + 4, V, V + 3, 20, f.h - 20, P(C.woodDark)); })];
      break;
    case "tv_unit": {
      const tvW = Math.min(1650, A - 100);
      parts = [L("unit", 0, A, 0, V, 80, 450, surfaceMaterial("wood", C.woodDark)), L("tv", (A - tvW) / 2, (A + tvW) / 2, 20, 60, 950, 950 + tvW * 0.5625, P(C.black, { roughness: 0.15, metalness: 0.3 }))];
      break;
    }
    case "rug":
      parts = [L("rug", 0, A, 0, V, 0, 12, surfaceMaterial("render", C.rug, { roughness: 1 }))];
      break;
    case "car":
      return <Car x={f.x + f.w / 2} y={f.y + f.d / 2} along={f.d >= f.w ? "y" : "x"} color="#4a5a66" />;
  }
  return <group>{parts}</group>;
}

type THREE_Material = import("three").Material;
