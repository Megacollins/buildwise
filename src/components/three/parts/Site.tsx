"use client";

/**
 * Plot and compound, all in plot coordinates from model.site and model.exteriorGeometry.site:
 * ground, street, paving, drains, boundary + gates, services, pool, planting, parking, lights.
 * The planting palette comes from the design's resolved visual intent (style × region).
 */
import { useMemo } from "react";
import * as THREE from "three";
import type { BuildingModel } from "@/domain/model/types";
import { buildingBounds } from "@/domain/model/geometry";
import type { MaterialLooks } from "@/domain/materials/colors";
import { Box, Ground, m, type VisualMode } from "../core";
import { plainMaterial, surfaceMaterial } from "../textures";

type SiteGeom = BuildingModel["exteriorGeometry"]["site"];
type Palette = "tropical" | "temperate" | "arid";

const PALETTE: Record<Palette, { leaf: string[]; bed: string; grass: string }> = {
  tropical: { leaf: ["#3f7a35", "#4f8a3a", "#2f6a3a", "#6a9a3f"], bed: "#4a3a2c", grass: "#5d8048" },
  temperate: { leaf: ["#4d6e3c", "#5d7f45", "#6b8a52", "#7b6f9a"], bed: "#3e3328", grass: "#6a8a50" },
  arid: { leaf: ["#7d8a5a", "#8f9a68", "#a39a6a", "#6f7d55"], bed: "#b9a07a", grass: "#a49a72" },
};

export function SiteContext({ model, mode, looks, night, clearSide, showRoof = true }: {
  model: BuildingModel; mode: VisualMode; looks: MaterialLooks; night: boolean; clearSide?: "front" | "rear" | "left" | "right";
  /** Roof-mounted items are hidden with the roof in cutaway views */
  showRoof?: boolean;
}) {
  const { plot, driveway } = model.site;
  const xg = model.exteriorGeometry?.site;
  const blueprint = mode === "blueprint", structure = mode === "structure";
  const finished = mode === "finished" || mode === "furnished";
  const palette = PALETTE[model.exterior?.visual?.planting ?? "temperate"];
  const PW = plot.width, PD = plot.depth;
  const pad = 14000;

  const grass = looks.landscaping ?? { color: palette.grass, texture: "grass" as const };
  const drive = looks.driveway ?? { color: "#8d8a85", texture: "paving" as const };
  const ground = blueprint ? plainMaterial("#0c1a26") : structure ? surfaceMaterial("gravel", "#9a8a72") : surfaceMaterial("grass", grass.color);
  // The neighbourhood around the plot follows the place: desert sand in arid regions, verges elsewhere.
  const arid = (model.exterior?.visual?.planting ?? "temperate") === "arid";
  const surround = blueprint ? plainMaterial("#0b1620") : arid ? surfaceMaterial("gravel", "#d6c39d") : surfaceMaterial("grass", "#76805f");
  const paving = surfaceMaterial(drive.texture, drive.color);

  return (
    <group>
      {/* Neighbourhood ground, street, kerb and verge so the plot isn't floating */}
      <Ground x={-pad} y={-pad / 2} width={PW + 2 * pad} depth={PD + pad * 1.5} z={-20} material={surround} />
      {!blueprint && (
        <>
          <Ground x={-pad} y={-7500} width={PW + 2 * pad} depth={6500} z={-10} material={surfaceMaterial("concrete", "#4a4c4f")} />
          {/* Lane markings */}
          {finished && Array.from({ length: Math.ceil((PW + 2 * pad) / 6000) }, (_, k) => (
            <Ground key={k} x={-pad + k * 6000} y={-4300} width={3000} depth={120} z={-5} material={plainMaterial("#d8d4c8", { roughness: 0.6 })} />
          ))}
          <Box x0={-pad} x1={PW + pad} y0={-1150} y1={-1000} z0={-20} z1={130} material={surfaceMaterial("concrete", "#a9a59d")} castShadow={false} />
          <Ground x={-pad} y={-1000} width={PW + 2 * pad} depth={1000} z={-5} material={surfaceMaterial("paving", "#b9b5ad")} />
        </>
      )}
      <Ground x={0} y={0} width={PW} depth={PD} z={0} material={ground} />

      {finished && xg && (
        <>
          {xg.paving.map((r, i) => <Ground key={`pv${i}`} {...r} z={8} material={paving} />)}
          {xg.paths.map((r, i) => <Ground key={`pt${i}`} {...r} z={9} material={surfaceMaterial("tile", "#cfc8bb")} />)}
          {xg.drains.map((d, i) => {
            const len = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
            const horizontal = d.a.y === d.b.y;
            return <Ground key={`dr${i}`} x={Math.min(d.a.x, d.b.x) - (horizontal ? 0 : 150)} y={Math.min(d.a.y, d.b.y) - (horizontal ? 150 : 0)}
              width={horizontal ? len : 300} depth={horizontal ? 300 : len} z={12} material={plainMaterial("#3d3f42")} />;
          })}
          {(xg.parkingBays ?? []).map((b, i) => <ParkingBay key={`pk${i}`} bay={b} car={mode === "furnished"} index={i} />)}
          <Planting site={xg} palette={palette} />
        </>
      )}
      {driveway && !blueprint && (finished ? !xg?.paving.length : true) && (
        <Ground {...driveway} z={9} material={structure ? surfaceMaterial("concrete", "#9c9890") : paving} />
      )}

      {xg && !blueprint && xg.boundary.map((b) => <BoundarySegment key={b.id} seg={b} structure={structure} looks={looks} />)}
      {xg && finished && xg.gates.map((g) => <Gate key={g.id} gate={g} looks={looks} />)}

      {xg && finished && (xg.carports ?? []).map((c) => <Carport key={c.id} carport={c} />)}
      {xg && finished && xg.services.filter((s) => s.placement !== "roof" || showRoof).map((s) => s.kind === "water_tank" ? <WaterTank key={s.id} r={s} /> : (
        <group key={s.id}>
          <Box x0={s.x} x1={s.x + s.width} y0={s.y} y1={s.y + s.depth} z0={0} z1={s.h} material={surfaceMaterial("render", "#cfcac0")} />
          <Box x0={s.x - 150} x1={s.x + s.width + 150} y0={s.y - 150} y1={s.y + s.depth + 150} z0={s.h} z1={s.h + 120} material={surfaceMaterial("concrete", "#a8a49c")} />
          {/* Louvred door */}
          {Array.from({ length: 8 }, (_, k) => (
            <Box key={k} x0={s.x + 300} x1={s.x + s.width - 300} y0={s.y - 30} y1={s.y} z0={400 + k * 160} z1={460 + k * 160} material={plainMaterial("#4b4f53", { metalness: 0.5 })} castShadow={false} />
          ))}
        </group>
      ))}

      {xg && finished && xg.pool && <Pool pool={xg.pool} night={night} />}
      {xg && finished && xg.trees.filter((tr) => !blocksView(model, tr, clearSide)).map((tr) => <Tree key={tr.id} tree={tr} palette={palette} />)}

      {xg && finished && xg.lights.map((l, i) => (
        <group key={l.id}>
          {l.kind === "perimeter" && <Box x0={l.x - 40} x1={l.x + 40} y0={l.y - 40} y1={l.y + 40} z0={0} z1={l.z - 90} material={plainMaterial("#2b2e31", { metalness: 0.5 })} />}
          <mesh position={[m(l.x), m(l.z), -m(l.y)]}>
            <boxGeometry args={[0.18, 0.18, 0.18]} />
            <meshStandardMaterial color={night ? "#fff2cf" : "#d9d6cf"} emissive={night ? "#ffd58a" : "#000000"} emissiveIntensity={night ? 2 : 0} />
          </mesh>
          {night && i < 8 && <pointLight position={[m(l.x), m(l.z) - 0.2, -m(l.y)]} intensity={3} distance={9} decay={1.6} color="#ffd9a0" />}
        </group>
      ))}
    </group>
  );
}

/** Is this tree between the given building face and a camera looking at it? (plot coordinates) */
function blocksView(model: BuildingModel, tr: { x: number; y: number }, side?: "front" | "rear" | "left" | "right") {
  if (!side) return false;
  const o = model.site.footprintOrigin, b = buildingBounds(model).outer;
  if (side === "front") return tr.y < o.y + b.y0;
  if (side === "rear") return tr.y > o.y + b.y1;
  if (side === "left") return tr.x < o.x + b.x0;
  return tr.x > o.x + b.x1;
}

function ParkingBay({ bay, car, index }: { bay: { x: number; y: number; width: number; depth: number }; car: boolean; index: number }) {
  const line = plainMaterial("#f1efe8", { roughness: 0.6 });
  const longY = bay.depth >= bay.width;
  return (
    <group>
      {longY ? (
        <>
          <Ground x={bay.x} y={bay.y} width={80} depth={bay.depth} z={14} material={line} />
          <Ground x={bay.x + bay.width - 80} y={bay.y} width={80} depth={bay.depth} z={14} material={line} />
        </>
      ) : (
        <>
          <Ground x={bay.x} y={bay.y} width={bay.width} depth={80} z={14} material={line} />
          <Ground x={bay.x} y={bay.y + bay.depth - 80} width={bay.width} depth={80} z={14} material={line} />
        </>
      )}
      {car && <Car x={bay.x + bay.width / 2} y={bay.y + bay.depth / 2} along={longY ? "y" : "x"} color={["#5b6670", "#a9adb0", "#2d3a48"][index % 3]} />}
    </group>
  );
}

/** Indicative car for scale: body, cabin, glazing, wheels. */
export function Car({ x, y, along, color }: { x: number; y: number; along: "x" | "y"; color: string }) {
  const body = plainMaterial(color, { metalness: 0.55, roughness: 0.3 });
  const glass = plainMaterial("#1c2329", { metalness: 0.4, roughness: 0.1 });
  const tyre = plainMaterial("#1a1a1a", { roughness: 0.9 });
  return (
    <group position={[m(x), 0, -m(y)]} rotation={[0, along === "y" ? 0 : Math.PI / 2, 0]}>
      <mesh position={[0, 0.55, 0]} material={body} castShadow><boxGeometry args={[1.8, 0.65, 4.4]} /></mesh>
      <mesh position={[0, 1.08, 0.15]} material={glass} castShadow><boxGeometry args={[1.6, 0.48, 2.3]} /></mesh>
      <mesh position={[0, 1.33, 0.15]} material={body}><boxGeometry args={[1.56, 0.04, 2.0]} /></mesh>
      {[[-0.82, 1.4], [0.82, 1.4], [-0.82, -1.4], [0.82, -1.4]].map(([wx, wz], i) => (
        <mesh key={i} position={[wx, 0.33, wz]} rotation={[0, 0, Math.PI / 2]} material={tyre}><cylinderGeometry args={[0.33, 0.33, 0.24, 18]} /></mesh>
      ))}
    </group>
  );
}

function Planting({ site, palette }: { site: SiteGeom; palette: (typeof PALETTE)[Palette] }) {
  const beds = site.planting?.beds ?? [];
  const shrubs = site.planting?.shrubs;
  const soil = surfaceMaterial("gravel", palette.bed);
  // One instanced mesh per leaf colour keeps hundreds of shrubs cheap.
  const groups = useMemo(() => palette.leaf.map((c, ci) => ({ c, items: (shrubs ?? []).filter((_, i) => i % palette.leaf.length === ci) })), [shrubs, palette]);
  return (
    <group>
      {beds.map((b, i) => (
        <group key={i}>
          <Box x0={b.x} x1={b.x + b.width} y0={b.y} y1={b.y + b.depth} z0={0} z1={60} material={soil} castShadow={false} />
        </group>
      ))}
      {groups.map((g) => <Shrubs key={g.c} items={g.items} color={g.c} />)}
    </group>
  );
}

function Shrubs({ items, color }: { items: { x: number; y: number; r: number }[]; color: string }) {
  const mesh = useMemo(() => {
    if (!items.length) return null;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = plainMaterial(color, { roughness: 0.95 });
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    const o = new THREE.Object3D();
    items.forEach((s, i) => {
      const r = m(s.r);
      o.position.set(m(s.x), r * 0.75, -m(s.y));
      o.scale.set(r, r * (0.8 + ((i * 37) % 10) / 25), r);
      o.rotation.y = i;
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    return im;
  }, [items, color]);
  return mesh ? <primitive object={mesh} /> : null;
}

function Pool({ pool, night }: { pool: NonNullable<SiteGeom["pool"]>; night: boolean }) {
  const w = pool.water;
  const coping = surfaceMaterial("tile", "#efebe3");
  return (
    <group>
      <Ground {...pool.deck} z={15} material={surfaceMaterial("tile", "#ddd7cc")} />
      {/* Coping band (four sides) so the water reads as recessed */}
      <Box x0={w.x - 300} x1={w.x + w.width + 300} y0={w.y - 300} y1={w.y} z0={0} z1={60} material={coping} castShadow={false} />
      <Box x0={w.x - 300} x1={w.x + w.width + 300} y0={w.y + w.depth} y1={w.y + w.depth + 300} z0={0} z1={60} material={coping} castShadow={false} />
      <Box x0={w.x - 300} x1={w.x} y0={w.y} y1={w.y + w.depth} z0={0} z1={60} material={coping} castShadow={false} />
      <Box x0={w.x + w.width} x1={w.x + w.width + 300} y0={w.y} y1={w.y + w.depth} z0={0} z1={60} material={coping} castShadow={false} />
      {/* Tiled basin visible through the water */}
      <Ground {...w} z={-400} material={surfaceMaterial("tile", "#7ec4d8")} />
      <Ground {...w} z={20} material={plainMaterial("#2a9ccc", { transparent: true, opacity: 0.72, roughness: 0.04, metalness: 0.2, emissive: "#0a4f70", emissiveIntensity: night ? 0.7 : 0.12 })} />
      {/* Steps into the pool at the shallow end */}
      {[0, 1, 2].map((k) => (
        <Box key={k} x0={w.x} x1={w.x + Math.min(1500, w.width / 3)} y0={w.y + k * 300} y1={w.y + (k + 1) * 300} z0={-400} z1={-100 - k * 100} material={surfaceMaterial("tile", "#a8dbe8")} castShadow={false} />
      ))}
      <Box x0={pool.equipment.x} x1={pool.equipment.x + pool.equipment.width} y0={pool.equipment.y} y1={pool.equipment.y + pool.equipment.depth} z0={0} z1={900} material={surfaceMaterial("render", "#cfcac0")} />
      {night && <pointLight position={[m(w.x + w.width / 2), 0.2, -m(w.y + w.depth / 2)]} intensity={2.5} distance={8} color="#7fd6ff" />}
    </group>
  );
}

function Gate({ gate: g, looks }: { gate: SiteGeom["gates"][number]; looks: MaterialLooks }) {
  const len = Math.abs(g.b.x - g.a.x);
  const y = g.a.y;
  const steel = plainMaterial("#26292c", { metalness: 0.6, roughness: 0.4 });
  const bars = Math.floor((len - 400) / 140);
  return (
    <group>
      {[g.a.x - 200, g.b.x - 200].map((px, i) => (
        <group key={i}>
          <Box x0={px} x1={px + 400} y0={y - 200} y1={y + 200} z0={0} z1={g.height + 250} material={surfaceMaterial("render", looks.exterior_finish?.color ?? "#d8d2c6")} />
          <Box x0={px - 30} x1={px + 430} y0={y - 230} y1={y + 230} z0={g.height + 250} z1={g.height + 330} material={surfaceMaterial("concrete", "#bdb8ae")} />
        </group>
      ))}
      {/* Frame + vertical bars with a solid lower panel: a typical steel gate */}
      <Box x0={g.a.x + 200} x1={g.b.x - 200} y0={y - 30} y1={y + 30} z0={60} z1={140} material={steel} />
      <Box x0={g.a.x + 200} x1={g.b.x - 200} y0={y - 30} y1={y + 30} z0={g.height - 80} z1={g.height} material={steel} />
      <Box x0={g.a.x + 200} x1={g.b.x - 200} y0={y - 15} y1={y + 15} z0={140} z1={Math.min(1000, g.height * 0.45)} material={steel} />
      {Array.from({ length: Math.max(0, bars) }, (_, k) => {
        const bx = g.a.x + 270 + k * 140;
        return <Box key={k} x0={bx} x1={bx + 30} y0={y - 15} y1={y + 15} z0={Math.min(1000, g.height * 0.45)} z1={g.height - 80} material={steel} castShadow={false} />;
      })}
      {g.kind === "vehicle" && len > 3000 && <Box x0={g.a.x + len / 2 - 25} x1={g.a.x + len / 2 + 25} y0={y - 35} y1={y + 35} z0={60} z1={g.height} material={steel} />}
    </group>
  );
}

function BoundarySegment({ seg, structure, looks }: { seg: SiteGeom["boundary"][number]; structure: boolean; looks: MaterialLooks }) {
  const horizontal = seg.a.y === seg.b.y;
  const x0 = Math.min(seg.a.x, seg.b.x) - (horizontal ? 0 : seg.thickness / 2);
  const x1 = Math.max(seg.a.x, seg.b.x) + (horizontal ? 0 : seg.thickness / 2);
  const y0 = Math.min(seg.a.y, seg.b.y) - (horizontal ? seg.thickness / 2 : 0);
  const y1 = Math.max(seg.a.y, seg.b.y) + (horizontal ? seg.thickness / 2 : 0);
  const ext = looks.exterior_finish ?? { color: "#d8d2c6", texture: "render" as const };
  if (seg.kind === "hedge") return <Box x0={x0} x1={x1} y0={y0} y1={y1} z0={0} z1={seg.height} material={structure ? surfaceMaterial("gravel", "#9a8a72") : surfaceMaterial("grass", "#3f6b34", { roughness: 1 })} />;
  if (seg.kind === "fence") {
    const len = Math.max(x1 - x0, y1 - y0);
    const posts = Math.floor(len / 2400);
    const wood = structure ? surfaceMaterial("concrete", "#a8a59e") : surfaceMaterial("wood", "#8a6a4d");
    return (
      <group>
        <Box x0={x0} x1={x1} y0={y0} y1={y1} z0={0} z1={seg.height} material={wood} />
        {Array.from({ length: posts + 1 }, (_, k) => {
          const f = Math.min(len - 100, k * 2400);
          const cx = horizontal ? x0 + f : (x0 + x1) / 2, cy = horizontal ? (y0 + y1) / 2 : y0 + f;
          return <Box key={k} x0={cx - 50} x1={cx + 50} y0={cy - 50} y1={cy + 50} z0={0} z1={seg.height + 60} material={wood} />;
        })}
      </group>
    );
  }
  // Masonry boundary: wall + coping, with piers every ~3 m on tall runs.
  const wallMat = structure ? surfaceMaterial("concrete", "#b5b2ab") : surfaceMaterial(ext.texture === "brick" ? "brick" : "render", ext.texture === "brick" ? ext.color : "#e2ddd3");
  const len = Math.max(x1 - x0, y1 - y0);
  const piers = seg.height > 1500 ? Math.floor(len / 3000) : 0;
  return (
    <group>
      <Box x0={x0} x1={x1} y0={y0} y1={y1} z0={0} z1={seg.height} material={wallMat} />
      {!structure && <Box x0={x0 - 40} x1={x1 + 40} y0={y0 - 40} y1={y1 + 40} z0={seg.height} z1={seg.height + 80} material={surfaceMaterial("concrete", "#bdb8ae")} />}
      {!structure && <Box x0={x0 - 20} x1={x1 + 20} y0={y0 - 20} y1={y1 + 20} z0={0} z1={150} material={surfaceMaterial("concrete", "#9d998f")} castShadow={false} />}
      {!structure && Array.from({ length: piers }, (_, k) => {
        const f = (k + 1) * (len / (piers + 1));
        const cx = horizontal ? x0 + f : (x0 + x1) / 2, cy = horizontal ? (y0 + y1) / 2 : y0 + f;
        return <Box key={k} x0={cx - 175} x1={cx + 175} y0={cy - 175} y1={cy + 175} z0={0} z1={seg.height + 150} material={wallMat} />;
      })}
    </group>
  );
}

/** Carport: steel posts and edge beams with a flat sheet roof, sized and placed by the model. */
function Carport({ carport: c }: { carport: NonNullable<SiteGeom["carports"]>[number] }) {
  const steel = plainMaterial("#3a3e42", { metalness: 0.6, roughness: 0.4 });
  const sheet = surfaceMaterial("metal_sheet", "#d9d6cf", { side: THREE.DoubleSide });
  const z = c.height;
  return (
    <group>
      {c.posts.map((p, i) => <Box key={i} x0={p.x - 60} x1={p.x + 60} y0={p.y - 60} y1={p.y + 60} z0={0} z1={z} material={steel} />)}
      <Box x0={c.x} x1={c.x + c.width} y0={c.y} y1={c.y + 150} z0={z} z1={z + 250} material={steel} />
      <Box x0={c.x} x1={c.x + c.width} y0={c.y + c.depth - 150} y1={c.y + c.depth} z0={z} z1={z + 250} material={steel} />
      <Box x0={c.x - 150} x1={c.x + c.width + 150} y0={c.y - 150} y1={c.y + c.depth + 150} z0={z + 250} z1={z + 330} material={sheet} />
    </group>
  );
}

function WaterTank({ r }: { r: SiteGeom["services"][number] }) {
  if (r.placement === "underground") {
    // Only the access slab and covers show above ground.
    return (
      <group>
        <Box x0={r.x} x1={r.x + r.width} y0={r.y} y1={r.y + r.depth} z0={0} z1={r.h} material={surfaceMaterial("concrete", "#b7b2a8")} castShadow={false} />
        {[0.3, 0.7].map((f, i) => (
          <Box key={i} x0={r.x + r.width * f - 300} x1={r.x + r.width * f + 300} y0={r.y + r.depth / 2 - 300} y1={r.y + r.depth / 2 + 300} z0={r.h} z1={r.h + 20} material={plainMaterial("#4b4f53", { metalness: 0.5, roughness: 0.5 })} castShadow={false} />
        ))}
      </group>
    );
  }
  if (r.placement === "roof") {
    // Sectional panel tank on a steel skid; panel joints every 1 m.
    const z = r.z ?? 0;
    const panel = plainMaterial("#dcd9d2", { roughness: 0.6 });
    const joint = plainMaterial("#a9a69f", { roughness: 0.7 });
    return (
      <group>
        <Box x0={r.x - 100} x1={r.x + r.width + 100} y0={r.y - 100} y1={r.y + r.depth + 100} z0={z - 150} z1={z} material={plainMaterial("#5b6066", { metalness: 0.5 })} />
        <Box x0={r.x} x1={r.x + r.width} y0={r.y} y1={r.y + r.depth} z0={z} z1={z + r.h} material={panel} />
        {Array.from({ length: Math.floor(r.width / 1000) }, (_, i) => (
          <Box key={i} x0={r.x + (i + 1) * 1000 - 15} x1={r.x + (i + 1) * 1000 + 15} y0={r.y - 15} y1={r.y + r.depth + 15} z0={z} z1={z + r.h + 10} material={joint} castShadow={false} />
        ))}
      </group>
    );
  }
  const standH = r.h - 2400;
  const steel = plainMaterial("#5b6066", { metalness: 0.6, roughness: 0.45 });
  return (
    <group>
      {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, b], i) => (
        <Box key={i} x0={r.x + a * (r.width - 120)} x1={r.x + a * (r.width - 120) + 120} y0={r.y + b * (r.depth - 120)} y1={r.y + b * (r.depth - 120) + 120} z0={0} z1={standH} material={steel} />
      ))}
      <Box x0={r.x} x1={r.x + r.width} y0={r.y} y1={r.y + r.depth} z0={standH} z1={standH + 120} material={steel} />
      <mesh position={[m(r.x + r.width / 2), m(standH + 120 + 1100), -m(r.y + r.depth / 2)]} castShadow>
        <cylinderGeometry args={[m(Math.min(r.width, r.depth) * 0.42), m(Math.min(r.width, r.depth) * 0.45), 2.2, 24]} />
        <meshStandardMaterial color="#1e3a55" roughness={0.6} />
      </mesh>
    </group>
  );
}

function Tree({ tree, palette }: { tree: SiteGeom["trees"][number]; palette: (typeof PALETTE)[Palette] }) {
  const pos: [number, number, number] = [m(tree.x), 0, -m(tree.y)];
  const leaf = plainMaterial(tree.kind === "palm" ? "#4f7a3a" : palette.leaf[tree.kind === "shade" ? 0 : 1], { roughness: 0.9 });
  const leaf2 = plainMaterial(palette.leaf[2], { roughness: 0.9 });
  const bark = plainMaterial(tree.kind === "palm" ? "#8a7a5c" : "#5a4632", { roughness: 1 });
  const H = m(tree.height), R = m(tree.radius);
  if (tree.kind === "palm") {
    return (
      <group position={pos}>
        <mesh position={[0, H / 2, 0]} material={bark} castShadow><cylinderGeometry args={[0.12, 0.2, H, 8]} /></mesh>
        {Array.from({ length: 10 }, (_, k) => (
          <group key={k} position={[0, H - 0.1, 0]} rotation={[0, (k / 10) * Math.PI * 2, 0]}>
            <mesh position={[0.95, -0.15, 0]} rotation={[0, 0, -0.35 - (k % 3) * 0.12]} material={leaf} castShadow>
              <boxGeometry args={[2.0, 0.04, 0.45]} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }
  // Broadleaf: trunk + three overlapping crown masses read far better than one ball.
  return (
    <group position={pos}>
      <mesh position={[0, H * 0.3, 0]} material={bark} castShadow><cylinderGeometry args={[0.1, 0.18, H * 0.6, 8]} /></mesh>
      <mesh position={[0, H * 0.66, 0]} material={leaf} castShadow><icosahedronGeometry args={[R * 0.8, 1]} /></mesh>
      <mesh position={[R * 0.45, H * 0.58, R * 0.2]} material={leaf2} castShadow><icosahedronGeometry args={[R * 0.6, 1]} /></mesh>
      <mesh position={[-R * 0.4, H * 0.62, -R * 0.3]} material={leaf} castShadow><icosahedronGeometry args={[R * 0.62, 1]} /></mesh>
    </group>
  );
}
